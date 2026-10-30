import { spawn, exec, execSync, execFile, type ChildProcess } from "child_process";
import { promisify } from "util";
import path from "path";
import fs from "fs/promises";
import { db, deploymentsTable, botLogsTable, sessionBackupsTable } from "@workspace/db";
import { eq, and, desc } from "drizzle-orm";
import { logger } from "./logger";
import { ensureAccountCgroup, attachAccountProcess, accountStorageUsageBytes, refreshAccountQuota } from "./resourceManager";

/** Strip ANSI/VT100 escape codes so terminal colours show as plain text in the log viewer */
function stripAnsi(str: string): string {
  // Covers SGR (colour), cursor, erase, and other common escape sequences
  return str
    .replace(/\x1b\[[0-9;]*[mGKHJFABCDEFcsuSTrn]/g, "")
    .replace(/\x1b[()][0-9A-Za-z]/g, "")
    .replace(/\x1b[@-Z\\-_]/g, "")
    .replace(/[\x00-\x08\x0b\x0e-\x1f\x7f]/g, ""); // stray control chars
}

// Common setting keys that BERAHOST always tries to inject into a bot's
// SQLite settings DB (if the bot uses one). These cover the most common
// Baileys-based bot settings patterns.
const INJECTABLE_SETTINGS = ["OWNER_NUMBER", "PREFIX", "MODE", "BOT_NAME", "TIME_ZONE"];

// Common table + column name combinations used by WhatsApp bots for key-value settings.
const SETTINGS_TABLE_CANDIDATES = [
  { table: "bot_settings", keyCol: "key", valCol: "value" },
  { table: "settings",     keyCol: "key", valCol: "value" },
  { table: "config",       keyCol: "key", valCol: "value" },
];

// ─── Baileys Full-Session Save / Restore ────────────────────────────────────
// Standard @whiskeysockets/baileys (and all its forks) persists auth state as
// a directory of JSON files written by useMultiFileAuthState:
//   creds.json          — long-term identity keypair
//   pre-key-{n}.json    — one-time pre-keys (100+ files)
//   sender-key-{...}    — group sender-key records
//   app-state-sync-*    — app-state sync metadata
//
// BeraHost previously only restored creds.json on restart, leaving the bot
// without pre-keys and sender-keys.  WhatsApp then sees new pre-keys on every
// reconnect and old messages are undecryptable → messages.upsert never fires.
//
// Fix: save the ENTIRE session directory to the DB on shutdown / crash, and
// restore ALL files before the bot starts.
// ─────────────────────────────────────────────────────────────────────────────

const SESSION_SKIP_DIRS = new Set(["node_modules", ".git", ".pm2", ".npm", ".cache"]);

/** Recursively find every directory that contains a creds.json (up to depth 5). */
async function findBaileysAuthDirs(dir: string, depth = 0): Promise<string[]> {
  if (depth > 5) return [];
  const results: string[] = [];
  let entries: import("fs").Dirent[];
  try { entries = await fs.readdir(dir, { withFileTypes: true }); } catch { return results; }

  const hasCreds = entries.some(e => e.isFile() && e.name === "creds.json");
  if (hasCreds) results.push(dir);

  for (const e of entries) {
    if (!e.isDirectory() || SESSION_SKIP_DIRS.has(e.name)) continue;
    const sub = await findBaileysAuthDirs(path.join(dir, e.name), depth + 1);
    results.push(...sub);
  }
  return results;
}

/**
 * Read every file inside a Baileys auth directory and return a
 * { relativePath → base64 } map.  Files > 512 KB are skipped (not
 * produced by Baileys under normal operation).
 */
async function readAuthDirToArchive(
  authDir: string,
  deployPath: string,
): Promise<Record<string, string>> {
  const archive: Record<string, string> = {};
  let entries: import("fs").Dirent[];
  try { entries = await fs.readdir(authDir, { withFileTypes: true }); } catch { return archive; }

  for (const e of entries) {
    if (!e.isFile()) continue;
    const fullPath = path.join(authDir, e.name);
    try {
      const stat = await fs.stat(fullPath);
      if (stat.size > 512 * 1024) continue;
      const buf = await fs.readFile(fullPath);
      archive[path.relative(deployPath, fullPath)] = buf.toString("base64");
    } catch { /* skip unreadable */ }
  }
  return archive;
}

/**
 * Scan the deployment directory for Baileys session files and persist the
 * full archive to the DB, replacing the previous active backup.
 */
async function saveSessionState(deploymentId: number, deployPath: string): Promise<void> {
  try {
    const authDirs = await findBaileysAuthDirs(deployPath);
    if (authDirs.length === 0) return; // no Baileys session here

    // Build the combined file archive
    const files: Record<string, string> = {};
    for (const dir of authDirs) {
      Object.assign(files, await readAuthDirToArchive(dir, deployPath));
    }
    if (Object.keys(files).length === 0) return;

    const [dep] = await db
      .select({ userId: deploymentsTable.userId })
      .from(deploymentsTable)
      .where(eq(deploymentsTable.id, deploymentId));
    if (!dep) return;

    // Deactivate previous backups for this deployment
    await db
      .update(sessionBackupsTable)
      .set({ isActive: false })
      .where(eq(sessionBackupsTable.deploymentId, deploymentId));

    // Insert fresh backup
    await db.insert(sessionBackupsTable).values({
      deploymentId,
      userId: dep.userId,
      sessionData: JSON.stringify({ files, savedAt: new Date().toISOString() }),
      sessionLabel: `auto-${new Date().toISOString()}`,
      isActive: true,
    });

    logger.info({ deploymentId, fileCount: Object.keys(files).length }, "[BERAHOST] Full Baileys session saved to DB");
  } catch (err) {
    logger.error({ err, deploymentId }, "[BERAHOST] Failed to save Baileys session state");
  }
}

/**
 * Restore the full Baileys session archive from DB into the deploy directory.
 * Called BEFORE the bot starts so it has all pre-keys and sender-keys
 * available from the very first connection.
 *
 * Returns true if files were restored, false if no backup was found.
 */
async function restoreSessionState(deploymentId: number, deployPath: string): Promise<boolean> {
  try {
    const [backup] = await db
      .select({ sessionData: sessionBackupsTable.sessionData })
      .from(sessionBackupsTable)
      .where(
        and(
          eq(sessionBackupsTable.deploymentId, deploymentId),
          eq(sessionBackupsTable.isActive, true),
        )
      )
      .orderBy(desc(sessionBackupsTable.createdAt))
      .limit(1);

    if (!backup) return false;

    let archive: { files?: Record<string, string> };
    try { archive = JSON.parse(backup.sessionData); } catch { return false; }
    if (!archive.files || Object.keys(archive.files).length === 0) return false;

    let restoredCount = 0;
    for (const [relPath, b64] of Object.entries(archive.files)) {
      const fullPath = path.join(deployPath, relPath);
      await fs.mkdir(path.dirname(fullPath), { recursive: true });
      await fs.writeFile(fullPath, Buffer.from(b64, "base64"));
      restoredCount++;
    }

    logger.info({ deploymentId, restoredCount }, "[BERAHOST] Full Baileys session restored from DB");
    return true;
  } catch (err) {
    logger.error({ err, deploymentId }, "[BERAHOST] Failed to restore Baileys session state");
    return false;
  }
}

/**
 * Generic bot settings injector.
 *
 * After a bot creates its own SQLite settings DB (typically during its first
 * startup via a "findOrCreate"-style initializer), BERAHOST overwrites the
 * keys that the user configured in the deployment form.  This ensures that
 * OWNER_NUMBER, PREFIX, MODE, etc. come from our platform rather than the
 * bot's hardcoded defaults — without requiring a bot restart.
 *
 * Works for any bot that:
 *   a) stores settings in a SQLite DB with a key-value table, AND
 *   b) re-reads those settings from the DB per-message (most Baileys bots do).
 *
 * For bots that read settings purely from process.env / .env file, the
 * standard .env write in startBotProcess() already handles them — this
 * function just silently no-ops.
 *
 * @param sqlitePaths - relative paths (from deployPath) to candidate SQLite DBs
 */
async function injectBotSettings(
  deploymentId: number,
  deployPath: string,
  envVars: Record<string, string>,
  sqlitePaths: string[]
): Promise<void> {
  // Build the map of settings we want to inject (only non-empty values)
  const settingsToSync: Record<string, string> = {};
  for (const key of INJECTABLE_SETTINGS) {
    if (envVars[key]) settingsToSync[key] = envVars[key];
  }
  if (Object.keys(settingsToSync).length === 0) return;

  // Also scan for any .db files we weren't told about (generic fallback)
  const allPaths = new Set(sqlitePaths);
  try {
    const scanDirs = [".", "database", "db", "data", "gift/database", "store"];
    for (const dir of scanDirs) {
      const dirPath = path.join(deployPath, dir);
      try {
        const files = await fs.readdir(dirPath);
        for (const f of files) {
          if (f.endsWith(".db")) allPaths.add(path.join(dir, f));
        }
      } catch { /* dir doesn't exist — skip */ }
    }
  } catch { /* scan failed — use only the explicit paths */ }

  const betterSqlitePath = path.join(deployPath, "node_modules/better-sqlite3");
  let injectedInto: string[] = [];

  for (const relPath of allPaths) {
    const dbPath = path.join(deployPath, relPath);
    try {
      await fs.access(dbPath);
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const Database = require(betterSqlitePath);
      const botDb = new Database(dbPath);

      // Find which table/column pattern this DB uses
      const tables: { name: string }[] = botDb
        .prepare("SELECT name FROM sqlite_master WHERE type='table'")
        .all();
      const tableNames = tables.map((t) => t.name);

      let injectedCount = 0;
      for (const { table, keyCol, valCol } of SETTINGS_TABLE_CANDIDATES) {
        if (!tableNames.includes(table)) continue;
        for (const [key, value] of Object.entries(settingsToSync)) {
          try {
            const result = botDb
              .prepare(`UPDATE ${table} SET ${valCol} = ? WHERE ${keyCol} = ?`)
              .run(value, key);
            if (result.changes > 0) injectedCount++;
          } catch { /* column names don't match this bot's schema */ }
        }
        if (injectedCount > 0) break; // found the right table
      }

      botDb.close();
      if (injectedCount > 0) injectedInto.push(relPath);
    } catch { /* DB doesn't exist yet or can't open — skip */ }
  }

  if (injectedInto.length > 0) {
    const keys = Object.keys(settingsToSync).join(", ");
    await emitLog(
      deploymentId,
      `[BERAHOST] ✓ Bot settings synced (${keys}) → ${injectedInto.join(", ")}`,
      "info"
    ).catch(() => {});
  }
}

const execAsync = promisify(exec);
const execFileAsync = promisify(execFile);

async function downloadGithubRepository(repoUrl: string, deployPath: string): Promise<void> {
  const match = repoUrl.match(/^https:\/\/github\.com\/([^/]+)\/([^/]+?)(?:\.git)?$/i);
  if (!match) throw new Error("Only public GitHub repositories are supported.");
  const owner = match[1];
  const repository = match[2];
  const metadataResponse = await fetch(`https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repository)}`, { headers: { "User-Agent": "BERAHOST-bot-deployer" } });
  if (!metadataResponse.ok) throw new Error("GitHub repository is not public or could not be found. Make the repository public or configure an authenticated GitHub deploy source.");
  const metadata = await metadataResponse.json() as { default_branch?: string };
  const branch = metadata.default_branch;
  if (!branch || !/^[A-Za-z0-9._/-]{1,120}$/.test(branch) || branch.includes("..")) throw new Error("GitHub repository has an invalid default branch.");
  const response = await fetch(`https://codeload.github.com/${encodeURIComponent(owner)}/${encodeURIComponent(repository)}/tar.gz/refs/heads/${encodeURIComponent(branch)}`);
  if (!response.ok) throw new Error(`GitHub repository download failed (${response.status}). Check that the repository and default branch are public and valid.`);
  await fs.mkdir(deployPath, { recursive: true });
  const archive = path.join(deployPath, ".github-source.tar.gz");
  await fs.writeFile(archive, Buffer.from(await response.arrayBuffer()));
  await execFileAsync("tar", ["-xzf", archive, "-C", deployPath, "--strip-components=1"], { timeout: 5 * 60 * 1000, maxBuffer: 2 * 1024 * 1024 });
  await fs.rm(archive, { force: true });
}

// In-memory map of running processes
export const runningProcesses = new Map<number, ChildProcess>();

/**
 * Write a line of text to a running bot's stdin.
 * This is how users answer prompts like "Enter your phone number:" directly
 * from the BERAHOST terminal console — the input is piped into the child process
 * as if the user had typed it in a real terminal.
 *
 * Returns true if the input was delivered, false if the process is not running
 * or has no stdin (e.g. it was spawned with stdio:'ignore').
 */
export function sendStdin(deploymentId: number, input: string): boolean {
  const proc = runningProcesses.get(deploymentId);
  if (!proc || !proc.stdin || proc.stdin.destroyed) return false;
  try {
    // Append a newline so the child's readline/readlineSync sees a complete line
    proc.stdin.write(input.endsWith("\n") ? input : `${input}\n`);
    return true;
  } catch {
    return false;
  }
}

// Track deployments that were intentionally stopped by a user or admin.
// Any exit NOT in this set is treated as unexpected → triggers auto-restart.
const intentionallyStopped = new Set<number>();
const quotaStopped = new Set<number>();
const monitoredAccounts = new Map<number, NodeJS.Timeout>();
const quotaBlockedAccounts = new Set<number>();
async function monitorAccountStorage(userId: number): Promise<void> {
  if (monitoredAccounts.has(userId)) return;
  const timer = setInterval(async () => {
    try {
      const rows = await db.select({ id: deploymentsTable.id }).from(deploymentsTable).where(eq(deploymentsTable.userId, userId));
      const activeRows = rows.filter((row) => {
        const proc = runningProcesses.get(row.id);
        return proc && proc.exitCode === null && proc.signalCode === null;
      });
      if (activeRows.length === 0) {
        clearInterval(timer);
        monitoredAccounts.delete(userId);
        return;
      }
      const quota = await refreshAccountQuota(userId);
      if (!quota.exceeded) { quotaBlockedAccounts.delete(userId); return; }
      quotaBlockedAccounts.add(userId);
      for (const row of activeRows) {
        const proc = runningProcesses.get(row.id); if (!proc) continue;
        quotaStopped.add(row.id);
        clearWatchdog(row.id);
        await emitLog(row.id, `[BERAHOST] ERROR: Shared account storage quota exceeded (${(quota.usedBytes / 1048576).toFixed(1)} MB / ${(quota.limitBytes / 1048576).toFixed(0)} MB). Workload stopped; remove files before restarting.`, "error").catch(() => {});
        try { if (proc.pid) process.kill(-proc.pid, "SIGTERM"); else proc.kill("SIGTERM"); } catch { try { proc.kill("SIGTERM"); } catch {} }
        const hardStop = setTimeout(() => { if (proc.exitCode === null && !proc.signalCode) try { if (proc.pid) process.kill(-proc.pid, "SIGKILL"); else proc.kill("SIGKILL"); } catch {} }, 5000); hardStop.unref();
        await db.update(deploymentsTable).set({ status: "stopped", pid: null, updatedAt: new Date() }).where(eq(deploymentsTable.id, row.id)).catch(() => {});
      }
    } catch (err) {
      logger.error({ err, userId }, "Account storage measurement failed; stopping account workloads fail-closed");
      quotaBlockedAccounts.add(userId);
      const rows = await db.select({ id: deploymentsTable.id }).from(deploymentsTable).where(eq(deploymentsTable.userId, userId)).catch(() => []);
      for (const row of rows) {
        const proc = runningProcesses.get(row.id); if (!proc) continue;
        quotaStopped.add(row.id); clearWatchdog(row.id);
        await emitLog(row.id, "[BERAHOST] ERROR: Shared storage usage could not be verified; workload stopped for quota safety.", "error").catch(() => {});
        try { if (proc.pid) process.kill(-proc.pid, "SIGTERM"); else proc.kill("SIGTERM"); } catch { try { proc.kill("SIGTERM"); } catch {} }
      }
    }
  }, 15000);
  timer.unref(); monitoredAccounts.set(userId, timer);
}

// Deployments where WhatsApp sent a "Connection Replaced" (error 440) in stdout.
// This means ANOTHER device/process logged in with the same session — auto-restarting
// would just ping-pong the 440 forever, so we skip the restart entirely.
const connectionReplacedIds = new Set<number>();

// Deployments that hit a known recoverable WhatsApp protocol error (e.g. AES-GCM
// auth failure during reconnection on Node.js 24 + gifted-baileys).  These are NOT
// real crashes — the bot's own reconnect attempt just failed cryptographically.
// The exit handler restarts them IMMEDIATELY with no backoff and without consuming
// one of the limited crash-restart attempts.
const forceRestartIds = new Set<number>();

// Deployments that crashed with EADDRINUSE (port already in use).
// The deterministic port allocator should prevent this, but it can still
// happen if an OS-level process (e.g. a zombie from a previous server run)
// is occupying the port.  On EADDRINUSE we kill that zombie with fuser and
// restart once — if it fails a second time, we give up.
const eaddrInUseIds = new Set<number>();

// Per-deployment timer handles for the restart-count reset.
// After a bot runs stably for 2 minutes we reset its crash counter.
const restartResetTimers = new Map<number, NodeJS.Timeout>();

// Per-deployment pending auto-restart timers (from crash backoff setTimeout).
// Stored so stopBotProcess can cancel them — otherwise a stop races with a
// queued restart and the bot comes back up immediately after being stopped.
const pendingRestartTimers = new Map<number, NodeJS.Timeout>();

// Stop requests that arrive while a deployment is still cloning/installing,
// before its child process has been registered in runningProcesses.
const stopRequested = new Set<number>();

// Per-deployment watchdog — DISABLED.
// Bots are only restarted when they actually crash (non-zero exit code).
// Killing for silence / idle / no-output during startup breaks pairing-code
// bots that wait quietly for the user to enter a code, and connected bots
// that are simply idle (no incoming messages).
//
// max_idle_time = 0  →  infinite (no idle kill)
// startup silence detection  →  disabled
// 20-minute force-kill rule  →  removed
const WATCHDOG_STARTUP_MS = 0; // 0 = disabled
const watchdogTimers       = new Map<number, NodeJS.Timeout>();
const connectedDeployments = new Set<number>(); // bots that have reached WhatsApp
const startingDeployments  = new Set<number>(); // guard: prevent concurrent spawns of same deploymentId

function resetWatchdog(_deploymentId: number, _proc: ChildProcess) {
  // Watchdog disabled — bots are never killed for being silent or idle.
  // They restart only on actual process exit (crash handler below).
}

function clearWatchdog(deploymentId: number) {
  const t = watchdogTimers.get(deploymentId);
  if (t) { clearTimeout(t); watchdogTimers.delete(deploymentId); }
}

// ─── Port Allocator ─────────────────────────────────────────────────────────
// Each bot gets its own DETERMINISTIC port derived from its deployment ID.
// Formula: PORT_START + deploymentId  (e.g. dep 4 → 3104, dep 22 → 3122)
//
// WHY deterministic instead of "lowest free slot":
//   The sequential approach had a race condition: during server restores,
//   multiple startBotProcess calls run concurrently (async await gaps between
//   git fetch and allocatePort).  Two deployments could both see an empty
//   allocatedPorts Map and pick the same port → EADDRINUSE crash loop.
//
//   With a derivation formula, two different deploymentIds can NEVER produce
//   the same port (as long as deploymentIds don't differ by PORT_RANGE, which
//   is 5000 slots — far beyond any realistic usage).
//
//   Bonus: the same port is always assigned to the same deployment even across
//   server restarts, so `fuser -k` (see below) reliably cleans up zombies.
const PORT_START  = 3100;
const PORT_RANGE  = 5000; // dep_0 → 3100, dep_4999 → 8099 (non-overlapping with system ports)
const allocatedPorts = new Map<number, number>(); // deploymentId → port

function allocatePort(deploymentId: number): number {
  // Always use the same formula — idempotent across restarts.
  const port = PORT_START + (deploymentId % PORT_RANGE);
  allocatedPorts.set(deploymentId, port);
  return port;
}

function releasePort(deploymentId: number): void {
  allocatedPorts.delete(deploymentId);
}

/** How many bots can currently run given the port pool */
export function availableSlots(): number {
  return PORT_RANGE - allocatedPorts.size;
}
// ────────────────────────────────────────────────────────────────────────────

// Socket.io emitter (set after app init)
let ioEmitter: ((deploymentId: number, line: string, logType: string) => void) | null = null;

export function setIoEmitter(fn: (deploymentId: number, line: string, logType: string) => void) {
  ioEmitter = fn;
}

// User crash-alert emitter — fires when a bot crashes unexpectedly
let userAlertEmitter: ((userId: number, deploymentId: number, customName: string | null) => Promise<void>) | null = null;

export function setUserAlertEmitter(fn: (userId: number, deploymentId: number, customName: string | null) => Promise<void>) {
  userAlertEmitter = fn;
}

// ─── Pairing Code Detection ───────────────────────────────────────────────────
// When a bot has no session it enters pairing code mode. The bot logs a
// pairing code like: "PAIRING CODE: ABCD-EFGH-IJKL-MNOP"
// BeraHost detects this in stdout and emits a dedicated socket event so the
// frontend can display it prominently without the user hunting through logs.
// ─────────────────────────────────────────────────────────────────────────────

interface PairingCodeEntry {
  code:        string;
  phone:       string;
  detectedAt:  Date;
}

// In-memory store — codes are ephemeral (only needed until the user enters them)
export const pairingCodes = new Map<number, PairingCodeEntry>();

let pairingCodeEmitter: ((deploymentId: number, entry: PairingCodeEntry) => void) | null = null;

export function setPairingCodeEmitter(fn: (deploymentId: number, entry: PairingCodeEntry) => void) {
  pairingCodeEmitter = fn;
}

export function getPairingCode(deploymentId: number): PairingCodeEntry | null {
  return pairingCodes.get(deploymentId) ?? null;
}

export function clearPairingCode(deploymentId: number): void {
  pairingCodes.delete(deploymentId);
}

// Regex: matches Baileys pairing codes in both formats:
//   8-char:  "XXXX-XXXX"        (toxic-baileys / newer baileys forks)
//   16-char: "XXXX-XXXX-XXXX-XXXX"  (standard @whiskeysockets/baileys)
// Separators can be dashes or spaces.
const PAIRING_CODE_RE = /([A-Z0-9]{4}[-\s][A-Z0-9]{4}(?:[-\s][A-Z0-9]{4}[-\s][A-Z0-9]{4})?)\b/i;

async function emitLog(deploymentId: number, line: string, logType: string) {
  await db.insert(botLogsTable).values({
    deploymentId,
    logLine: line.trim(),
    logType,
  });

  if (ioEmitter) {
    ioEmitter(deploymentId, line, logType);
  }
}

/**
 * Determine the best command to start the bot.
 *
 * BERAHOST needs to OWN the process lifecycle — it must be the direct parent
 * of the bot process so it can stream stdout/stderr, detect crashes, and
 * trigger auto-restarts.  That rules out any start method that forks into
 * the background (PM2, forever, nohup, etc.).
 *
 * Rules, applied in order:
 *
 * 1. PM2 in start script → extract the JS entry file from the pm2 command
 *    and run it directly with Node.  Preserves any Node.js flags (e.g.
 *    --experimental-specifier-resolution, --max-old-space-size).
 *
 * 2. ecosystem.config.js / ecosystem.config.cjs present → same treatment.
 *    PM2 ecosystem files are a common alternative to inline start scripts.
 *
 * 3. Forever / nohup / nodemon in start script → replace with plain Node.
 *
 * 4. Bare `node <file>` or `node <flags> <file>` → use as-is (safe).
 *
 * 5. Fallback → `npm start` (runs the script in package.json as-is).
 *
 * Flash-MD note: Flash-MD's start script is typically:
 *   "start": "node --loader ./preload.js index.js"
 * This falls through to rule 4 (bare node) and is used verbatim — ✓
 *
 * Atassa-MD note: start script is:
 *   "start": "pm2 start index.js --deep-monitoring --attach --name atassamd"
 * Rule 1 applies → returns "node ./index.js" — ✓
 */
async function resolveStartCommand(deployPath: string): Promise<string> {
  try {
    const pkgRaw = await fs.readFile(path.join(deployPath, "package.json"), "utf8");
    const pkg = JSON.parse(pkgRaw);
    const startScript: string = pkg.scripts?.start ?? "";
    const mainFile: string = pkg.main ?? "index.js";

    const scriptLower = startScript.toLowerCase();

    // ── Rule 1 & 2: PM2 in start script or ecosystem config present ──────────
    const hasEcosystemFile = await fs.access(path.join(deployPath, "ecosystem.config.js"))
      .then(() => true).catch(() => false)
      || await fs.access(path.join(deployPath, "ecosystem.config.cjs"))
        .then(() => true).catch(() => false);

    if (scriptLower.includes("pm2") || hasEcosystemFile) {
      // Try to extract the main JS file and any Node.js flags from the pm2 command.
      // Handles:  pm2 start index.js --name foo
      //           pm2-runtime start --name foo index.js
      //           pm2 start --max-old-space-size=1024 index.js
      const jsFileMatch = startScript.match(/(?:pm2(?:-runtime)?[^;]*?\s)([\w./]+\.(?:js|mjs|cjs))/i);
      const entryFile = jsFileMatch ? jsFileMatch[1] : mainFile;

      // Extract any valid Node.js flags from the pm2 command so we don't lose them.
      // Examples: --max-old-space-size=4096, --experimental-specifier-resolution=node
      const nodeFlagPattern = /(--(?:max-old-space-size|max-semi-space-size|experimental-specifier-resolution|experimental-modules|expose-gc|no-warnings|enable-source-maps|require|loader|input-type|experimental-vm-modules)[=\w/.-]*)/g;
      const nodeFlags = [...startScript.matchAll(nodeFlagPattern)].map(m => m[1]).join(" ");

      const cmd = nodeFlags
        ? `node ${nodeFlags} ${entryFile}`
        : `node ${entryFile}`;

      logger.info({ deployPath, entryFile, nodeFlags, cmd }, "PM2/ecosystem detected — running node directly");
      return cmd;
    }

    // ── Rule 3: forever / nohup / nodemon ────────────────────────────────────
    if (scriptLower.includes("forever") || scriptLower.includes("nohup") || scriptLower.includes("nodemon")) {
      logger.info({ deployPath, mainFile }, "Background runner detected — running node directly");
      return `node ${mainFile}`;
    }

    // ── Rule 4: bare node command → use as-is ─────────────────────────────────
    // Covers: "node index.js", "node --loader ./preload.js index.js", etc.
    if (scriptLower.startsWith("node ") || startScript.trim() === "node") {
      logger.info({ deployPath, startScript }, "Bare node command — using npm start (runs script verbatim)");
      return "npm start";
    }

    // ── Rule 5: fallback ─────────────────────────────────────────────────────
    return "npm start";
  } catch {
    return "npm start";
  }
}

export async function startBotProcess(
  deploymentId: number,
  repoUrl: string,
  envVars: Record<string, string>
): Promise<{ pid: number }> {
  const deployPath = `/tmp/berahost_dep_${deploymentId}`;
  const [accountDeployment] = await db.select({ userId: deploymentsTable.userId }).from(deploymentsTable).where(eq(deploymentsTable.id, deploymentId));
  if (!accountDeployment) throw new Error("Bot deployment owner was not found.");
  const accountLimits = await ensureAccountCgroup(accountDeployment.userId);
  const checkAccountStorage = async () => {
    if (accountLimits.isAdmin) return;
    const used = await accountStorageUsageBytes(accountDeployment.userId, true);
    if (used > accountLimits.storageMb * 1024 * 1024) { quotaBlockedAccounts.add(accountDeployment.userId); throw new Error(`Account storage quota exceeded (${(used / 1048576).toFixed(1)} MB used of ${accountLimits.storageMb} MB). Remove files manually before starting this workload.`); }
    quotaBlockedAccounts.delete(accountDeployment.userId);
  };
  await checkAccountStorage();

  // Double-deploy guard: if this deploymentId is already being started, skip silently.
  // This prevents the user clicking Deploy twice or auto-restart racing with a manual start.
  if (startingDeployments.has(deploymentId)) {
    logger.warn({ deploymentId }, "[BERAHOST] startBotProcess called while already starting — skipping duplicate spawn");
    return { pid: -1 };
  }
  startingDeployments.add(deploymentId);

  const existingProcess = runningProcesses.get(deploymentId);
  if (existingProcess && existingProcess.exitCode === null && existingProcess.signalCode === null) {
    startingDeployments.delete(deploymentId);
    await emitLog(deploymentId, `[BERAHOST] Start skipped: this bot already has a live process (PID ${existingProcess.pid ?? "unknown"}).`, "warn").catch(() => {});
    return { pid: existingProcess.pid ?? -1 };
  }

  // Clear intentional-stop flag so this fresh start is tracked
  intentionallyStopped.delete(deploymentId);
  stopRequested.delete(deploymentId);

  // Update status to deploying
  await db
    .update(deploymentsTable)
    .set({ status: "deploying", updatedAt: new Date() })
    .where(eq(deploymentsTable.id, deploymentId));

  await emitLog(deploymentId, `[BERAHOST] Deploying bot...`, "info");

  try {
    // Clone or update repo.
    // Always use --depth=1 (shallow) so we only fetch the latest commit — large bots
    // like Atassa-MD have hundreds of MB of history that cause timeouts on production.
    try {
      await fs.access(deployPath);
      await emitLog(deploymentId, `[BERAHOST] Updating existing code...`, "info");
      // fetch + reset instead of pull so we always get the latest regardless of local state
      await execAsync(
        `git -C ${deployPath} fetch --depth=1 origin && git -C ${deployPath} reset --hard origin/HEAD`,
        { timeout: 180_000 }  // 3 min
      );
    } catch (gitUpdateErr) {
      // git fetch/reset failed — do a fresh clone.
      // Must remove the existing directory first, or git clone will refuse to
      // write into a non-empty path ("destination path already exists").
      await emitLog(deploymentId, `[BERAHOST] Cloning repository (shallow)...`, "info");
      try {
        await fs.rm(deployPath, { recursive: true, force: true });
      } catch { /* ignore — directory may not exist */ }
      await downloadGithubRepository(repoUrl, deployPath);
    }

    // ─── Restore full Baileys session from DB ─────────────────────────────────
    // Restores ALL files in the auth directory (creds.json + pre-key-*.json +
    // sender-key-*.json + app-state-sync-*.json) so the bot never re-registers
    // new pre-keys on restart and messages.upsert continues to fire correctly.
    // On the very first deploy (no DB backup yet) this is a no-op — the bot
    // uses its built-in SESSION_ID restore instead.
    const sessionRestored = await restoreSessionState(deploymentId, deployPath);
    if (sessionRestored) {
      await emitLog(
        deploymentId,
        `[BERAHOST] Full session restored (creds + pre-keys + sender-keys).`,
        "info"
      );
    }

    // Assign a collision-free port from the pool (3100-5999 = 2900 slots)
    const botPort = allocatePort(deploymentId);

    // Write .env file so the bot and any child process managers can read it
    const envContent = Object.entries({ ...envVars, PORT: String(botPort) })
      .map(([k, v]) => `${k}=${v}`)
      .join("\n");
    await fs.writeFile(path.join(deployPath, ".env"), envContent);

    // Kill any stale PM2 daemon from a previous run (old default PM2 home)
    // This prevents WhatsApp session conflicts when a bot is restarted
    try {
      const homePm2 = path.join(process.env["HOME"] ?? "/root", ".pm2");
      await execAsync(`PM2_HOME=${homePm2} pm2 kill`, { timeout: 10000 });
    } catch { /* no daemon running — ignore */ }

    // Also clean up the deployment-local PM2 home so it starts fresh
    await fs.rm(path.join(deployPath, ".pm2"), { recursive: true, force: true });

    // Determine the correct start command (bypass PM2 daemonization)
    const startCmd = await resolveStartCommand(deployPath);
    await emitLog(deploymentId, `[BERAHOST] Starting bot (${startCmd})...`, "info");

    // Load bot metadata so we can validate SESSION_ID prefix and know which
    // SQLite paths to inject settings into after the bot initialises.
    const { botsTable } = await import("@workspace/db");
    const [depInfo] = await db
      .select({
        botId:              deploymentsTable.botId,
      })
      .from(deploymentsTable)
      .where(eq(deploymentsTable.id, deploymentId));

    const [botMeta] = depInfo?.botId
      ? await db
          .select({
            sessionPrefix:      botsTable.sessionPrefix,
            sqliteSettingsPaths: botsTable.sqliteSettingsPaths,
            installPackages: botsTable.installPackages,
            name:               botsTable.name,
          })
          .from(botsTable)
          .where(eq(botsTable.id, depInfo.botId))
      : [null];

    const sessionPrefix      = (botMeta as any)?.sessionPrefix as string | null | undefined;
    const sqliteSettingsPaths = ((botMeta as any)?.sqliteSettingsPaths as string[] | null) ?? [];
    const botName             = (botMeta as any)?.name as string | undefined;
    const installPackages = Array.isArray((botMeta as any)?.installPackages) ? (botMeta as any).installPackages.filter((value: unknown) => typeof value === "string" && /^[A-Za-z0-9@/_:.+-]+$/.test(value)).join(" ") : "";
    if (installPackages) {
      await emitLog(deploymentId, `[BERAHOST] Installing template packages: ${installPackages}`, "info");
      await execAsync(`npm_config_registry=https://registry.npmjs.org npm install --legacy-peer-deps --no-save --no-audit --no-fund ${installPackages}`, { cwd: deployPath, timeout: 15 * 60 * 1000, maxBuffer: 8 * 1024 * 1024 });
    }

    // Session prefix check — only warn when the bot declares a required prefix
    // AND the session ID doesn't start with it.
    // Checks both SESSION_ID (Atassa-MD, Wolf) and SESSION (Flash-MD V2)
    // so that bots using either convention get validated.
    const sessionId = envVars["SESSION_ID"] || envVars["SESSION"] || "";
    if (sessionId && sessionPrefix && !sessionId.startsWith(sessionPrefix)) {
      await emitLog(
        deploymentId,
        `[BERAHOST] ⚠ WARNING: Session ID must start with "${sessionPrefix}" for ${botName ?? "this bot"}. ` +
        `The bot may connect to WhatsApp but ignore all commands. ` +
        `Go to Config tab → paste the correct session ID → save → restart.`,
        "warn"
      );
    }

    // ─── node_modules cache ────────────────────────────────────────────────
    // Reusing the previous deployment's node_modules via hard links (cp -al)
    // means subsequent deploys of the same bot skip the full npm download.
    // Hard links inside /tmp are instantaneous — no actual data copy, just
    // new directory entries pointing to the same inodes.
    const cacheKey = `bot_${depInfo?.botId ?? "0"}`;
    const nmCacheDir = `/tmp/berahost_nm_cache/${cacheKey}`;
    // When the node_modules cache is present we restore it via hard links (instant)
    // and then run `npm install --prefer-offline --ignore-scripts`.
    // The --ignore-scripts flag is critical: native modules like better-sqlite3 and
    // sharp store their prebuilt binaries inside node_modules.  When the cache is
    // already intact those binaries are there — running the postinstall scripts
    // again tries to recompile from source and often fails (missing detect-libc,
    // node-gyp errors, etc.).  Skipping scripts is safe because the binaries are
    // already compiled and present from the first install.
    //
    // On a FIRST install (no cache) we do NOT skip scripts — native modules need
    // their postinstall steps to download/compile the correct binary for this host.
    const nmCacheSetup = [
      `BERAHOST_CACHE_HIT=0`,
      `if [ -d "${nmCacheDir}" ]; then`,
      `  echo "[BERAHOST] Restoring node_modules from cache (${cacheKey})..."`,
      `  cp -al "${nmCacheDir}" "${deployPath}/node_modules" 2>/dev/null || true`,
      `  BERAHOST_CACHE_HIT=1`,
      `fi`,
    ].join("\n");
    const nmCacheSave = [
      `echo "[BERAHOST] Updating node_modules cache..."`,
      `mkdir -p /tmp/berahost_nm_cache`,
      // Use a unique tmp name keyed by PID to avoid concurrent-restart mv collisions
      `BERAHOST_CACHE_TMP="${nmCacheDir}.$$.tmp"`,
      `rm -rf "$BERAHOST_CACHE_TMP"`,
      // Hard-link copy — fast but can be slow on large trees; print progress so watchdog stays alive
      `echo "[BERAHOST] Copying node_modules to cache (this may take a moment)..."`,
      `cp -al "${deployPath}/node_modules" "$BERAHOST_CACHE_TMP" 2>/dev/null`,
      `echo "[BERAHOST] Cache copy done, swapping..."`,
      `rm -rf "${nmCacheDir}.old" 2>/dev/null || true`,
      `[ -d "${nmCacheDir}" ] && mv "${nmCacheDir}" "${nmCacheDir}.old" 2>/dev/null || true`,
      `mv "$BERAHOST_CACHE_TMP" "${nmCacheDir}" 2>/dev/null && rm -rf "${nmCacheDir}.old" 2>/dev/null || true`,
      `echo "[BERAHOST] Cache updated."`,
    ].join("\n");
    // npm install command varies by whether the cache was hit.
    // After a cache-hit install we run a quick integrity check: try to load a
    // handful of common bot dependencies.  If any fail (e.g. fs-extra lib/
    // directory missing after a partial cache update), we wipe the bad cache
    // entry and do a fresh full install so the bot doesn't crash at startup
    // with MODULE_NOT_FOUND.
    // Common npm install environment variables applied to every install.
    // PUPPETEER_SKIP_DOWNLOAD / PUPPETEER_SKIP_CHROMIUM_DOWNLOAD:
    //   Flash-MD and a few other bots list puppeteer as a dependency.
    //   Puppeteer's postinstall script tries to download a 150-300 MB Chromium
    //   binary — this times out on production, fills disk, and isn't needed
    //   (the bots use puppeteer for lightweight scraping that works with
    //   --no-sandbox and a system Chromium if available).  Skipping the download
    //   lets the rest of the install complete in seconds.
    // PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD: same rationale for playwright.
    // NPM_CONFIG_OPTIONAL=false: prevents native optional deps (sharp, canvas)
    //   from aborting the install if they fail to compile.
    const npmInstallEnv =
      `PUPPETEER_SKIP_DOWNLOAD=true ` +
      `PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true ` +
      `PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 ` +
      `npm_config_optional=false ` +
      // Force public npm registry — Replit's package-firewall.replit.local proxy
      // only exists in the dev environment and causes EAI_AGAIN in production.
      `npm_config_registry=https://registry.npmjs.org `;

    // ─── npm install heartbeat ───────────────────────────────────────────────
    // npm is completely silent while downloading packages.  For bots with many
    // dependencies (e.g. Atassa-MD has ~600) a cold install takes 30-50 minutes.
    // Without output the watchdog fires and kills the process mid-install, which
    // leaves node_modules in a partial state (ENOTEMPTY on next run, EPIPE etc).
    //
    // Fix: run a background loop that prints a progress line every 60 s so the
    // watchdog always sees recent output and never fires during install.
    const heartbeatCmd = [
      `(__BH_HB_I=0; while true; do`,
      `  sleep 60`,
      `  __BH_HB_I=$((__BH_HB_I+1))`,
      `  echo "[BERAHOST] npm install still running... (\${__BH_HB_I} min elapsed)"`,
      `done) &`,
      `__BH_HB_PID=$!`,
    ].join("\n");
    const heartbeatStop = [
      `kill $__BH_HB_PID 2>/dev/null`,
      `wait $__BH_HB_PID 2>/dev/null || true`,
    ].join("\n");

    // Shell function that verifies sharp's native binary actually loads.
    // If it doesn't (missing/wrong-arch .node file), we delete the broken
    // binary and force-download the correct linux-x64 prebuilt directly via
    // npm run install inside the sharp package dir (triggers node-pre-gyp).
    // pnpm rebuild runs the "build" script (source compile) — NOT what we want.
    // npm run install inside the package dir runs the "install" lifecycle script
    // which calls node-pre-gyp to download the prebuilt binary from GitHub.
    const sharpFixFn = [
      `__bh_fix_sharp() {`,
      `  if node --input-type=commonjs -e "try{require('./node_modules/sharp');}catch(e){process.exit(1);}" 2>/dev/null; then`,
      `    echo "[BERAHOST] ./node_modules/sharp already working — skipping"`,
      `  else`,
      `    echo "[BERAHOST] sharp binary invalid or missing — reinstalling for linux-x64..."`,
      // Delete broken binary so node-pre-gyp doesn't skip the download
      `    find ./node_modules -path "*/sharp/build/Release/*.node" -delete 2>/dev/null || true`,
      `    SHARP_VERSION=$(node --input-type=commonjs -e "try{console.log(require('./node_modules/sharp/package.json').version);}catch(e){console.log('0.32.6');}" 2>/dev/null || echo "0.32.6")`,
      // Strategy 1: npm run install inside the sharp package dir — this runs
      // the "install" lifecycle script (node-pre-gyp download), NOT a source build.
      `    if [ -d "./node_modules/sharp" ]; then`,
      `      (cd ./node_modules/sharp && npm_config_platform=linux npm_config_arch=x64 npm_config_registry=https://registry.npmjs.org npm run install 2>/dev/null) || true`,
      `    fi`,
      // Strategy 2: if that didn't work, wipe sharp entirely and reinstall fresh
      // (without --ignore-scripts so postinstall/install scripts run)
      `    if ! node --input-type=commonjs -e "try{require('./node_modules/sharp');}catch(e){process.exit(1);}" 2>/dev/null; then`,
      `      rm -rf ./node_modules/sharp 2>/dev/null || true`,
      `      npm_config_platform=linux npm_config_arch=x64 npm_config_registry=https://registry.npmjs.org \\`,
      `        npm install "sharp@\${SHARP_VERSION}" --registry=https://registry.npmjs.org 2>/dev/null || \\`,
      `      npm install --platform=linux --arch=x64 --registry=https://registry.npmjs.org "sharp@\${SHARP_VERSION}" 2>/dev/null || true`,
      `    fi`,
      `    node --input-type=commonjs -e "try{require('./node_modules/sharp');console.log('[BERAHOST] sharp OK');}catch(e){console.log('[BERAHOST] WARN: sharp still broken: '+e.message);}" 2>/dev/null || true`,
      `  fi`,
      // Fix better-sqlite3 the same way — run its install script inside the package
      `  if ! node --input-type=commonjs -e "try{require('./node_modules/better-sqlite3');}catch(e){process.exit(1);}" 2>/dev/null; then`,
      `    if [ -d "./node_modules/better-sqlite3" ]; then`,
      `      (cd ./node_modules/better-sqlite3 && npm run install 2>/dev/null) || pnpm rebuild better-sqlite3 2>/dev/null || true`,
      `    fi`,
      `  fi`,
      `}`,
    ].join("\n");

    const npmInstallCmd = [
      sharpFixFn,
      heartbeatCmd,
      `if [ "$BERAHOST_CACHE_HIT" = "1" ]; then`,
      `  ${npmInstallEnv}pnpm install --prefer-offline --no-frozen-lockfile --ignore-scripts --registry=https://registry.npmjs.org 2>&1 || ${npmInstallEnv}pnpm install --no-frozen-lockfile --ignore-scripts --registry=https://registry.npmjs.org 2>&1`,
      // Integrity check — verify that key modules actually resolve correctly.
      // Checks ONLY modules listed in the bot's own package.json so that bots
      // that don't have (e.g.) fs-extra never fail the check spuriously.
      `  if ! node --input-type=commonjs -e "` +
        `try{` +
          `var pkg=JSON.parse(require('fs').readFileSync('./package.json','utf8'));` +
          `var deps=Object.assign({},pkg.dependencies,pkg.optionalDependencies);` +
          `['fs-extra','axios'].filter(function(m){return deps[m];}).forEach(function(m){` +
            `try{require(m);}catch(e){if(e.code==='MODULE_NOT_FOUND')throw e;}` +
          `});` +
        `}catch(e){process.exit(1);}" 2>/dev/null; then`,
      `    echo "[BERAHOST] Cache integrity check failed — clearing BERAHOST cache and reinstalling..."`,
      `    rm -rf "${nmCacheDir}"`,
      // Do NOT clear npm's own package cache (~/.npm) — that forces a full
      // 600-package download which takes 30-50 min and triggers the watchdog.
      // npm's cache is almost always valid; only the BERAHOST hard-link copy
      // was corrupted.  --prefer-offline will use npm's cache for the reinstall.
      `    rm -rf node_modules 2>/dev/null || true`,
      // Use pnpm instead of npm for bot installs. npm 11.x crashes with
      // "Exit handler never called!" even with --ignore-scripts, leaving
      // @whiskeysockets/baileys uninstalled. pnpm does not have this bug,
      // is faster (content-addressable store), and handles peer deps cleanly.
      `    ${npmInstallEnv}pnpm install --prefer-offline --no-frozen-lockfile --ignore-scripts --registry=https://registry.npmjs.org 2>&1 || ${npmInstallEnv}pnpm install --no-frozen-lockfile --ignore-scripts --registry=https://registry.npmjs.org 2>&1`,
      `    __bh_fix_sharp`,
      `  fi`,
      // Always verify sharp's native binary after a cache-hit install.
      // pnpm rebuild silently fails when build tools are missing, so we
      // instead CHECK if sharp actually loads and, if not, delete the bad
      // binary and force-download the correct linux-x64 prebuilt binary.
      `  __bh_fix_sharp`,
      `else`,
      // No BERAHOST cache hit — clean any partial node_modules left by a
      // previously interrupted install (fixes ENOTEMPTY on retry).
      `  rm -rf node_modules 2>/dev/null || true`,
      // Same rationale: pnpm instead of npm, explicit public registry to avoid
      // Replit's package-firewall.replit.local proxy (EAI_AGAIN in production).
      `  ${npmInstallEnv}pnpm install --prefer-offline --no-frozen-lockfile --ignore-scripts --registry=https://registry.npmjs.org 2>&1 || ${npmInstallEnv}pnpm install --no-frozen-lockfile --ignore-scripts --registry=https://registry.npmjs.org 2>&1`,
      `  __bh_fix_sharp`,
      `fi`,
      heartbeatStop,
    ].join("\n");

    // ─── Pre-injection script ────────────────────────────────────────────────
    // Some bots (e.g. Atassa-MD) read settings from SQLite ONCE at startup and
    // cache them in memory. Our normal post-start injection fires too late in
    // that case — the bot has already loaded an empty OWNER_NUMBER and will
    // never receive commands.  We fix this by writing a small Node.js script to
    // disk and running it AFTER npm install but BEFORE the bot starts, so the
    // bot reads the correct values on its very first DB access.
    const preInjectSettings = Object.fromEntries(
      INJECTABLE_SETTINGS.filter(k => envVars[k]).map(k => [k, envVars[k]])
    );
    const preInjectPaths = sqliteSettingsPaths.length > 0
      ? sqliteSettingsPaths
      : ["gift/database/database.db", "database/database.db", "data/database.db"];

    const preInjectScriptContent = `
// BERAHOST pre-injection — runs before the bot starts so it reads correct settings
try {
  const Database = require('./node_modules/better-sqlite3');
  const settingsToSync = ${JSON.stringify(preInjectSettings)};
  const candidates = [
    { table: 'bot_settings', keyCol: 'key', valCol: 'value' },
    { table: 'settings',     keyCol: 'key', valCol: 'value' },
    { table: 'config',       keyCol: 'key', valCol: 'value' },
  ];
  const dbPaths = ${JSON.stringify(preInjectPaths)};
  for (const relPath of dbPaths) {
    try {
      const db = new Database(relPath);
      const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(r => r.name);
      for (const c of candidates) {
        if (!tables.includes(c.table)) continue;
        let n = 0;
        for (const [k, v] of Object.entries(settingsToSync)) {
          const r = db.prepare("UPDATE " + c.table + " SET " + c.valCol + " = ? WHERE " + c.keyCol + " = ?").run(v, k);
          if (r.changes > 0) n++;
        }
        if (n > 0) {
          console.log('[BERAHOST] Pre-injected ' + n + ' settings into ' + relPath);
          db.close();
          break;
        }
        db.close();
      }
    } catch(e) { /* DB not created yet — post-start injection will handle it */ }
  }
} catch(e) { /* better-sqlite3 not available — skip */ }
`.trim();
    await fs.writeFile(path.join(deployPath, ".berahost_preinject.cjs"), preInjectScriptContent);

    // ─── Node.js 24 compatibility shim ──────────────────────────────────────
    // Many WhatsApp bot preload scripts (e.g. Flash-MD's preload.js) do
    //   global.crypto = require('crypto')
    // In Node.js 24, `globalThis.crypto` is the built-in WebCrypto API exposed
    // as a getter-only property — assigning to it throws:
    //   TypeError: Cannot set property crypto of #<Object> which has only a getter
    // We fix this by writing a tiny CJS shim that re-declares the property as
    // configurable+writable BEFORE any --loader script runs, then injecting it
    // via NODE_OPTIONS="--require /path/to/shim.cjs".  --require runs before
    // --loader, so the property is writable by the time preload.js executes.
    const node24ShimContent = `
// BERAHOST Node.js 24 compat shim — loaded via NODE_OPTIONS=--require
// Makes global.crypto writable so older bot preload scripts can override it.
try {
  var d = Object.getOwnPropertyDescriptor(globalThis, 'crypto');
  if (d && !d.writable && !d.set) {
    Object.defineProperty(globalThis, 'crypto', {
      configurable: true,
      writable: true,
      value: d.get ? d.get.call(globalThis) : d.value,
    });
  }
} catch (_) {}
`.trim();
    const node24ShimPath = path.join(deployPath, ".berahost_node24_compat.cjs");
    await fs.writeFile(node24ShimPath, node24ShimContent);

    // ---------------------------------------------------------------------------
    // gifted-baileys AES-GCM patch
    // ---------------------------------------------------------------------------
    // Node.js 24 added stricter AES-GCM auth-tag verification.  When a bot
    // tries to reuse a stale WS noise-session after a 408 disconnect, Baileys'
    // internal `aesDecryptGCM` throws "Unsupported state or unable to
    // authenticate data", which propagates uncaught out of the WebSocket
    // `message` event handler and kills the process.
    //
    // This patch wraps `noise.decodeFrame(data)` in socket.js inside a
    // try-catch.  When the AES-GCM error is caught the WebSocket is closed,
    // which triggers Baileys' built-in reconnection logic cleanly — no crash,
    // no process death, no BERAHOST restart needed.
    // ---------------------------------------------------------------------------
    const giftedBaileysPatchContent = `
// BERAHOST gifted-baileys AES-GCM patch — applied once after npm install
// Supports both old (assignment) and new (callback) gifted-baileys API styles.
const fs = require('fs');
const path = require('path');

const candidates = [
  './node_modules/gifted-baileys/lib/Socket/socket.js',
  './node_modules/@whiskeysockets/baileys/lib/Socket/socket.js',
  './node_modules/baileys/lib/Socket/socket.js',
];

const PATCH_MARKER = '__BERAHOST_AES_GCM_PATCH__';

// Catch handler injected into the monkey-patch and old-style wrapper.
// Closes the WS cleanly on AES-GCM auth failure so Baileys reconnects itself
// without crashing the process.
const CATCH_BODY =
  'const __bh_msg=String(__bh_e);' +
  'if(__bh_msg.includes("authenticate")||__bh_msg.includes("Unsupported state")){' +
    'process.stdout.write("[BERAHOST] WA noise session expired, triggering clean reconnect\\\\n");' +
    'try{ws.close();}catch(_){}' +
    'return;' +
  '}' +
  'throw __bh_e;';

for (const candidate of candidates) {
  if (!fs.existsSync(candidate)) continue;
  let code = fs.readFileSync(candidate, 'utf8');
  if (code.includes(PATCH_MARKER)) {
    console.log('[BERAHOST] ' + candidate + ' already patched — skipping');
    continue;
  }

  let patched = false;

  // ── Strategy A: old assignment-style API (gifted-baileys < v7) ─────────────
  // noise.decodeFrame(data) returned the decoded frame.  We replace it with
  // an IIFE that catches auth errors.
  if (!patched) {
    const oldReplacement =
      '(()=>{' +
      'let __bh_frame;' +
      'try{__bh_frame=noise.decodeFrame(data);}' +
      'catch(__bh_e){' + CATCH_BODY + '}' +
      'return __bh_frame;' +
      '})()';

    const oldPatterns = [
      { from: 'const frame = noise.decodeFrame(data)', to: 'const frame = ' + oldReplacement },
      { from: 'let frame = noise.decodeFrame(data)',   to: 'let frame = '   + oldReplacement },
      { from: 'noise.decodeFrame(data)',               to: oldReplacement },
    ];

    for (const p of oldPatterns) {
      if (code.includes(p.from)) {
        code = code.split(p.from).join(p.to);
        patched = true;
        console.log('[BERAHOST] Applied AES-GCM patch (old-style) to ' + candidate);
        break;
      }
    }
  }

  // ── Strategy B: new callback-style API (gifted-baileys >= v7) ──────────────
  // noise.decodeFrame(data, frame => { ... }) — the error is thrown synchronously
  // BEFORE the callback fires, so a try-catch around the call suffices.
  // We monkey-patch noise.decodeFrame just before ws.on('message', ...) so
  // that ws (and noise) are both in scope.
  if (!patched) {
    const monkeyPatch =
      'const __bh_orig_df=noise.decodeFrame.bind(noise);' +
      'noise.decodeFrame=(data,cb)=>{' +
        'try{return __bh_orig_df(data,cb);}' +
        'catch(__bh_e){' + CATCH_BODY + '}' +
      '};';

    // The line ws.on('message', onMessageReceived) is unique in socket.js
    const wsOnMsg = "ws.on('message', onMessageReceived)";
    if (code.includes(wsOnMsg)) {
      code = code.replace(wsOnMsg, monkeyPatch + '\\n' + wsOnMsg);
      patched = true;
      console.log('[BERAHOST] Applied AES-GCM patch (callback monkey-patch) to ' + candidate);
    }
  }

  if (patched) {
    code += '\\n// ' + PATCH_MARKER + '\\n';
    fs.writeFileSync(candidate, code);
  } else {
    console.log('[BERAHOST] AES-GCM patch: no matching pattern found in ' + candidate +
      ' — process will restart on auth error (graceful fallback active)');
  }
}
`.trim();
    const giftedBaileysPatchPath = path.join(deployPath, ".berahost_gifted_baileys_patch.cjs");
    await fs.writeFile(giftedBaileysPatchPath, giftedBaileysPatchContent);

    // ─── preload.js patch (Node.js 24 crypto compat) ─────────────────────────
    // Flash-MD and some other bots ship a minified `preload.js` that does:
    //   global.crypto = require('crypto')
    // Node.js 24 exposes `globalThis.crypto` as a GETTER-ONLY property, so
    // this assignment throws "TypeError: Cannot set property crypto of
    // #<Object> which has only a getter" and crashes the process immediately.
    //
    // The NODE_OPTIONS=--require shim we inject in the main process CANNOT
    // fix this: the `--loader ./preload.js` flag runs in a dedicated hooks
    // Worker thread that has its own globalThis.  The require shim runs in
    // the main thread's context only.
    //
    // The only reliable fix: prepend the Object.defineProperty patch at the
    // very top of preload.js (and any bundled ESM loader file) BEFORE the bot
    // is started.  This runs in the same Worker thread and makes crypto
    // writable before the rest of the file executes.
    const preloadPatchCmd = [
      `if [ -f "./preload.js" ] && ! grep -q "__BH_CRYPTO_PATCH__" "./preload.js" 2>/dev/null; then`,
      `  node -e "`,
      `    var fs=require('fs');`,
      `    var code=fs.readFileSync('./preload.js','utf8');`,
      `    var fix='(function(){try{var d=Object.getOwnPropertyDescriptor(globalThis,\\"crypto\\");if(d&&!d.writable&&!d.set){Object.defineProperty(globalThis,\\"crypto\\",{configurable:true,writable:true,value:d.get?d.get.call(globalThis):d.value});}}catch(_){}})();\\n';`,
      `    var nl=code.startsWith('#!')?code.indexOf('\\n')+1:0;`,
      `    code=code.slice(0,nl)+fix+code.slice(nl)+'\\n//__BH_CRYPTO_PATCH__';`,
      `    fs.writeFileSync('./preload.js',code);`,
      `    console.log('[BERAHOST] Patched preload.js for Node.js 24 crypto compat');`,
      `  " 2>/dev/null || true`,
      `fi`,
    ].join("\n");

    // ─── Wolf bot: set up "core" directory before launch ─────────────────────
    // Wolf core setup strategy:
    //
    // wolf.js contains a built-in "fetcher" that downloads the k-7 archive at
    // EVERY startup, deletes ./core/, tries to extract a fresh copy, and then
    // fails ("Extraction completed but core directory was not found") because
    // the ZIP extracts to k-7-main/.npm/xcache/core_bundle/core — not ./core/.
    //
    // Result: ./core/ is DELETED on every startup by wolf.js's fetcher, causing
    // the bot to run in "fallback" mode with reduced/no core plugin support.
    //
    // Fix: BERAHOST maintains a reliable cache of core/ at /tmp/.bh_wolf_core/.
    //  - First run: download & extract from GitHub → store in cache
    //  - Every subsequent run: always restore from cache BEFORE the bot starts
    //    so even though wolf.js will delete ./core/ during its fetcher step,
    //    the NEXT restart immediately restores it from cache (fast, hard-linked).
    const wolfCoreSetupCmd = [
      `if [ -f "./wolf.js" ]; then`,
      // Case 1: reliable cache exists → restore from it (fast, always fresh)
      `  if [ -d "/tmp/.bh_wolf_core" ] && [ "$(ls -A /tmp/.bh_wolf_core 2>/dev/null | head -1)" ]; then`,
      `    echo "[BERAHOST] Wolf bot: restoring core from cache..."`,
      `    rm -rf ./core`,
      `    cp -al /tmp/.bh_wolf_core ./core`,
      `    echo "[BERAHOST] Wolf bot: core restored from cache"`,
      // Case 2: no cache yet → download from GitHub and populate the cache
      `  else`,
      `    echo "[BERAHOST] Wolf bot: downloading k-7 core (first run)..."`,
      `    curl -sL --max-time 120 "https://github.com/peace-amani/k-7/archive/refs/heads/main.zip" -o /tmp/.bh_k7.zip 2>/dev/null && \\`,
      `    node --input-type=commonjs -e "`,
      `      var AdmZip=require('./node_modules/adm-zip');`,
      `      var fs=require('fs');`,
      `      var extract='/tmp/.bh_k7_extract';`,
      `      if(fs.existsSync(extract))fs.rmSync(extract,{recursive:true,force:true});`,
      `      new AdmZip('/tmp/.bh_k7.zip').extractAllTo(extract,true);`,
      `      var coreSrc=extract+'/k-7-main/.npm/xcache/core_bundle/core';`,
      `      if(fs.existsSync(coreSrc)){`,
      `        fs.cpSync(coreSrc,'./core',{recursive:true});`,
      `        fs.cpSync(coreSrc,'/tmp/.bh_wolf_core',{recursive:true});`,
      `        console.log('[BERAHOST] Wolf bot: core ready, cache saved');`,
      `      }else{`,
      `        console.log('[BERAHOST] Wolf bot: core not found in k-7 zip — bot will use fallback');`,
      `      }`,
      `      fs.rmSync(extract,{recursive:true,force:true});`,
      `    " 2>/dev/null || echo "[BERAHOST] Wolf bot: download failed — will retry next restart"`,
      `  fi`,
      `fi`,
    ].join("\n");

    // Silent Wolf k-7-main fix:
    // wolf.js downloads k-7-main at runtime and loads it with createRequire()/require().
    // k-7-main is an ESM module with top-level await, which Node.js 24 refuses to load
    // via require().  Since QwlP() is already declared `async`, we can safely convert
    // the final   X(botPath)  call (identifiable by the immediately-following }catch) to
    //   await import(botPath)
    // This lets Node.js load k-7-main properly as async ESM.
    // Note: wolf.js is read/patched by index.js into .bot_run.js each time, so we patch
    // wolf.js directly so the patched version is always used.
    const wolfPatchCmd = [
      // Write the patch script via heredoc to avoid triple-escaping regexes
      `cat > /tmp/.bh_wolf_patch.cjs << '__BH_WOLF_PATCH_EOF__'`,
      `const fs=require('fs');`,
      `const f='./wolf.js';`,
      `if(!fs.existsSync(f)||fs.readFileSync(f,'utf8').includes('__BH_WOLF_PATCH__'))process.exit(0);`,
      `const code=fs.readFileSync(f,'utf8');`,
      // Pattern: globalThis[X]=requireFn;requireFn(botPath);}catch
      // Replace:  globalThis[X]=requireFn;await import(botPath);}catch
      // QwlP() is async, so top-level await is valid inside it.
      `const patched=code.replace(/(globalThis\\[[^\\]]+\\]=([\\w$]+));\\2\\(([\\w$]+)\\);}catch/g,'$1;await import($3);}catch');`,
      `if(patched!==code){`,
      `  fs.writeFileSync(f,patched+'\\n//__BH_WOLF_PATCH__');`,
      `  console.log('[BERAHOST] Patched wolf.js: require(k-7-main) -> await import() for Node.js 24');`,
      `}else{`,
      `  console.log('[BERAHOST] wolf.js patch: pattern not found (may already be fixed upstream)');`,
      `}`,
      `__BH_WOLF_PATCH_EOF__`,
      `if [ -f "./wolf.js" ]; then node /tmp/.bh_wolf_patch.cjs 2>/dev/null || true; fi`,
    ].join("\n");

    // A stop can arrive while clone/install/patch steps are still running.
    // Do not spawn the bot after that request.
    if (stopRequested.has(deploymentId)) {
      stopRequested.delete(deploymentId);
      startingDeployments.delete(deploymentId);
      releasePort(deploymentId);
      await db.update(deploymentsTable).set({ status: "stopped", pid: null, updatedAt: new Date() }).where(eq(deploymentsTable.id, deploymentId));
      await emitLog(deploymentId, `[BERAHOST] Start cancelled because the bot was stopped.`, "info").catch(() => {});
      return { pid: -1 };
    }

    const botProcess = spawn("bash", ["-c", [
      "kill -STOP $$",
      nmCacheSetup,
      // Patch preload.js for Node.js 24 BEFORE npm install so a fresh cache
      // always contains the patched version.
      preloadPatchCmd,
      wolfPatchCmd,
      npmInstallCmd,
      nmCacheSave,
      // Wolf bot: set up core/ directory from k-7 GitHub archive (after npm
      // install so adm-zip is available; skipped for non-wolf bots).
      wolfCoreSetupCmd,
      // ── setenv.js platform override patch ───────────────────────────────────
      // Many bots ship a setenv.js that calls process.env.VARNAME = 'hardcoded'
      // directly, overwriting the values BERAHOST writes to .env.  We rewrite
      // every such assignment to process.env.VARNAME = process.env.VARNAME || 'hardcoded'
      // so platform-provided env vars always win while the bot's defaults still
      // work when no override is set.
      `if [ -f "setenv.js" ] || [ -f "setEnv.js" ] || [ -f "set_env.js" ]; then`,
      `  SETENV_FILE=$(ls setenv.js setEnv.js set_env.js 2>/dev/null | head -1)`,
      `  if [ -n "$SETENV_FILE" ]; then`,
      `    echo "[BERAHOST] Patching $SETENV_FILE to respect platform env vars..."`,
      `    sed -i "s/process\\.env\\.\\([A-Z_][A-Z0-9_]*\\)\\s*=\\s*['\\"]/process.env.\\1 = process.env.\\1 || '/g" "$SETENV_FILE" 2>/dev/null || true`,
      `    echo "[BERAHOST] $SETENV_FILE patched."`,
      `  fi`,
      `fi`,
      // Apply gifted-baileys AES-GCM patch (only modifies files if needed; safe to re-run)
      `echo "[BERAHOST] Applying library patches..."`,
      `node .berahost_gifted_baileys_patch.cjs 2>/dev/null || true`,
      `echo "[BERAHOST] Running pre-start settings injection..."`,
      `node .berahost_preinject.cjs 2>/dev/null || true`,
      // Kill any zombie process that may be occupying our deterministic port.
      // This is the main defence against EADDRINUSE when a previous server
      // instance was killed hard (SIGKILL / OOM) and left a bot process still
      // alive.  `fuser -k {port}/tcp` sends SIGKILL to every process with that
      // TCP socket open; we then sleep 300 ms so the OS reclaims the port.
      `if command -v fuser >/dev/null 2>&1; then fuser -k ${botPort}/tcp >/dev/null 2>&1 || true; sleep 0.3; fi`,
      `echo "[BERAHOST] Launching bot..."`,
      startCmd,
    ].join("\n")], {
      cwd: deployPath,
      env: {
        ...process.env,
        ...envVars,
        NODE_ENV: "production",
        PORT: String(botPort),
        // Give each deployment its own PM2 home in case pm2 is still used transitively
        PM2_HOME: path.join(deployPath, ".pm2"),
        // Node.js 24 compat: make global.crypto writable before any --loader runs.
        // Merged with any existing NODE_OPTIONS the user may have set.
        NODE_OPTIONS: [
          `--require ${node24ShimPath}`,
          envVars["NODE_OPTIONS"] ?? process.env.NODE_OPTIONS ?? "",
        ].filter(Boolean).join(" "),
        // Isolate bot from BERAHOST's database — bots use their own local SQLite
        // This prevents bot tables from polluting the BERAHOST production database
        DATABASE_URL: undefined as any,
        PGHOST: undefined as any,
        PGPORT: undefined as any,
        PGUSER: undefined as any,
        PGPASSWORD: undefined as any,
        PGDATABASE: undefined as any,
        BASE_PATH: undefined as any,
      },
      detached: true,   // makes bash a process-group leader so we can kill the whole tree
      stdio: ["pipe", "pipe", "pipe"], // stdin piped so users can send input from the BERAHOST console
    });

    if (!botProcess.pid) {
      throw new Error("Failed to spawn process");
    }

    if (!accountLimits.isAdmin && botProcess.pid) {
      try { await attachAccountProcess(accountDeployment.userId, botProcess.pid); process.kill(botProcess.pid, "SIGCONT"); }
      catch (error) { try { process.kill(-botProcess.pid, "SIGKILL"); } catch {} throw error; }
    } else if (botProcess.pid) { try { process.kill(botProcess.pid, "SIGCONT"); } catch {} }
    runningProcesses.set(deploymentId, botProcess);
    if (!accountLimits.isAdmin) void monitorAccountStorage(accountDeployment.userId);
    let processOutputTail = "";

    // Release the double-deploy guard now that the process is running
    startingDeployments.delete(deploymentId);

    // Start the watchdog — it resets every time the bot produces any output
    resetWatchdog(deploymentId, botProcess);

    // Capture stdout — strip ANSI codes so logs are readable in the UI
    botProcess.stdout?.on("data", async (data: Buffer) => {
      resetWatchdog(deploymentId, botProcess); // bot is alive, reset silence timer
      const lines = data.toString().split("\n").filter((l) => l.trim());
      for (const line of lines) {
        const clean = stripAnsi(line);
        processOutputTail = `${processOutputTail}\n${clean}`.trim().slice(-4000);
        await emitLog(deploymentId, clean, "stdout").catch(() => {});

        const lower = clean.toLowerCase();

        // Detect successful WhatsApp connection — switch to 30-min idle watchdog.
        // An idle connected bot can be completely silent for hours when no messages
        // arrive; using the tight 5-min startup watchdog would kill it wrongly.
        // Patterns cover: Atassa-MD ("Connected to WhatsApp, Active!"),
        //   Wolf bot ("WOLFBOT ONLINE", "WhatsApp connection established",
        //              "Auto-reconnected successfully"),
        //   Flash-MD ("connected"), and generic baileys patterns.
        if (
          !connectedDeployments.has(deploymentId) && (
            lower.includes("connected to whatsapp") ||
            lower.includes("connection established") ||
            lower.includes("connected, active") ||
            lower.includes("wolfbot online") ||
            lower.includes("wolfbot — connected") ||
            lower.includes("auto-reconnected successfully") ||
            lower.includes("whatsapp: connected") ||
            (lower.includes("connected") && lower.includes("active"))
          )
        ) {
          connectedDeployments.add(deploymentId);
          // Bot is now live on WhatsApp — cancel the startup watchdog entirely.
          // An idle bot (no incoming messages) is silent by design, not stuck.
          clearWatchdog(deploymentId);
          // Reset the crash budget immediately on successful WhatsApp connection.
          // The stability timer also resets after 5 min of uptime, but resetting
          // here ensures that a bot that successfully connects never exhausts its
          // budget just because it takes multiple session handshakes to get there.
          db.update(deploymentsTable)
            .set({ restartCount: 0 })
            .where(eq(deploymentsTable.id, deploymentId))
            .catch(() => {});
        }

        // Detect WhatsApp 440 "Connection Replaced" — another device has taken the session.
        // Flag this so the exit handler knows NOT to auto-restart (it would just bounce forever).
        if (
          lower.includes("connection replaced") ||
          lower.includes("440") ||
          lower.includes("stream errored") && lower.includes("conflict")
        ) {
          connectionReplacedIds.add(deploymentId);
          await emitLog(
            deploymentId,
            "[BERAHOST] ⚠ Connection Replaced (error 440): another device logged in with this session. " +
            "Bot will NOT auto-restart. Generate a fresh Session ID to fix this.",
            "warn"
          ).catch(() => {});
        }

        // ─── Detect pairing code ────────────────────────────────────────────
        // Bots log the pairing code when they have no session and are in
        // pairing-code mode.  We detect it here and emit a dedicated socket
        // event so the frontend can show it prominently instead of burying it
        // in the log stream.  Any line that contains "pairing code" (case
        // insensitive) is checked for a code pattern.
        //
        // IMPORTANT: we first look for the code AFTER a colon (e.g. "CODE: XXXX-XXXX")
        // to avoid matching "RING-CODE" from inside "PAIRING CODE" itself.
        if (lower.includes("pairing") && lower.includes("code")) {
          // Priority 1: code appears after a colon → "PAIRING CODE: XXXX-XXXX"
          const afterColon = clean.match(/code\s*:\s*([A-Z0-9]{4}[-\s][A-Z0-9]{4}(?:[-\s][A-Z0-9]{4}[-\s][A-Z0-9]{4})?)/i);
          // Priority 2: standalone code token not inside a word (not "PAIRING CODE" itself)
          const standalone = clean.match(/(?<![A-Z0-9])([A-Z0-9]{4}[-][A-Z0-9]{4}(?:[-][A-Z0-9]{4}[-][A-Z0-9]{4})?)(?![A-Z0-9])/i);
          const match = afterColon || standalone;
          if (match) {
            const rawCode = match[1];
            // Normalise separator to dashes for a consistent display
            const code = rawCode.toUpperCase().replace(/\s/g, "-");
            // Retrieve the phone number we saved for this deployment (if any)
            const phoneInEnv = envVars["PHONE_NUMBER"] || envVars["OWNER_NUMBER"] || envVars["OWNER"] || "";
            const phone = phoneInEnv.replace(/[^0-9]/g, "");
            const entry: PairingCodeEntry = { code, phone, detectedAt: new Date() };
            pairingCodes.set(deploymentId, entry);
            if (pairingCodeEmitter) pairingCodeEmitter(deploymentId, entry);
          }
        }

        // Clear pairing code once the bot successfully connects
        if (
          !connectedDeployments.has(deploymentId) && (
            lower.includes("connected to whatsapp") ||
            lower.includes("connection established") ||
            lower.includes("connected, active") ||
            lower.includes("wolfbot online") ||
            (lower.includes("connected") && lower.includes("active"))
          )
        ) {
          clearPairingCode(deploymentId);
        }

        // Trigger settings injection after the bot's DB is initialised.
        // We watch for several common "ready" log patterns used across different bots.
        const isInitLog =
          clean.includes("Bot Settings Initialized") ||
          (clean.includes("Settings Initialized") && !clean.includes("Group Settings")) ||
          clean.includes("Database Synchronized") ||
          clean.includes("Settings Loaded") ||
          clean.includes("Config Loaded");

        if (isInitLog) {
          // Small delay to let the DB transaction commit fully
          setTimeout(() => {
            injectBotSettings(deploymentId, deployPath, envVars, sqliteSettingsPaths).catch(() => {});
          }, 500);

          // Start a 5-minute stability timer — if the bot runs that long without crashing,
          // reset its restart counter so a fresh crash gets the full retry budget.
          // (Also resets immediately on WhatsApp connection — see stdout handler above)
          const existing = restartResetTimers.get(deploymentId);
          if (existing) clearTimeout(existing);
          const timer = setTimeout(async () => {
            restartResetTimers.delete(deploymentId);
            await db
              .update(deploymentsTable)
              .set({ restartCount: 0 })
              .where(eq(deploymentsTable.id, deploymentId))
              .catch(() => {});
          }, 5 * 60 * 1000); // 5 minutes
          restartResetTimers.set(deploymentId, timer);
        }
      }
    });

    // Capture stderr — also strip ANSI codes
    botProcess.stderr?.on("data", async (data: Buffer) => {
      resetWatchdog(deploymentId, botProcess); // stderr also counts as activity
      const lines = data.toString().split("\n").filter((l) => l.trim());
      for (const line of lines) {
        const clean = stripAnsi(line);
        processOutputTail = `${processOutputTail}\n${clean}`.trim().slice(-4000);

        // ── Suppress install-time noise that always appears as red ────────────
        // These are informational messages from npm or WhatsApp's API that the
        // user cannot act on — they clutter the terminal with false alarms.
        const cleanL = clean.toLowerCase();
        const isNpmNoise =
          cleanL.startsWith("npm warn") ||
          cleanL.startsWith("npm notice") ||
          cleanL.includes("ebadengine");
        const isWANoise =
          cleanL.includes("rate-overlimit") ||
          cleanL.includes("growth-locked") ||
          cleanL.includes("participant cache update failed");

        if (isNpmNoise || isWANoise) continue; // drop silently — not useful to users

        // ── Downgrade wolf-fetcher / module-load warnings to yellow ───────────
        // These look scary but are handled gracefully by the bot (it falls back).
        const isExpectedWarning =
          clean.includes("[WOLF-LOAD]") ||
          clean.includes("[ButtonHelper] baileys not available") ||
          clean.includes("Setup failed: Extraction") ||
          clean.includes("The hunt failed") ||
          clean.includes("attempting to rise from existing files");

        const stderrLevel = isExpectedWarning ? "warn" : "stderr";
        await emitLog(deploymentId, clean, stderrLevel).catch(() => {});

        // ── Wolf core hot-restore ─────────────────────────────────────────────
        // wolf.js's built-in fetcher DELETES ./core/ on every startup then fails
        // to re-create it.  When we detect the failure message, immediately
        // restore ./core/ from BERAHOST's reliable cache — this runs ~2 seconds
        // before the bot's command-loader executes, so all core plugins load fine.
        if (clean.includes("[WOLF-LOAD]") && clean.includes("Setup failed")) {
          exec(
            `if [ -d "/tmp/.bh_wolf_core" ]; then` +
            `  rm -rf "${deployPath}/core" &&` +
            `  cp -al /tmp/.bh_wolf_core "${deployPath}/core" &&` +
            `  echo "[BERAHOST] Wolf core hot-restored from cache";` +
            `fi`,
            (err) => { if (err) logger.warn({ err }, "Wolf core hot-restore failed"); }
          );
        }

        // ── Detect known WhatsApp reconnection crypto failures ─────────────
        // gifted-baileys (used by Atassa-MD and similar forks) tries to reuse
        // the noise-handler state after a 408 disconnect.  On Node.js 24 this
        // throws an AES-GCM authentication error and crashes the process.
        // The bot's own reconnect logic cannot recover — we need a clean restart.
        // Flag the deployment so the exit handler skips the crash counter and
        // restarts immediately instead of waiting 5–80 s.
        const isWAProtocolError =
          clean.includes("Unsupported state or unable to authenticate data") ||
          clean.includes("aesDecryptGCM") ||
          (clean.includes("noise-handler") && clean.includes("Error"));

        if (isWAProtocolError && !forceRestartIds.has(deploymentId)) {
          forceRestartIds.add(deploymentId);
          await emitLog(
            deploymentId,
            "[BERAHOST] ↻ WhatsApp reconnection error detected — restarting cleanly (no crash count)...",
            "warn"
          ).catch(() => {});
          // Kill immediately so we don't sit in the broken state for 30+ s
          setTimeout(() => {
            if (botProcess.pid) try { process.kill(-botProcess.pid, "SIGTERM"); } catch { /* already dead */ }
          }, 1000);
        }

        // ── Detect EADDRINUSE (port conflict) ─────────────────────────────
        // Should not happen with deterministic port allocation, but can still
        // occur if a zombie process from a previous server crash is holding
        // the port (the fuser -k before launch didn't catch it, or fuser is
        // absent on this host).  We flag it so the exit handler kills the
        // occupant with fuser and retries ONCE instead of entering a 10-attempt
        // crash loop that never succeeds.
        const isPortConflict =
          clean.includes("EADDRINUSE") ||
          clean.includes("address already in use");

        if (isPortConflict && !eaddrInUseIds.has(deploymentId)) {
          eaddrInUseIds.add(deploymentId);
          await emitLog(
            deploymentId,
            `[BERAHOST] ⚠ Port ${botPort} already in use — killing occupant and restarting once...`,
            "warn"
          ).catch(() => {});
          setTimeout(() => {
            if (botProcess.pid) try { process.kill(-botProcess.pid, "SIGTERM"); } catch { /* already dead */ }
          }, 500);
        }
      }
    });

    // Handle exit — any exit that wasn't triggered by the user is treated as a crash
    botProcess.on("exit", async (code, signal) => {
      runningProcesses.delete(deploymentId);
      clearWatchdog(deploymentId); // stop the silence timer
      connectedDeployments.delete(deploymentId); // reset to startup phase for next run

      const wasIntentional = intentionallyStopped.has(deploymentId);
      const wasQuotaStopped = quotaStopped.has(deploymentId);
      quotaStopped.delete(deploymentId);
      intentionallyStopped.delete(deploymentId);

      // ─── Save session state on every exit ────────────────────────────────────
      // The process is now fully dead — snapshot the Baileys auth directory so
      // the next start (restart or manual) restores all pre-keys/sender-keys.
      // We skip this on intentional stops because stopBotProcess already saved.
      if (!wasIntentional) {
        await saveSessionState(deploymentId, deployPath).catch(() => {});
      }

      if (wasIntentional || wasQuotaStopped) {
        // Intentional user/admin or quota stop must never be treated as a crash the bot — mark stopped, release port, do NOT restart
        releasePort(deploymentId);
        await db
          .update(deploymentsTable)
          .set({ status: "stopped", pid: null, updatedAt: new Date() })
          .where(eq(deploymentsTable.id, deploymentId));

        if (wasIntentional) await emitLog(deploymentId, `[BERAHOST] Bot stopped by user`, "info").catch(() => {});
        else await emitLog(deploymentId, `[BERAHOST] Workload remains stopped because shared account storage is over quota; remove files before restarting.`, "error").catch(() => {});
        return;
      }

      // Clear any pending stability timer
      const stabilityTimer = restartResetTimers.get(deploymentId);
      if (stabilityTimer) { clearTimeout(stabilityTimer); restartResetTimers.delete(deploymentId); }

      // ─── 440 "Connection Replaced" — don't restart, just mark stopped ───────
      if (connectionReplacedIds.has(deploymentId)) {
        connectionReplacedIds.delete(deploymentId);
        releasePort(deploymentId);
        await db
          .update(deploymentsTable)
          .set({ status: "stopped", pid: null, updatedAt: new Date() })
          .where(eq(deploymentsTable.id, deploymentId));
        // Warning already logged in stdout handler
        return;
      }

      // ─── WhatsApp protocol error (crypto / noise-handler) — instant restart ─
      // These are NOT real crashes: the bot's WA library failed to decrypt a
      // reconnection handshake (Node.js 24 AES-GCM strictness vs older Baileys).
      // Restart immediately with no delay and without consuming the crash budget.
      // repoUrl and envVars are captured from the outer startBotProcess closure.
      if (forceRestartIds.has(deploymentId)) {
        forceRestartIds.delete(deploymentId);
        await startBotProcess(deploymentId, repoUrl, envVars).catch((err) => {
          logger.error({ err, deploymentId }, "Force-restart after WA protocol error failed");
        });
        return;
      }

      // ─── EADDRINUSE (port conflict) — kill port occupant and restart once ──
      // With deterministic port allocation this should be extremely rare, but
      // can happen when a zombie process survived a hard server kill.
      // We forcibly free the port with fuser, then restart immediately and
      // WITHOUT consuming the crash budget (it's an infra issue, not a bot bug).
      if (eaddrInUseIds.has(deploymentId)) {
        eaddrInUseIds.delete(deploymentId);
        try {
          await execAsync(`fuser -k ${botPort}/tcp 2>/dev/null; sleep 0.5`, { timeout: 5000 });
        } catch { /* fuser absent or port already free — proceed */ }
        await emitLog(
          deploymentId,
          `[BERAHOST] ↻ Port ${botPort} freed — restarting bot...`,
          "info"
        ).catch(() => {});
        await startBotProcess(deploymentId, repoUrl, envVars).catch((err) => {
          logger.error({ err, deploymentId }, "Restart after EADDRINUSE failed");
        });
        return;
      }

      // ─── Unexpected exit (crash / OOM / signal) ───────────────────────────
      // Wrap ALL DB calls: if the connection pool is in a bad state these can
      // throw, and an unhandled rejection here would kill the whole server.
      await db
        .update(deploymentsTable)
        .set({ status: "crashed", pid: null, updatedAt: new Date() })
        .where(eq(deploymentsTable.id, deploymentId))
        .catch((e) => logger.error({ e, deploymentId }, "DB update to crashed status failed"));

      await emitLog(
        deploymentId,
        `[BERAHOST] ✖ Process exited unexpectedly (code=${code ?? "—"}, signal=${signal ?? "—"}) — scheduling restart. Last output: ${processOutputTail.split("\n").slice(-4).join(" | ") || "No output captured."}`,
        "error"
      ).catch(() => {});

      // Auto-restart with exponential backoff — no restart cap.
      // Bots only restart on actual process exit (crash); never for idle/silence.
      // Backoff caps at 120 s to prevent a fast crash-loop from burning resources.
      let dep: (typeof deploymentsTable.$inferSelect) | undefined;
      try {
        [dep] = await db
          .select()
          .from(deploymentsTable)
          .where(eq(deploymentsTable.id, deploymentId));
      } catch (e) {
        logger.error({ e, deploymentId }, "DB select for restart failed — skipping restart");
        return;
      }

      if (!dep) return;

      // Fire crash alert to the bot owner (insert notification + socket push)
      if (userAlertEmitter) {
        userAlertEmitter(dep.userId, deploymentId, dep.customName ?? null).catch((e) =>
          logger.error({ e, deploymentId }, "userAlertEmitter failed")
        );
      }

      const attempt   = (dep.restartCount ?? 0) + 1;
      if (attempt > 5) {
        await db
          .update(deploymentsTable)
          .set({ status: "crashed", pid: null, updatedAt: new Date() })
          .where(eq(deploymentsTable.id, deploymentId))
          .catch(() => {});
        await emitLog(
          deploymentId,
          `[BERAHOST] Auto-restart paused after 5 consecutive crashes. Review the preceding stderr output, environment variables, session ID, and repository startup requirements, then start the bot manually after fixing them.`,
          "error"
        ).catch(() => {});
        releasePort(deploymentId);
        return;
      }
      // Exponential backoff: 0 → 5 → 10 → 20 → 40 → 80 → 120 s (capped)
      const backoffMs = attempt === 1 ? 0 : Math.min(5000 * Math.pow(2, attempt - 2), 120_000);

      await db
        .update(deploymentsTable)
        .set({ restartCount: attempt })
        .where(eq(deploymentsTable.id, deploymentId));

      await emitLog(
        deploymentId,
        `[BERAHOST] ↻ Auto-restart #${attempt} in ${backoffMs / 1000}s (crash recovery — no restart limit)...`,
        "info"
      ).catch(() => {});

      const restartTimer = setTimeout(async () => {
        pendingRestartTimers.delete(deploymentId);

        // If the deployment was intentionally stopped while the timer was pending,
        // skip the restart entirely — this is the main cause of "stop doesn't work".
        if (intentionallyStopped.has(deploymentId)) {
          logger.info({ deploymentId }, "Skipping queued restart — deployment was stopped");
          return;
        }

        try {
          const { botsTable } = await import("@workspace/db");
          const [bot] = await db
            .select({ repoUrl: botsTable.repoUrl })
            .from(botsTable)
            .where(eq(botsTable.id, dep.botId));

          if (!bot) return;

          await startBotProcess(deploymentId, bot.repoUrl, envVars).catch((err) => {
            logger.error({ err, deploymentId }, "Auto-restart failed");
          });
        } catch (err) {
          // DB connection lost while the timer was pending (e.g. pool idle timeout).
          // Log and do NOT rethrow — an unhandled rejection here crashes the whole
          // server and kills every other running bot.
          logger.error({ err, deploymentId }, "Auto-restart timer: DB query failed, skip this attempt");
          await emitLog(
            deploymentId,
            "[BERAHOST] ↻ Restart attempt failed (DB unavailable) — bot will restart on next cycle",
            "warn"
          ).catch(() => {});
        }
      }, backoffMs);
      pendingRestartTimers.set(deploymentId, restartTimer);
    });

    // Update DB with PID and running status
    await db
      .update(deploymentsTable)
      .set({ pid: botProcess.pid, status: "running", lastActive: new Date(), updatedAt: new Date() })
      .where(eq(deploymentsTable.id, deploymentId));

    await emitLog(deploymentId, `[BERAHOST] Bot started with PID ${botProcess.pid}`, "info");

    // Close the narrow race between the pre-spawn check and process registration.
    if (stopRequested.has(deploymentId)) {
      await stopBotProcess(deploymentId);
      return { pid: -1 };
    }

    return { pid: botProcess.pid };
  } catch (err) {
    // Always release the double-deploy guard so a retry is possible
    startingDeployments.delete(deploymentId);

    await db
      .update(deploymentsTable)
      .set({ status: "crashed", updatedAt: new Date() })
      .where(eq(deploymentsTable.id, deploymentId));

    const errMsg = err instanceof Error ? err.message : String(err);
    await emitLog(deploymentId, `[BERAHOST] Error: ${errMsg}`, "stderr").catch(() => {});
    throw err;
  }
}

export async function stopBotProcess(deploymentId: number): Promise<void> {
  const proc = runningProcesses.get(deploymentId);
  stopRequested.add(deploymentId);

  // Cancel watchdog immediately — we're stopping intentionally
  clearWatchdog(deploymentId);

  // Cancel any queued auto-restart timer — this is the primary fix for
  // "stop doesn't work": a crash-loop bot has a pending setTimeout that
  // fires AFTER the stop and brings the bot back up immediately.
  const pendingTimer = pendingRestartTimers.get(deploymentId);
  if (pendingTimer) {
    clearTimeout(pendingTimer);
    pendingRestartTimers.delete(deploymentId);
  }

  // Mark as intentionally stopped BEFORE killing so the exit handler knows
  intentionallyStopped.add(deploymentId);

  let persistedPid: number | null = null;
  if (!proc?.pid) {
    const [row] = await db.select({ pid: deploymentsTable.pid }).from(deploymentsTable).where(eq(deploymentsTable.id, deploymentId));
    persistedPid = row?.pid ?? null;
  }

  const pgid = proc?.pid ?? persistedPid;
  if (pgid) {
    try {
      // Kill the entire process group (bash + npm + node grandchildren).
      // Negative PID targets the process group rather than just the bash PID.
      process.kill(-pgid, "SIGTERM");
    } catch { /* already dead */ }

    // Give processes 2 s to exit cleanly, then SIGKILL the group.
    await new Promise<void>((resolve) => {
      const timer = setTimeout(() => {
        try { process.kill(-pgid, "SIGKILL"); } catch { /* already dead */ }
        resolve();
      }, 2000);
      if (proc) proc.once("exit", () => { clearTimeout(timer); resolve(); });
    });

    runningProcesses.delete(deploymentId);

    // Process is now fully dead — safe to snapshot all session files.
    // This preserves creds.json + every pre-key / sender-key / app-state-sync
    // file so the next startup restores the full Baileys session.
    const deployPath = `/tmp/berahost_dep_${deploymentId}`;
    await saveSessionState(deploymentId, deployPath);
  }

  // Port-based fallback: kill any orphaned process still holding the bot port
  // (covers cases where runningProcesses was lost after an API server restart).
  const botPort = PORT_START + deploymentId;
  try {
    execSync(`fuser -k ${botPort}/tcp 2>/dev/null || true`);
  } catch { /* fuser not available or nothing on port */ }

  await db
    .update(deploymentsTable)
    .set({ status: "stopped", pid: null, restartCount: 0, updatedAt: new Date() })
    .where(eq(deploymentsTable.id, deploymentId));
}
