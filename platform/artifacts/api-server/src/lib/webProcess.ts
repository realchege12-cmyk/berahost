import fs from "fs/promises";
import path from "path";
import { spawn, execFile } from "child_process";
import { promisify } from "util";
import net from "net";
import crypto from "crypto";
import { db, webDeploymentsTable, webDeploymentLogsTable, domainOrdersTable, usersTable } from "@workspace/db";
import { and, eq, lt } from "drizzle-orm";
import { logger } from "./logger";
import { ensureAccountCgroup, attachAccountProcess, accountStorageUsageBytes } from "./resourceManager";
import { decryptGithubToken } from "./github";
import { decryptWebEnvVars, encryptWebEnvVars } from "./webEnvSecrets";
import { isSubscriptionActive } from "./subscriptions";
import { parseBerahostYml, resolveWebProjectConfig, type WebProjectType } from "./webProjectConfig";
import { validateWebDeploymentSlug, webDeploymentSlugFromHost, webDeploymentUrl, WEB_DEPLOYMENT_STORAGE_BYTES, WEB_DEPLOYMENT_STORAGE_MB } from "./webDeploymentConfig";

const execFileAsync = promisify(execFile);
const runningWebProcesses = new Map<number, ReturnType<typeof spawn>>();
const startingWebDeployments = new Set<number>();
const WEB_PORT_START = 4200;
const runtimeStorageMonitors = new Map<number, NodeJS.Timeout>();
const runtimeHealthMonitors = new Map<number, NodeJS.Timeout>();
const storageLimitExceeded = new Set<number>();
const requestedStops = new Set<number>();
const currentRunIds = new Map<number, string>();
const deploymentSecretValues = new Map<number, string[]>();
const runLogBytes = new Map<string, number>();
const truncatedLogRuns = new Set<string>();
const failedStartIds = new Set<number>();
const MAX_WEB_LOG_BYTES_PER_RUN = 2 * 1024 * 1024;

export type ScannedEnvVar = { key: string; defaultValue: string; description: string; required: boolean };

function deploymentRoot(id: number) { return `/tmp/berahost_web_${id}`; }
function isSafeSlug(value: string) { return !validateWebDeploymentSlug(value).error; }
function workloadUid(userId: number) { return 100_000 + Math.abs(Math.trunc(userId)); }

async function prepareWorkloadHome(root: string, userId: number): Promise<void> {
  const uid = workloadUid(userId);
  const rootRealPath = await fs.realpath(root);
  for (const name of [".home", ".tmp"]) {
    const directory = path.join(root, name);
    const existing = await fs.lstat(directory).catch((error: any) => error?.code === "ENOENT" ? null : Promise.reject(error));
    if (existing?.isSymbolicLink() || (existing && !existing.isDirectory())) throw new Error(`Deployment path ${name} must be a real directory, not a symlink or file.`);
    if (!existing) await fs.mkdir(directory, { mode: 0o700 });
    const verified = await fs.lstat(directory);
    const directoryRealPath = await fs.realpath(directory);
    if (verified.isSymbolicLink() || !directoryRealPath.startsWith(`${rootRealPath}${path.sep}`)) throw new Error(`Deployment path ${name} escapes its storage root.`);
    await fs.chown(directory, uid, uid);
    await fs.chmod(directory, 0o700);
  }
}

function workloadEnvironment(root: string, explicit: Record<string, string>, nodeEnv: "development" | "production" = "development", port?: number): NodeJS.ProcessEnv {
  const reserved = new Set(["PORT", "NODE_ENV", "PATH", "HOME", "TMPDIR", "CI", "BASH_ENV", "ENV", "LD_PRELOAD", "LD_LIBRARY_PATH", "NODE_OPTIONS"]);
  const safeValues = Object.fromEntries(Object.entries(explicit).filter(([key]) => !reserved.has(key.toUpperCase()) && !key.toUpperCase().startsWith("BERAHOST_")));
  return {
    PATH: process.env.PATH || "/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin",
    HOME: path.join(root, ".home"),
    TMPDIR: path.join(root, ".tmp"),
    CI: "true",
    NODE_ENV: nodeEnv,
    ...safeValues,
    ...(port ? { PORT: String(port) } : {}),
  };
}

function storageLimitError(sizeBytes: number): Error & { code: string } {
  const error = new Error(`Deployment storage exceeded ${WEB_DEPLOYMENT_STORAGE_MB} MB (${(sizeBytes / (1024 * 1024)).toFixed(1)} MB used). Reduce the files, dependencies, or build output and redeploy.`) as Error & { code: string };
  error.code = "WEB_DEPLOYMENT_STORAGE_LIMIT";
  return error;
}

function accountStorageLimitError(sizeBytes: number, limitMb: number): Error & { code: string } {
  const error = new Error(`Shared account storage quota exceeded (${(sizeBytes / (1024 * 1024)).toFixed(1)} MB used of ${limitMb} MB). Remove files from other workloads and redeploy.`) as Error & { code: string };
  error.code = "ACCOUNT_STORAGE_LIMIT";
  return error;
}

async function deploymentSizeBytes(root: string): Promise<number> {
  const result = await execFileAsync("du", ["-sk", root], { timeout: 15_000, maxBuffer: 1024 * 1024 });
  const sizeKb = Number(String(result.stdout || "").trim().split(/\s+/, 1)[0]);
  if (!Number.isFinite(sizeKb)) throw new Error("Unable to measure deployment storage usage.");
  let totalBytes = sizeKb * 1024;
  try { totalBytes += (await fs.stat(`${root}.source.tar.gz`)).size; }
  catch (error: any) { if (error?.code !== "ENOENT") throw error; }
  return totalBytes;
}

async function assertStorageLimit(root: string): Promise<void> {
  let sizeBytes = await deploymentSizeBytes(root);
  try { sizeBytes += (await fs.stat(`${root}.source.tar.gz`)).size; }
  catch (error: any) { if (error?.code !== "ENOENT") throw error; }
  if (sizeBytes > WEB_DEPLOYMENT_STORAGE_BYTES) throw storageLimitError(sizeBytes);
}

export function normalizeGithubUrl(raw: string): string | null {
  const input = String(raw || "").trim().replace(/\.git$/, "");
  const match = input.match(/^https?:\/\/(?:www\.)?github\.com\/([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)$/);
  return match ? `https://github.com/${match[1]}/${match[2]}.git` : null;
}

function parseEnvFile(content: string): ScannedEnvVar[] {
  const result: ScannedEnvVar[] = [];
  let description = "";
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (trimmed.startsWith("#")) { description = trimmed.replace(/^#+\s*/, ""); continue; }
    const match = trimmed.match(/^([A-Z_][A-Z0-9_]*)\s*(?:=\s*(.*))?$/i);
    if (!match) { description = ""; continue; }
    const defaultValue = (match[2] || "").trim().replace(/^['"]|['"]$/g, "");
    result.push({ key: match[1], defaultValue, description, required: defaultValue === "" });
    description = "";
  }
  return result;
}

export async function scanWebEnv(root: string): Promise<ScannedEnvVar[]> {
  const names = [".env.example", ".env.sample", ".env.template", ".env.defaults"];
  const all = new Map<string, ScannedEnvVar>();
  for (const name of names) {
    try {
      const vars = parseEnvFile(await fs.readFile(path.join(root, name), "utf8"));
      for (const item of vars) if (!all.has(item.key)) all.set(item.key, item);
    } catch { /* optional config file */ }
  }
  return [...all.values()];
}

async function run(command: string, cwd: string, env: Record<string, string>, timeout = 15 * 60 * 1000, storageRoot?: string, userId?: number, isAdmin = false, accountStorageLimitMb?: number, assignedPort?: number): Promise<string> {
  const workRoot = storageRoot || cwd;
  if (userId) await prepareWorkloadHome(workRoot, userId);
  return new Promise((resolve, reject) => {
    const uid = userId ? workloadUid(userId) : undefined;
    const childEnv = workloadEnvironment(workRoot, env, "development", assignedPort);
    const child = spawn("bash", ["-lc", userId && !isAdmin ? `kill -STOP $$\n${command}` : command], { cwd, env: childEnv, detached: true, stdio: ["ignore", "pipe", "pipe"], ...(uid ? { uid, gid: uid } : {}) });
    if (userId && !isAdmin && child.pid) void (async () => { try { await attachAccountProcess(userId, child.pid!); process.kill(child.pid!, "SIGCONT"); } catch (error) { try { process.kill(-child.pid!, "SIGKILL"); } catch {} logger.error({ err: error }, "Web build cgroup attachment failed"); } })();
    const captureLimit = 8 * 1024 * 1024;
    let stdout = "";
    let stderr = "";
    let settled = false;
    let timedOut = false;
    let exceededBytes = 0;
    let exceededMessage: string | null = null;
    let checking = false;
    let monitor: NodeJS.Timeout | undefined;
    let timeoutTimer: NodeJS.Timeout | undefined;
    let forceKillTimer: NodeJS.Timeout | undefined;
    const appendTail = (current: string, chunk: Buffer) => `${current}${chunk.toString()}`.slice(-captureLimit);
    const terminate = () => {
      try { if (child.pid) process.kill(-child.pid, "SIGTERM"); else child.kill("SIGTERM"); }
      catch { try { child.kill("SIGTERM"); } catch {} }
      forceKillTimer = setTimeout(() => {
        if (child.exitCode !== null || child.signalCode) return;
        try { if (child.pid) process.kill(-child.pid, "SIGKILL"); else child.kill("SIGKILL"); }
        catch { try { child.kill("SIGKILL"); } catch {} }
      }, 5000);
      forceKillTimer.unref();
    };
    const finish = (error?: Error, result?: string) => {
      if (settled) return;
      settled = true;
      if (monitor) clearInterval(monitor);
      if (timeoutTimer) clearTimeout(timeoutTimer);
      if (forceKillTimer) clearTimeout(forceKillTimer);
      if (error) reject(error);
      else resolve(result || "");
    };
    child.stdout?.on("data", (chunk: Buffer) => { stdout = appendTail(stdout, chunk); });
    child.stderr?.on("data", (chunk: Buffer) => { stderr = appendTail(stderr, chunk); });
    child.once("error", (error) => finish(error));
    child.once("close", (code) => {
      if (exceededBytes > 0) {
        const error = new Error(exceededMessage || storageLimitError(exceededBytes).message) as Error & { code?: string; stderr?: string; stdout?: string };
        error.code = exceededMessage?.startsWith("Shared account storage") ? "ACCOUNT_STORAGE_LIMIT" : "WEB_DEPLOYMENT_STORAGE_LIMIT";
        error.stderr = stderr; error.stdout = stdout; finish(error); return;
      }
      if (timedOut) { const error = new Error(`Deployment command exceeded its ${Math.round(timeout / 60000)} minute time limit.`) as Error & { stderr?: string; stdout?: string }; error.stderr = stderr; error.stdout = stdout; finish(error); return; }
      if (code !== 0) { const error = new Error(`Deployment command failed with exit code ${code}.`) as Error & { stderr?: string; stdout?: string }; error.stderr = stderr; error.stdout = stdout; finish(error); return; }
      finish(undefined, `${stdout}${stderr}`.slice(-120000));
    });
    timeoutTimer = setTimeout(() => { timedOut = true; terminate(); }, timeout);
    timeoutTimer.unref();
    if (storageRoot) {
      monitor = setInterval(async () => {
        if (checking || settled || exceededBytes > 0 || child.exitCode !== null || child.signalCode) return;
        checking = true;
        try {
          const sizeBytes = await deploymentSizeBytes(storageRoot);
          if (sizeBytes > WEB_DEPLOYMENT_STORAGE_BYTES) { exceededBytes = sizeBytes; exceededMessage = storageLimitError(sizeBytes).message; terminate(); }
          if (userId && !isAdmin && accountStorageLimitMb !== undefined) {
            const accountBytes = await accountStorageUsageBytes(userId, true);
            if (accountBytes > accountStorageLimitMb * 1024 * 1024) { exceededBytes = accountBytes; exceededMessage = accountStorageLimitError(accountBytes, accountStorageLimitMb).message; terminate(); }
          }
        } catch (error) {
          logger.error({ err: error, cwd }, "Storage measurement failed during build; terminating workload fail-closed");
          exceededBytes = WEB_DEPLOYMENT_STORAGE_BYTES + 1;
          exceededMessage = "Storage usage could not be verified; build stopped for quota safety.";
          terminate();
        } finally { checking = false; }
      }, 5000);
      monitor.unref();
    }
  });
}

function redactDeploymentLog(id: number, message: string): string {
  let redacted = message;
  const secrets = [...(deploymentSecretValues.get(id) || [])].filter((value) => value.length > 0).sort((a, b) => b.length - a.length);
  for (const secret of secrets) redacted = redacted.split(secret).join("[REDACTED]");
  return redacted;
}

async function appendBuildLog(id: number, message: string, stage = "system", logType = "info"): Promise<string> {
  const safeMessage = redactDeploymentLog(id, message);
  const [current] = await db.select({ buildLog: webDeploymentsTable.buildLog, currentRunId: webDeploymentsTable.currentRunId }).from(webDeploymentsTable).where(eq(webDeploymentsTable.id, id));
  const next = `${current?.buildLog ? `${current.buildLog}\n` : ""}${safeMessage}`.slice(-120000);
  await db.update(webDeploymentsTable).set({ buildLog: next, updatedAt: new Date() }).where(eq(webDeploymentsTable.id, id));
  const runId = currentRunIds.get(id) || current?.currentRunId || `legacy-${id}`;
  const runKey = `${id}:${runId}`;
  let bytes = runLogBytes.get(runKey) || 0;
  for (let offset = 0; offset < safeMessage.length; offset += 4000) {
    const chunk = safeMessage.slice(offset, offset + 4000);
    const size = Buffer.byteLength(chunk, "utf8");
    if (bytes + size > MAX_WEB_LOG_BYTES_PER_RUN) break;
    await db.insert(webDeploymentLogsTable).values({ deploymentId: id, runId, stage, logType, message: chunk });
    bytes += size;
  }
  runLogBytes.set(runKey, bytes);
  if (bytes >= MAX_WEB_LOG_BYTES_PER_RUN && !truncatedLogRuns.has(runKey)) {
    truncatedLogRuns.add(runKey);
    await db.insert(webDeploymentLogsTable).values({ deploymentId: id, runId, stage: "system", logType: "warn", message: "Further output was omitted because this run reached its 2 MB log-retention limit." });
  }
  return next;
}

export async function cleanupExpiredWebDeploymentLogs(): Promise<void> {
  await db.delete(webDeploymentLogsTable).where(lt(webDeploymentLogsTable.createdAt, new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)));
}

export async function encryptLegacyWebDeploymentEnvVars(): Promise<number> {
  const rows = await db.select({ id: webDeploymentsTable.id, envVars: webDeploymentsTable.envVars }).from(webDeploymentsTable);
  let migrated = 0;
  for (const row of rows) {
    if (!row.envVars || typeof row.envVars !== "object" || Array.isArray(row.envVars)) continue;
    const values = Object.fromEntries(Object.entries(row.envVars as Record<string, unknown>).filter(([, value]) => value !== null && value !== undefined).map(([key, value]) => [key, String(value)]));
    if (!Object.keys(values).length) continue;
    const encrypted = encryptWebEnvVars(values);
    await db.update(webDeploymentsTable).set({ envVars: encrypted }).where(eq(webDeploymentsTable.id, row.id));
    migrated += 1;
  }
  return migrated;
}

function startRuntimeStorageMonitor(id: number, root: string, child: ReturnType<typeof spawn>, userId: number, accountStorageLimitMb: number, isAdmin: boolean): void {
  let checking = false;
  const timer = setInterval(async () => {
    if (checking || child.exitCode !== null || child.signalCode !== null) return;
    checking = true;
    try {
      const sizeBytes = await deploymentSizeBytes(root);
      const accountBytes = isAdmin ? 0 : await accountStorageUsageBytes(userId, true);
      const accountExceeded = !isAdmin && accountBytes > accountStorageLimitMb * 1024 * 1024;
      if (sizeBytes > WEB_DEPLOYMENT_STORAGE_BYTES || accountExceeded) {
        clearInterval(timer);
        runtimeStorageMonitors.delete(id);
        storageLimitExceeded.add(id);
        await appendBuildLog(id, accountExceeded ? `[BERAHOST] ERROR: Shared account storage quota exceeded (${(accountBytes / 1048576).toFixed(1)} MB / ${accountStorageLimitMb} MB). The service is being stopped.` : `[BERAHOST] ERROR: Runtime storage exceeded ${WEB_DEPLOYMENT_STORAGE_MB} MB. The service is being stopped.`).catch(() => {});
        try { if (child.pid) process.kill(-child.pid, "SIGTERM"); else child.kill("SIGTERM"); }
        catch { try { child.kill("SIGTERM"); } catch {} }
        const forceStop = setTimeout(() => {
          if (child.exitCode !== null || child.signalCode) return;
          try { if (child.pid) process.kill(-child.pid, "SIGKILL"); else child.kill("SIGKILL"); }
          catch { try { child.kill("SIGKILL"); } catch {} }
        }, 5000);
        forceStop.unref();
      }
    } catch (error) {
      logger.error({ err: error, webDeploymentId: id }, "Runtime storage measurement failed; stopping workload fail-closed");
      clearInterval(timer);
      runtimeStorageMonitors.delete(id);
      storageLimitExceeded.add(id);
      await appendBuildLog(id, "[BERAHOST] ERROR: Storage usage could not be verified; workload stopped for quota safety. Resolve storage visibility before restarting.").catch(() => {});
      try { if (child.pid) process.kill(-child.pid, "SIGTERM"); else child.kill("SIGTERM"); } catch { try { child.kill("SIGTERM"); } catch {} }
      const forceStop = setTimeout(() => { if (child.exitCode === null && child.signalCode === null) try { if (child.pid) process.kill(-child.pid, "SIGKILL"); else child.kill("SIGKILL"); } catch {} }, 5000);
      forceStop.unref();
    } finally {
      checking = false;
    }
  }, 10_000);
  timer.unref();
  runtimeStorageMonitors.set(id, timer);
}

function detectBuildCommand(pkg: any): string {
  if (pkg?.scripts?.build) return "npm run build";
  if (pkg?.scripts?.compile) return "npm run compile";
  const deps = { ...pkg?.dependencies, ...pkg?.devDependencies };
  if (deps.next) return "npx next build";
  if (deps.vite) return "npx vite build";
  if (deps["react-scripts"]) return "npx react-scripts build";
  if (deps.astro) return "npx astro build";
  if (deps.parcel) return "npx parcel build";
  return "";
}

function detectStartCommand(pkg: any, hasStaticOutput: boolean): string {
  if (hasStaticOutput) return "";
  if (pkg?.scripts?.start) return "npm start";
  for (const name of ["serve", "app", "run", "launch", "begin", "dev"]) if (pkg?.scripts?.[name]) return `npm run ${name}`;
  const deps = { ...pkg?.dependencies, ...pkg?.devDependencies };
  if (deps.next) return "npx next start -H 0.0.0.0";
  if (deps.vite) return "npx vite preview --host 0.0.0.0";
  if (pkg?.main) return `node ${pkg.main}`;
  return "";
}

async function findPackageRoot(root: string): Promise<{ root: string; pkg: any }> {
  const candidates = [root, "frontend", "client", "app", "website", "web"];
  const visited = new Set<string>();
  const queue = candidates.map((relative) => path.resolve(root, relative));
  while (queue.length > 0) {
    const candidate = queue.shift()!;
    if (visited.has(candidate)) continue;
    visited.add(candidate);
    try {
      const pkg = JSON.parse(await fs.readFile(path.join(candidate, "package.json"), "utf8"));
      return { root: candidate, pkg };
    } catch { /* inspect supported nested project directories below */ }
    const relativeDepth = path.relative(root, candidate).split(path.sep).filter(Boolean).length;
    if (relativeDepth >= 3) continue;
    for (const entry of await fs.readdir(candidate, { withFileTypes: true }).catch(() => [])) {
      if (entry.isDirectory() && entry.name !== "node_modules" && !entry.name.startsWith(".")) {
        queue.push(path.join(candidate, entry.name));
      }
    }
  }
  return { root, pkg: {} };
}

async function waitForPort(port: number, child: ReturnType<typeof spawn>, timeoutMs = 30_000): Promise<void> {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (child.exitCode !== null || child.signalCode) throw new Error("Web process exited before opening its assigned port.");
    const reachable = await new Promise<boolean>((resolve) => {
      const socket = net.createConnection({ host: "127.0.0.1", port });
      const finish = (ok: boolean) => { socket.destroy(); resolve(ok); };
      socket.once("connect", () => finish(true));
      socket.once("error", () => finish(false));
      socket.setTimeout(1000, () => finish(false));
    });
    if (reachable) return;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`Web process did not listen on port ${port} within ${timeoutMs / 1000}s.`);
}

async function probeHttpHealth(port: number, healthPath: string): Promise<boolean> {
  try {
    const response = await fetch(`http://127.0.0.1:${port}${healthPath}`, { redirect: "manual", signal: AbortSignal.timeout(2_000) });
    await response.body?.cancel().catch(() => {});
    return response.status >= 200 && response.status < 400;
  } catch { return false; }
}

async function waitForHttpHealth(port: number, healthPath: string, child: ReturnType<typeof spawn>, timeoutMs = 30_000): Promise<void> {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (child.exitCode !== null || child.signalCode) throw new Error("Web process exited before its configured health endpoint became ready.");
    if (await probeHttpHealth(port, healthPath)) return;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`Configured health endpoint ${healthPath} did not return a successful response within ${timeoutMs / 1000}s.`);
}

function startRuntimeHealthMonitor(id: number, port: number, healthPath: string, child: ReturnType<typeof spawn>): void {
  let lastHealthy = true;
  const timer = setInterval(async () => {
    if (child.exitCode !== null || child.signalCode !== null) { clearInterval(timer); runtimeHealthMonitors.delete(id); return; }
    const healthy = await probeHttpHealth(port, healthPath);
    await db.update(webDeploymentsTable).set({ healthStatus: healthy ? "healthy" : "unhealthy", lastHealthAt: new Date() }).where(eq(webDeploymentsTable.id, id)).catch(() => {});
    if (healthy !== lastHealthy) {
      await appendBuildLog(id, healthy ? `[BERAHOST] Health check recovered at ${healthPath}.` : `[BERAHOST] Health check failed at ${healthPath}.`, "health", healthy ? "info" : "warn").catch(() => {});
      lastHealthy = healthy;
    }
  }, 30_000);
  timer.unref();
  runtimeHealthMonitors.set(id, timer);
}

async function downloadGithubRepository(repoUrl: string, branch: string, root: string, accessToken?: string | null): Promise<void> {
  const match = repoUrl.match(/^https:\/\/github\.com\/([^/]+)\/([^/]+?)(?:\.git)?$/i);
  if (!match) throw new Error("Only GitHub repository URLs are supported.");
  const owner = match[1];
  const repository = match[2];
  const headers: Record<string, string> = { "User-Agent": "BERAHOST-GitHub-Integration/1.0", Accept: "application/vnd.github+json" };
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
  const response = await fetch(`https://codeload.github.com/${encodeURIComponent(owner)}/${encodeURIComponent(repository)}/tar.gz/refs/heads/${encodeURIComponent(branch)}`, { headers });
  if (!response.ok) throw new Error(`GitHub repository download failed (${response.status}). Check that the repository, branch, and GitHub access are valid.`);
  const announcedSize = Number(response.headers.get("content-length") || 0);
  if (announcedSize > WEB_DEPLOYMENT_STORAGE_BYTES) throw storageLimitError(announcedSize);
  const archive = `${root}.source.tar.gz`;
  if (!response.body) throw new Error("GitHub returned an empty repository archive.");
  const reader = response.body.getReader();
  const file = await fs.open(archive, "w");
  let archiveBytes = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      archiveBytes += value.byteLength;
      if (archiveBytes > WEB_DEPLOYMENT_STORAGE_BYTES) throw storageLimitError(archiveBytes);
      await file.write(value);
    }
  } catch (error) {
    await reader.cancel().catch(() => {});
    await fs.rm(archive, { force: true }).catch(() => {});
    throw error;
  } finally {
    reader.releaseLock();
    await file.close();
  }
  await run(`tar -xzf ${JSON.stringify(archive)} -C ${JSON.stringify(root)} --strip-components=1`, root, {}, 5 * 60 * 1000, root);
  await fs.rm(archive, { force: true });
}

export function webUrl(slug: string) { return webDeploymentUrl(slug); }

/** Add owner access without following repository-provided symlinks. */
async function addOwnerAccessWithoutFollowingSymlinks(target: string): Promise<void> {
  const stat = await fs.lstat(target);
  if (stat.isSymbolicLink()) return;
  const currentMode = stat.mode & 0o7777;
  if (stat.isDirectory()) {
    await fs.chmod(target, currentMode | 0o700);
    for (const entry of await fs.readdir(target, { withFileTypes: true })) {
      await addOwnerAccessWithoutFollowingSymlinks(path.join(target, entry.name));
    }
    return;
  }
  if (stat.isFile()) {
    const ownerExecute = (currentMode & 0o111) !== 0 ? 0o100 : 0;
    await fs.chmod(target, currentMode | 0o600 | ownerExecute);
  }
}

export async function startWebDeployment(id: number): Promise<void> {
  if (startingWebDeployments.has(id)) return;
  if (runningWebProcesses.has(id)) {
    await db.update(webDeploymentsTable).set({ status: "running", stopReason: null, updatedAt: new Date() }).where(eq(webDeploymentsTable.id, id)).catch(() => {});
    return;
  }
  startingWebDeployments.add(id);
  try {
  const [deployment] = await db.select().from(webDeploymentsTable).where(eq(webDeploymentsTable.id, id));
  if (!deployment) return;
  const [owner] = await db.select().from(usersTable).where(eq(usersTable.id, deployment.userId));
  if (!owner || owner.isBanned || owner.deletedAt || (!owner.isAdmin && !isSubscriptionActive(owner))) {
    await db.update(webDeploymentsTable).set({ status: "stopped", pid: null, runtimePort: null, updatedAt: new Date() }).where(eq(webDeploymentsTable.id, id));
    return;
  }
  const root = deploymentRoot(id);
  const accountLimits = await ensureAccountCgroup(deployment.userId);
  const assertAccountStorage = async () => {
    await assertStorageLimit(root);
    if (accountLimits.isAdmin) return;
    const used = await accountStorageUsageBytes(deployment.userId, true);
    if (used > accountLimits.storageMb * 1024 * 1024) throw accountStorageLimitError(used, accountLimits.storageMb);
  };
  const port = WEB_PORT_START + id;
  const runId = crypto.randomUUID();
  currentRunIds.set(id, runId);
  runLogBytes.set(`${id}:${runId}`, 0);
  truncatedLogRuns.delete(`${id}:${runId}`);
  try {
    await db.update(webDeploymentsTable).set({ status: "building", currentRunId: runId, stopReason: null, lastExitCode: null, healthStatus: "starting", updatedAt: new Date(), buildLog: "" }).where(eq(webDeploymentsTable.id, id));
    const envVars = decryptWebEnvVars(deployment.envVars);
    deploymentSecretValues.set(id, Object.values(envVars).filter((value) => value.length > 0));
    await appendBuildLog(id, "[BERAHOST] Cloning repository...", "clone");
    const repo = normalizeGithubUrl(deployment.repoUrl);
    if (!repo) throw new Error("Only GitHub repository URLs are supported.");
    const accessToken = decryptGithubToken(owner.githubAccessTokenEncrypted);
    if (deployment.githubPrivate && !accessToken) throw new Error("Reconnect GitHub to access this private repository.");
    await fs.rm(root, { recursive: true, force: true });
    await fs.mkdir(root, { recursive: true });
    await assertAccountStorage();
    await downloadGithubRepository(repo, deployment.branch, root, accessToken);
    await assertAccountStorage();
    const workloadOwnerUid = workloadUid(deployment.userId);
    await execFileAsync("chown", ["-R", `${workloadOwnerUid}:${workloadOwnerUid}`, root], { timeout: 60_000, maxBuffer: 1024 * 1024 });
    await addOwnerAccessWithoutFollowingSymlinks(root);
    await fs.chmod(root, 0o700);
    const discoveredProject = await findPackageRoot(root);
    let manifest = null;
    try { manifest = parseBerahostYml(await fs.readFile(path.join(root, "berahost.yml"), "utf8")); }
    catch (error: any) { if (error?.code !== "ENOENT") throw error; }
    if (manifest && deployment.projectType && manifest.project.type !== deployment.projectType) {
      throw new Error(`berahost.yml declares '${manifest.project.type}', but the dashboard selected '${deployment.projectType}'. Make them match and retry.`);
    }
    const selectedType: WebProjectType = deployment.projectType === "static" || deployment.projectType === "service"
      ? deployment.projectType
      : manifest?.project.type || (deployment.startCommand ? "service" : "static");
    const detectedProjectRoot = path.relative(root, discoveredProject.root) || ".";
    const projectRootRelative = manifest?.project.root ?? detectedProjectRoot;
    const packageRootCandidate = path.resolve(root, projectRootRelative);
    const rootRealPath = await fs.realpath(root);
    const packageRoot = await fs.realpath(packageRootCandidate);
    if (packageRoot !== rootRealPath && !packageRoot.startsWith(`${rootRealPath}${path.sep}`)) throw new Error("Project root resolves outside the uploaded repository.");
    let pkg: any = {};
    try { pkg = JSON.parse(await fs.readFile(path.join(packageRoot, "package.json"), "utf8")); }
    catch (error: any) { if (error?.code !== "ENOENT") throw new Error("The project package.json is invalid."); }
    const scannedGroups = await Promise.all([scanWebEnv(root), scanWebEnv(packageRoot)]);
    const scannedVars = [...new Map(scannedGroups.flat().map((item) => [item.key, item])).values()];
    await appendBuildLog(id, "[BERAHOST] Repository cloned. Reading project configuration and environment templates...", "detect");
    await db.update(webDeploymentsTable).set({ scannedVars }).where(eq(webDeploymentsTable.id, id));
    if (Object.keys(pkg).length > 0) {
      await appendBuildLog(id, `[BERAHOST] Detected package manifest in ${path.relative(root, packageRoot) || "."}.`, "detect");
    } else {
      await appendBuildLog(id, "[BERAHOST] No readable package.json was found in the extracted repository.", "detect");
    }
    const detectedInstallCommand = Object.keys(pkg).length === 0 ? "" : await fs.access(path.join(packageRoot, "pnpm-lock.yaml")).then(() => "corepack pnpm install --frozen-lockfile").catch(async () => await fs.access(path.join(packageRoot, "yarn.lock")).then(() => "corepack yarn install --frozen-lockfile").catch(() => "npm_config_legacy_peer_deps=true npm install --legacy-peer-deps --no-audit --no-fund || (rm -rf node_modules && corepack pnpm install --no-frozen-lockfile --no-audit)"));
    const installCommand = deployment.installCommand || manifest?.install || detectedInstallCommand;
    if (installCommand) {
      await appendBuildLog(id, `[BERAHOST] Installing dependencies with: ${installCommand}`, "install");
      const installLog = await run(installCommand, packageRoot, envVars, 15 * 60 * 1000, root, deployment.userId, accountLimits.isAdmin, accountLimits.storageMb);
      await assertAccountStorage();
      await appendBuildLog(id, `[BERAHOST] Dependencies installed.\n${installLog}`, "install");
    }
    const buildCommand = deployment.buildCommand || manifest?.build || detectBuildCommand(pkg);
    const startCommand = selectedType === "service" ? deployment.startCommand || manifest?.start || detectStartCommand(pkg, false) : "";
    if (buildCommand) {
      await appendBuildLog(id, `[BERAHOST] Build command detected: ${buildCommand}`, "build");
      const buildLog = await run(buildCommand, packageRoot, { ...envVars, PORT: String(port) }, 15 * 60 * 1000, root, deployment.userId, accountLimits.isAdmin, accountLimits.storageMb, port);
      await assertAccountStorage();
      await appendBuildLog(id, `[BERAHOST] Build completed.\n${buildLog}`, "build");
    }
    let staticRoot: string | undefined;
    if (selectedType === "static") {
      if (manifest?.output) {
        const outputCandidate = path.resolve(packageRoot, manifest.output);
        const outputStat = await fs.stat(outputCandidate).catch(() => null);
        if (!outputStat?.isDirectory()) throw new Error(`berahost.yml output directory '${manifest.output}' was not found after the build.`);
        const outputRealPath = await fs.realpath(outputCandidate);
        if (outputRealPath !== packageRoot && !outputRealPath.startsWith(`${packageRoot}${path.sep}`)) throw new Error("Static output resolves outside the project root.");
        staticRoot = outputRealPath;
      } else {
        const candidates = ["dist", "build", "out", "public"].map((dir) => path.join(packageRoot, dir));
        staticRoot = (await Promise.all(candidates.map(async (candidate) => (await fs.stat(candidate).catch(() => null))?.isDirectory() ? candidate : null))).find(Boolean) as string | undefined;
        if (!staticRoot && (await fs.stat(path.join(packageRoot, "index.html")).catch(() => null))?.isFile()) staticRoot = packageRoot;
      }
    }
    const detectedConfig = {
      projectRoot: projectRootRelative,
      installCommand: detectedInstallCommand,
      buildCommand: detectBuildCommand(pkg),
      startCommand: detectStartCommand(pkg, selectedType === "static" && Boolean(staticRoot)),
      outputDirectory: staticRoot ? path.relative(packageRoot, staticRoot) || "." : "",
      servicePort: manifest?.service?.port,
      healthPath: manifest?.service?.health_path,
    };
    const resolvedConfig = resolveWebProjectConfig({
      selectedType,
      manifest,
      detected: detectedConfig,
      overrides: { installCommand: deployment.installCommand || undefined, buildCommand: deployment.buildCommand || undefined, startCommand: deployment.startCommand || undefined },
    });
    if (selectedType === "service" && manifest?.service?.port) {
      await appendBuildLog(id, `[BERAHOST] Manifest service.port ${manifest.service.port} is recorded as a project hint; the current runner assigns PORT=${port}, so the service must honor the platform PORT environment variable.`, "detect", "warn");
    }
    await db.update(webDeploymentsTable).set({ projectType: selectedType, manifestConfig: manifest, detectedConfig, installCommand: resolvedConfig.installCommand || null, buildCommand: resolvedConfig.buildCommand || null, startCommand: resolvedConfig.startCommand || null, healthPath: manifest?.service?.health_path || null }).where(eq(webDeploymentsTable.id, id));
    const resolvedStartCommand = resolvedConfig.startCommand;
    if (buildCommand || resolvedStartCommand) await appendBuildLog(id, `[BERAHOST] ${buildCommand ? `Build: ${buildCommand}` : "No build script"}; ${resolvedStartCommand ? `Start: ${resolvedStartCommand}` : "static output detected"}`, "detect");
    if (staticRoot && !startCommand) {
      await assertAccountStorage();
      await appendBuildLog(id, "[BERAHOST] Static site built and ready.", "start");
      await db.update(webDeploymentsTable).set({ status: "running", healthStatus: "healthy", lastHealthAt: new Date(), stopReason: null, outputDirectory: path.relative(root, staticRoot) || ".", runtimePort: null, pid: null }).where(eq(webDeploymentsTable.id, id));
      deploymentSecretValues.delete(id);
      return;
    }
    if (!startCommand) throw new Error("No build output or start command was found. Add a build/start command or a package.json script.");
    const uid = workloadUid(deployment.userId);
    await prepareWorkloadHome(root, deployment.userId);
    await appendBuildLog(id, "[BERAHOST] Starting web service process...", "start");
    const child = spawn("bash", ["-lc", !accountLimits.isAdmin ? `kill -STOP $$\n${startCommand}` : startCommand], { cwd: packageRoot, env: workloadEnvironment(root, envVars, "production", port), detached: true, stdio: ["ignore", "pipe", "pipe"], uid, gid: uid });
    if (!accountLimits.isAdmin && child.pid) { try { await attachAccountProcess(deployment.userId, child.pid); process.kill(child.pid, "SIGCONT"); } catch (error) { try { process.kill(-child.pid, "SIGKILL"); } catch {} throw error; } }
    runningWebProcesses.set(id, child);
    let logFlush: NodeJS.Timeout | undefined;
    const queuedLines: Array<{ stream: "stdout" | "stderr"; line: string }> = [];
    const pendingLines: Record<"stdout" | "stderr", string> = { stdout: "", stderr: "" };
    const flushRuntimeLines = async (final = false) => {
      if (logFlush) { clearTimeout(logFlush); logFlush = undefined; }
      if (final) {
        for (const stream of ["stdout", "stderr"] as const) {
          if (pendingLines[stream]) queuedLines.push({ stream, line: pendingLines[stream] });
          pendingLines[stream] = "";
        }
      }
      const batch = queuedLines.splice(0, queuedLines.length);
      for (const entry of batch) await appendBuildLog(id, entry.line, "runtime", entry.stream);
    };
    const scheduleFlush = () => {
      if (!logFlush) logFlush = setTimeout(() => { logFlush = undefined; void flushRuntimeLines().catch((error) => logger.error({ err: error, webDeploymentId: id }, "Could not persist web runtime logs")); }, 250);
    };
    const appendStream = (stream: "stdout" | "stderr") => (chunk: Buffer) => {
      pendingLines[stream] += chunk.toString();
      const lines = pendingLines[stream].split("\n");
      pendingLines[stream] = lines.pop() || "";
      for (const line of lines) queuedLines.push({ stream, line: `${line}\n` });
      if (queuedLines.length) scheduleFlush();
    };
    child.stdout?.on("data", appendStream("stdout")); child.stderr?.on("data", appendStream("stderr"));
    child.once("close", async (code) => {
      await flushRuntimeLines(true).catch((error) => logger.error({ err: error, webDeploymentId: id }, "Could not flush final web runtime logs"));
      const monitor = runtimeStorageMonitors.get(id);
      if (monitor) clearInterval(monitor);
      runtimeStorageMonitors.delete(id);
      if (runningWebProcesses.get(id) === child) runningWebProcesses.delete(id);
      const exceededStorage = storageLimitExceeded.delete(id);
      const requestedStop = requestedStops.delete(id);
      const failedStart = failedStartIds.delete(id);
      const status = failedStart ? "failed" : exceededStorage ? "stopped" : requestedStop || code === 0 ? "stopped" : "crashed";
      const stopReason = failedStart ? "health_check_failed" : exceededStorage ? "storage_quota" : requestedStop ? "manual" : code === 0 ? "clean_exit" : "crashed";
      if (exceededStorage) await appendBuildLog(id, "[BERAHOST] ERROR: Storage quota exceeded. Workload stopped without automatic restart; remove stored files before restarting.", "runtime", "error").catch(() => {});
      const healthMonitor = runtimeHealthMonitors.get(id);
      if (healthMonitor) clearInterval(healthMonitor);
      runtimeHealthMonitors.delete(id);
      await db.update(webDeploymentsTable).set({ status, pid: null, runtimePort: null, lastExitCode: code ?? null, stopReason, healthStatus: failedStart ? "error" : status === "crashed" ? "unhealthy" : "stopped", updatedAt: new Date() }).where(eq(webDeploymentsTable.id, id)).catch(() => {});
      deploymentSecretValues.delete(id);

    });
    if (manifest?.service?.health_path) await waitForHttpHealth(port, manifest.service.health_path, child);
    else await waitForPort(port, child);
    await assertAccountStorage();
    await db.update(webDeploymentsTable).set({ status: "running", healthStatus: "healthy", lastHealthAt: new Date(), stopReason: null, outputDirectory: null, runtimePort: port, pid: child.pid ?? null, updatedAt: new Date() }).where(eq(webDeploymentsTable.id, id));
    startRuntimeStorageMonitor(id, root, child, deployment.userId, accountLimits.storageMb, accountLimits.isAdmin);
    if (manifest?.service?.health_path) startRuntimeHealthMonitor(id, port, manifest.service.health_path, child);
    child.unref();
  } catch (err: any) {
    logger.error({ err, webDeploymentId: id }, "Web deployment failed");
    await appendBuildLog(id, `[BERAHOST] ERROR: ${String(err?.stderr || err?.message || err)}`, "system", "error").catch(() => {});
    const child = runningWebProcesses.get(id);
    if (child) {
      failedStartIds.add(id);
      try { if (child.pid) process.kill(-child.pid, "SIGTERM"); else child.kill("SIGTERM"); } catch { try { child.kill("SIGTERM"); } catch {} }
      runningWebProcesses.delete(id);
    }
    const healthMonitor = runtimeHealthMonitors.get(id);
    if (healthMonitor) clearInterval(healthMonitor);
    runtimeHealthMonitors.delete(id);
    await db.update(webDeploymentsTable).set({ status: "failed", healthStatus: "error", stopReason: err?.code || "build_failed" }).where(eq(webDeploymentsTable.id, id)).catch(() => {});
    if (!child) deploymentSecretValues.delete(id);
    await fs.rm(`${root}.source.tar.gz`, { force: true }).catch(() => {});
  }
  } finally {
    startingWebDeployments.delete(id);
  }
}

export async function stopWebDeployment(id: number): Promise<void> {
  const monitor = runtimeStorageMonitors.get(id);
  if (monitor) clearInterval(monitor);
  runtimeStorageMonitors.delete(id);
  const healthMonitor = runtimeHealthMonitors.get(id);
  if (healthMonitor) clearInterval(healthMonitor);
  runtimeHealthMonitors.delete(id);
  const child = runningWebProcesses.get(id);
  if (child) requestedStops.add(id);
  if (child?.pid) { try { process.kill(-child.pid, "SIGTERM"); } catch { try { child.kill("SIGTERM"); } catch {} } }
  runningWebProcesses.delete(id);
  await db.update(webDeploymentsTable).set({ status: "stopped", pid: null, runtimePort: null, healthStatus: "stopped", stopReason: "manual", updatedAt: new Date() }).where(eq(webDeploymentsTable.id, id));
}

const redeployingWeb = new Set<number>();

export async function redeployWebDeployment(id: number, commitSha?: string, commitMessage?: string): Promise<void> {
  if (redeployingWeb.has(id)) return;
  redeployingWeb.add(id);
  try {
    const [deployment] = await db.select().from(webDeploymentsTable).where(eq(webDeploymentsTable.id, id));
    if (!deployment || !deployment.autoDeploy) return;
    await db.update(webDeploymentsTable).set({ lastCommitSha: commitSha || deployment.lastCommitSha, lastCommitMessage: commitMessage || deployment.lastCommitMessage, status: "queued", updatedAt: new Date() }).where(eq(webDeploymentsTable.id, id));
    await stopWebDeployment(id);
    await startWebDeployment(id);
  } finally {
    redeployingWeb.delete(id);
  }
}

export async function deleteWebDeployment(id: number): Promise<void> {
  await stopWebDeployment(id);
  await fs.rm(deploymentRoot(id), { recursive: true, force: true });
}

async function resolveDeployment(reqPath: string, host: string) {
  const hostSlug = webDeploymentSlugFromHost(host);
  if (hostSlug) {
    const [deployment] = await db.select().from(webDeploymentsTable).where(eq(webDeploymentsTable.slug, hostSlug));
    return { deployment, assetPath: reqPath.replace(/^\/+/, "") };
  }
  const parts = reqPath.split("/").filter(Boolean);
  const slug = parts[0] === "web" ? parts[1] : undefined;
  if (slug && isSafeSlug(slug)) {
    const [deployment] = await db.select().from(webDeploymentsTable).where(eq(webDeploymentsTable.slug, slug));
    return { deployment, assetPath: parts.slice(2).join("/") };
  }
  const [domain] = await db.select().from(domainOrdersTable).where(and(eq(domainOrdersTable.hostname, host.split(":")[0].toLowerCase()), eq(domainOrdersTable.status, "active")));
  if (!domain) return { deployment: null, assetPath: "" };
  const [deployment] = await db.select().from(webDeploymentsTable).where(eq(webDeploymentsTable.id, domain.webDeploymentId));
  return { deployment, assetPath: reqPath.replace(/^\//, "") };
}

export async function handleWebRequest(req: any, res: any, next: any): Promise<void> {
  const isWebPath = req.path === "/web" || req.path.startsWith("/web/");
  const host = String(req.headers.host || "").toLowerCase();
  const hostSlug = webDeploymentSlugFromHost(host);
  const isCustomDomain = !host.includes("localhost") && !host.includes("127.0.0.1") && !host.includes("replit") && !host.includes("manus");
  if (!isWebPath && !isCustomDomain && !hostSlug) return next();
  const { deployment, assetPath } = await resolveDeployment(req.path, host);
  if (!deployment) return hostSlug ? res.status(404).send("No web deployment is assigned to this subdomain.") : next();
  if (deployment.status !== "running") return res.status(503).send("This web deployment is currently suspended or unavailable.");
  if (deployment.outputDirectory) {
    const root = deploymentRoot(deployment.id);
    const relative = assetPath || "index.html";
    const filePath = path.resolve(root, deployment.outputDirectory, relative);
    const base = path.resolve(root, deployment.outputDirectory);
    const safePath = filePath.startsWith(`${base}${path.sep}`) ? filePath : path.join(base, "index.html");
    try { return res.sendFile(safePath); } catch { return res.status(404).send("Page not found"); }
  }
  if (!deployment.runtimePort) return res.status(503).send("Web runtime is not ready.");
  try {
    const target = `http://127.0.0.1:${deployment.runtimePort}/${assetPath}`;
    const body = ["GET", "HEAD"].includes(req.method) ? undefined : JSON.stringify(req.body || {});
    const response = await fetch(target, { method: req.method, headers: { ...req.headers, host: `127.0.0.1:${deployment.runtimePort}` } as any, body });
    res.status(response.status);
    response.headers.forEach((value, key) => { if (key.toLowerCase() !== "transfer-encoding") res.setHeader(key, value); });
    res.send(Buffer.from(await response.arrayBuffer()));
  } catch { res.status(502).send("Web runtime is not responding."); }
}

export function generateSlug() { return `site-${crypto.randomBytes(7).toString("hex")}`; }
