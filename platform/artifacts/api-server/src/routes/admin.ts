import { Router } from "express";
import os from "os";
import { db, usersTable, deploymentsTable, botsTable, coinTransactionsTable, paymentTransactionsTable, vouchersTable, auditLogsTable, platformSettingsTable, supportTicketsTable, ticketMessagesTable, broadcastsTable, notificationsTable, webDeploymentsTable } from "@workspace/db";
import { eq, desc, count, sum, sql, ilike, or, and } from "drizzle-orm";
import { requireAdmin } from "../middlewares/requireAdmin";
import { logger } from "../lib/logger";
import { getWASenderStatus, connectViaPair, disconnect as waDisconnect, initFromSession } from "../lib/waSender";

import { serializeBot } from "./bots";
import { serializeUser } from "../lib/auth";
import { stopBotProcess, startBotProcess, availableSlots, runningProcesses } from "../lib/botProcess";
import { addCoins } from "../lib/coins";
import { hashSessionId } from "../lib/auth";
import { stopWebDeployment } from "../lib/webProcess";
import { validateSubscriptionPlanPrices } from "../lib/subscriptions";

const router = Router();

// --- ADMIN STATS ---
router.get("/admin/stats", requireAdmin, async (req, res): Promise<void> => {
  const [totalUsersResult] = await db.select({ count: count() }).from(usersTable);
  const [activeBotsResult] = await db
    .select({ count: count() })
    .from(deploymentsTable)
    .where(eq(deploymentsTable.status, "running"));
  const [coinsResult] = await db.select({ total: sum(usersTable.coins) }).from(usersTable);
  const [openTicketsResult] = await db
    .select({ count: count() })
    .from(supportTicketsTable)
    .where(eq(supportTicketsTable.status, "open"));

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const [revenueResult] = await db
    .select({ total: sum(paymentTransactionsTable.amountKes) })
    .from(paymentTransactionsTable)
    .where(sql`${paymentTransactionsTable.createdAt} >= ${today} AND ${paymentTransactionsTable.status} = 'success'`);

  const [totalDepsResult] = await db.select({ count: count() }).from(deploymentsTable);
  const [activeSubscriptionsResult] = await db.select({ count: count() }).from(usersTable).where(sql`${usersTable.subscriptionPlan} <> 'free' AND ${usersTable.subscriptionExpiresAt} > NOW()`);

  res.json({
    totalUsers: totalUsersResult.count,
    activeBots: activeBotsResult.count,
    activeSubscriptions: activeSubscriptionsResult.count,
    todayRevenue: Number(revenueResult.total) || 0,
    totalDeployments: totalDepsResult.count,
    openTickets: openTicketsResult.count,
    // Capacity stats
    capacity: {
      slotsTotal: 2900,
      slotsUsed: runningProcesses.size,
      slotsAvailable: availableSlots(),
      maxConcurrentBots: 2900,
    },
  });
});

// --- REVENUE CHART ---
router.get("/admin/revenue-chart", requireAdmin, async (req, res): Promise<void> => {
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const result = await db
    .select({
      date: sql<string>`DATE(${paymentTransactionsTable.createdAt})`,
      revenue: sum(paymentTransactionsTable.amountKes),
    })
    .from(paymentTransactionsTable)
    .where(sql`${paymentTransactionsTable.createdAt} >= ${thirtyDaysAgo} AND ${paymentTransactionsTable.status} = 'success'`)
    .groupBy(sql`DATE(${paymentTransactionsTable.createdAt})`)
    .orderBy(sql`DATE(${paymentTransactionsTable.createdAt})`);

  res.json(result.map((r) => ({ date: r.date, revenue: Number(r.revenue) || 0 })));
});

// --- USERS ---
router.get("/admin/users", requireAdmin, async (req, res): Promise<void> => {
  const users = await db.select().from(usersTable).orderBy(desc(usersTable.createdAt));
  res.json(users.map(serializeUser));
});

router.post("/admin/users/:id/ban", requireAdmin, async (req, res): Promise<void> => {
  const adminUser = (req as any).user;
  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);
  const { banned, reason } = req.body;

  await db.update(usersTable).set({ isBanned: banned }).where(eq(usersTable.id, id));

  if (banned) {
    // Stop all their bots
    const deps = await db.select().from(deploymentsTable).where(eq(deploymentsTable.userId, id));
    for (const dep of deps) {
      await stopBotProcess(dep.id).catch(() => {});
    }
    const webDeps = await db.select({ id: webDeploymentsTable.id }).from(webDeploymentsTable).where(eq(webDeploymentsTable.userId, id));
    for (const dep of webDeps) await stopWebDeployment(dep.id).catch(() => {});
  }

  await db.insert(auditLogsTable).values({
    adminId: adminUser.id,
    action: banned ? "ban_user" : "unban_user",
    details: { targetUserId: id, reason },
    ipAddress: req.ip || null,
  });

  res.json({ message: banned ? "User banned" : "User unbanned" });
});

router.post("/admin/users/:id/coins", requireAdmin, async (req, res): Promise<void> => {
  const adminUser = (req as any).user;
  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);
  const { amount, reason } = req.body;

  if (typeof amount !== "number") {
    res.status(400).json({ error: "Amount must be a number" });
    return;
  }

  if (amount > 0) {
    await addCoins(id, amount, "gift", `Admin: ${reason}`);
  } else {
    await db
      .update(usersTable)
      .set({ coins: sql`GREATEST(0, ${usersTable.coins} + ${amount})` })
      .where(eq(usersTable.id, id));
  }

  await db.insert(auditLogsTable).values({
    adminId: adminUser.id,
    action: "adjust_coins",
    details: { targetUserId: id, amount, reason },
    ipAddress: req.ip || null,
  });

  res.json({ message: `${amount > 0 ? "Added" : "Deducted"} ${Math.abs(amount)} coins` });
});

router.delete("/admin/users/:id", requireAdmin, async (req, res): Promise<void> => {
  const adminUser = (req as any).user;
  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);
  if (id === adminUser.id) { res.status(400).json({ error: "You cannot delete your own admin account." }); return; }
  const [target] = await db.select({ id: usersTable.id }).from(usersTable).where(eq(usersTable.id, id));
  if (!target) { res.status(404).json({ error: "User not found" }); return; }
  const deps = await db.select({ id: deploymentsTable.id }).from(deploymentsTable).where(eq(deploymentsTable.userId, id));
  for (const dep of deps) await stopBotProcess(dep.id).catch(() => {});
  const webDeps = await db.select({ id: webDeploymentsTable.id }).from(webDeploymentsTable).where(eq(webDeploymentsTable.userId, id));
  for (const dep of webDeps) await stopWebDeployment(dep.id).catch(() => {});
  await db.update(usersTable).set({ isBanned: true, deletedAt: new Date(), subscriptionPlan: "free", subscriptionExpiresAt: null }).where(eq(usersTable.id, id));
  await db.insert(auditLogsTable).values({ adminId: adminUser.id, action: "delete_user", details: { targetUserId: id }, ipAddress: req.ip || null });
  res.json({ message: "User deleted and hosting stopped. Historical records were retained." });
});

router.post("/admin/users/:id/override-session", requireAdmin, async (req, res): Promise<void> => {
  const adminUser = (req as any).user;
  const { deploymentId, newSessionId, reason } = req.body;

  if (!deploymentId || !newSessionId || !reason) {
    res.status(400).json({ error: "deploymentId, newSessionId, and reason are required" });
    return;
  }

  const [dep] = await db.select().from(deploymentsTable).where(eq(deploymentsTable.id, deploymentId));
  if (!dep) {
    res.status(404).json({ error: "Deployment not found" });
    return;
  }

  const currentEnv = (dep.envVars as Record<string, string>) || {};
  const updatedEnv = { ...currentEnv, SESSION_ID: newSessionId };

  await db
    .update(deploymentsTable)
    .set({
      envVars: updatedEnv,
      sessionIdHash: hashSessionId(newSessionId),
      updatedAt: new Date(),
    })
    .where(eq(deploymentsTable.id, deploymentId));

  await db.insert(auditLogsTable).values({
    adminId: adminUser.id,
    action: "override_session_id",
    details: { deploymentId, reason },
    ipAddress: req.ip || null,
  });

  res.json({ message: "SESSION_ID overridden successfully" });
});

// --- DEPLOYMENTS ---
router.get("/admin/deployments", requireAdmin, async (req, res): Promise<void> => {
  const deps = await db
    .select()
    .from(deploymentsTable)
    .orderBy(desc(deploymentsTable.createdAt))
    .limit(200);

  const result = await Promise.all(
    deps.map(async (dep) => {
      const [user] = await db.select({ email: usersTable.email }).from(usersTable).where(eq(usersTable.id, dep.userId));
      const [bot] = await db.select({ name: botsTable.name }).from(botsTable).where(eq(botsTable.id, dep.botId));
      return {
        id: dep.id,
        userId: dep.userId,
        botId: dep.botId,
        containerId: dep.containerId,
        pid: dep.pid,
        status: dep.status,
        platform: dep.platform,
        storageUsedMb: dep.storageUsedMb,
        createdAt: dep.createdAt.toISOString(),
        user: { email: user?.email || "Unknown" },
        bot: { name: bot?.name || "Unknown" },
      };
    })
  );

  res.json(result);
});

router.post("/admin/deployments/:id/stop", requireAdmin, async (req, res): Promise<void> => {
  const adminUser = (req as any).user;
  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);

  await stopBotProcess(id);

  await db.insert(auditLogsTable).values({
    adminId: adminUser.id,
    action: "force_stop_deployment",
    details: { deploymentId: id },
    ipAddress: req.ip || null,
  });

  res.json({ message: "Deployment stopped" });
});

// --- BOTS ---
// ── helpers ─────────────────────────────────────────────────────────────────
type SyncVar = { key: string; defaultValue: string; description: string };

function parseEnvFile(content: string): SyncVar[] {
  const vars: SyncVar[] = [];
  let lastComment = "";
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (trimmed.startsWith("#")) {
      lastComment = trimmed.replace(/^#+\s*/, "");
      continue;
    }
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx === -1) { lastComment = ""; continue; }
    const key = trimmed.slice(0, eqIdx).trim();
    const val = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, "");
    if (key && /^[A-Z_][A-Z0-9_]*$/i.test(key)) {
      vars.push({ key, defaultValue: val, description: lastComment });
    }
    lastComment = "";
  }
  return vars;
}

function parseJsonConfig(content: string): SyncVar[] {
  const vars: SyncVar[] = [];
  try {
    const obj = JSON.parse(content);
    if (typeof obj !== "object" || Array.isArray(obj)) return vars;
    for (const [key, val] of Object.entries(obj)) {
      if (typeof val === "string" || typeof val === "number" || typeof val === "boolean") {
        vars.push({ key, defaultValue: String(val), description: "" });
      }
    }
  } catch { /* ignore */ }
  return vars;
}

function parseJsConfig(content: string): SyncVar[] {
  const vars: SyncVar[] = [];
  const commentMap: Record<string, string> = {};
  const lines = content.split("\n");
  let lastComment = "";
  for (const line of lines) {
    const trimmed = line.trim();
    if (/^\/\//.test(trimmed)) {
      lastComment = trimmed.replace(/^\/\/\s*/, "");
      continue;
    }
    // match: KEY: "value", or KEY: 'value', or KEY: value,
    const kv = trimmed.match(/^["']?([A-Z_][A-Z0-9_]*)["']?\s*:\s*["']?([^"',}\n]*)["']?,?/i);
    if (kv) {
      const key = kv[1].trim();
      const val = kv[2].trim().replace(/^["']|["']$/g, "");
      commentMap[key] = lastComment;
      vars.push({ key, defaultValue: val, description: lastComment });
    }
    lastComment = "";
  }
  // Deduplicate by key
  const seen = new Set<string>();
  return vars.filter(v => { if (seen.has(v.key)) return false; seen.add(v.key); return true; });
}

// ── package.json metadata extraction ────────────────────────────────────────
function toTitleCase(str: string): string {
  return str
    .replace(/^@[^/]+\//, "") // strip npm scope
    .replace(/[-_]/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();
}

function detectStartCommand(pkg: any): string {
  if (!pkg?.scripts) return "npm start";
  const { start, dev, app, run, serve, begin, launch } = pkg.scripts;
  // Prefer 'start' over others; avoid dev servers for production
  if (start) return `npm start`;
  if (app) return `npm run app`;
  if (serve) return `npm run serve`;
  if (begin) return `npm run begin`;
  if (launch) return `npm run launch`;
  if (run) return `npm run run`;
  if (dev) return `npm run dev`;
  // Fallback: use main field
  if (pkg.main) return `node ${pkg.main}`;
  return "npm start";
}

function detectPlatform(pkg: any, repoName: string): string {
  const haystack = [
    repoName,
    pkg?.name || "",
    pkg?.description || "",
    ...(pkg?.keywords || []),
  ].join(" ").toLowerCase();

  if (/whatsapp|baileys|whatsapp-web|wa-?md|waweb/.test(haystack)) return "WhatsApp";
  if (/telegram|gramjs|telegraf|pyrogram/.test(haystack)) return "Telegram";
  if (/discord|discordjs|discord\.js/.test(haystack)) return "Discord";
  if (/slack/.test(haystack)) return "Slack";
  return "WhatsApp"; // default
}

// System packages that imply OS-level dependencies
const SYSTEM_DEP_MAP: Record<string, string> = {
  "ffmpeg-static": "ffmpeg",
  "fluent-ffmpeg": "ffmpeg",
  "@ffmpeg/ffmpeg": "ffmpeg",
  "sharp": "libvips",
  "canvas": "cairo,pango,libpng",
  "puppeteer": "chromium",
  "playwright": "chromium",
  "imagemagick": "imagemagick",
  "gm": "imagemagick,graphicsmagick",
  "node-gyp": "build-essential,python3",
  "sqlite3": "libsqlite3-dev",
};

function detectSystemDeps(pkg: any): string {
  const allDeps = { ...pkg?.dependencies, ...pkg?.devDependencies };
  const found = new Set<string>();
  for (const [dep, sysDep] of Object.entries(SYSTEM_DEP_MAP)) {
    if (allDeps[dep]) {
      (sysDep as string).split(",").forEach((d) => found.add(d.trim()));
    }
  }
  return Array.from(found).join(", ");
}

function detectInstallPackages(pkg: any): string {
  const allDeps = { ...pkg?.dependencies, ...pkg?.devDependencies };
  return Object.keys(allDeps).filter((name) => !["typescript", "nodemon", "eslint", "prettier"].includes(name)).join(", ");
}

// Sync env vars + metadata from GitHub repo
router.post("/admin/bots/sync-vars", requireAdmin, async (req, res): Promise<void> => {
  const { repoUrl } = req.body;

  if (!repoUrl) {
    res.status(400).json({ error: "repoUrl is required" });
    return;
  }

  try {
    const match = repoUrl.match(/github\.com\/([^/]+)\/([^/]+?)(?:\.git)?(?:\/|$)/);
    if (!match) {
      res.status(400).json({ error: "Invalid GitHub URL. Expected: https://github.com/owner/repo" });
      return;
    }

    const [, owner, repo] = match;
    const branches = ["main", "master", "dev"];

    // ── 1. Fetch package.json for metadata ─────────────────────────────────
    let pkgJson: any = null;
    let activeBranch = branches[0];
    for (const branch of branches) {
      const r = await fetch(`https://raw.githubusercontent.com/${owner}/${repo}/${branch}/package.json`);
      if (r.ok) {
        try { pkgJson = JSON.parse(await r.text()); activeBranch = branch; break; } catch { /* ignore */ }
      }
    }

    // ── 2. Fetch env/config vars ────────────────────────────────────────────
    const candidates: { path: string; type: "env" | "json" | "js" }[] = [
      ...[".env.example", ".env", ".env.local", ".env.production", ".env.development", "config.env", "config/.env"].map(path => ({ path, type: "env" as const })),
      ...["config.json", "settings.json"].map(path => ({ path, type: "json" as const })),
      ...["config.js", "config.cjs", "config.mjs", "settings.js", "settings.cjs", "settings.mjs", "setting.js", "setting.cjs", "env.js", "env.cjs"].map(path => ({ path, type: "js" as const })),
    ];

    const merged = new Map<string, SyncVar>();
    const foundFiles: string[] = [];

    for (const branch of [activeBranch, ...branches.filter(b => b !== activeBranch)]) {
      for (const { path, type } of candidates) {
        const rawUrl = `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${path}`;
        const response = await fetch(rawUrl);
        if (!response.ok) continue;
        const content = await response.text();

        const vars = type === "env" ? parseEnvFile(content) : type === "json" ? parseJsonConfig(content) : parseJsConfig(content);
        if (vars.length > 0) {
          foundFiles.push(path);
          for (const variable of vars) if (!merged.has(variable.key)) merged.set(variable.key, variable);
        }
      }
      if (foundFiles.length > 0) break;
    }
    const vars = [...merged.values()];
    const foundFile = foundFiles.length ? foundFiles.join(", ") : null;

    // ── 3. Build metadata from package.json ────────────────────────────────
    const meta = {
      name: pkgJson?.name ? toTitleCase(pkgJson.name) : null,
      description: pkgJson?.description || null,
      startCommand: detectStartCommand(pkgJson),
      platform: detectPlatform(pkgJson, repo),
      systemDeps: detectSystemDeps(pkgJson),
      installPackages: detectInstallPackages(pkgJson),
      version: pkgJson?.version || null,
    };

    if (!foundFile && !pkgJson) {
      res.json({
        vars: [],
        meta: null,
        message: "No package.json or config file found (tried main/master/dev branches)",
      });
      return;
    }

    res.json({ vars, repoOwner: owner, repoName: repo, sourceFile: foundFile, sourceFiles: foundFiles, meta });
  } catch (err) {
    logger.error({ err }, "Failed to sync vars from GitHub");
    res.status(500).json({ error: "Failed to fetch repository data" });
  }
});

router.get("/admin/bots", requireAdmin, async (req, res): Promise<void> => {
  const bots = await db.select().from(botsTable).orderBy(desc(botsTable.createdAt));
  res.json(bots.map(b => serializeBot(b, true)));
});

router.post("/admin/bots", requireAdmin, async (req, res): Promise<void> => {
  const { name, repoUrl, description, platform, isFeatured, requiredVars, optionalVars, sessionGuideUrl, sessionPrefix, sqliteSettingsPaths, systemDeps, installPackages, startCommand } = req.body;

  if (!name || !repoUrl || !platform) {
    res.status(400).json({ error: "name, repoUrl, and platform are required" });
    return;
  }

  const [bot] = await db
    .insert(botsTable)
    .values({ name, repoUrl, description, platform, isFeatured: isFeatured || false, requiredVars, optionalVars, sessionGuideUrl, sessionPrefix, sqliteSettingsPaths, systemDeps, installPackages, startCommand })
    .returning();

  res.status(201).json(serializeBot(bot, true));
});

router.put("/admin/bots/:id", requireAdmin, async (req, res): Promise<void> => {
  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);
  const { name, repoUrl, description, platform, isFeatured, requiredVars, optionalVars, sessionGuideUrl, sessionPrefix, sqliteSettingsPaths, systemDeps, installPackages, startCommand } = req.body;

  const [bot] = await db
    .update(botsTable)
    .set({ name, repoUrl, description, platform, isFeatured, requiredVars, optionalVars, sessionGuideUrl, sessionPrefix, sqliteSettingsPaths, systemDeps, installPackages, startCommand })
    .where(eq(botsTable.id, id))
    .returning();

  if (!bot) {
    res.status(404).json({ error: "Bot not found" });
    return;
  }

  res.json(serializeBot(bot, true));
});

router.delete("/admin/bots/:id", requireAdmin, async (req, res): Promise<void> => {
  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);
  await db.delete(botsTable).where(eq(botsTable.id, id));
  res.json({ message: "Bot deleted" });
});

// --- VOUCHERS ---
router.get("/admin/vouchers", requireAdmin, async (req, res): Promise<void> => {
  const vouchers = await db.select().from(vouchersTable).orderBy(desc(vouchersTable.createdAt));
  res.json(
    vouchers.map((v) => ({
      id: v.id,
      code: v.code,
      coinValue: v.coinValue,
      maxUses: v.maxUses,
      usedCount: v.usedCount,
      expiresAt: v.expiresAt?.toISOString() ?? null,
      createdAt: v.createdAt.toISOString(),
    }))
  );
});

router.post("/admin/vouchers", requireAdmin, async (req, res): Promise<void> => {
  const adminUser = (req as any).user;
  const { code, coinValue, maxUses, expiresAt } = req.body;

  if (!code || !coinValue || !maxUses) {
    res.status(400).json({ error: "code, coinValue, and maxUses are required" });
    return;
  }

  const [voucher] = await db
    .insert(vouchersTable)
    .values({
      code: code.toUpperCase().trim(),
      coinValue,
      maxUses,
      expiresAt: expiresAt ? new Date(expiresAt) : null,
      createdBy: adminUser.id,
    })
    .returning();

  res.status(201).json({
    id: voucher.id,
    code: voucher.code,
    coinValue: voucher.coinValue,
    maxUses: voucher.maxUses,
    usedCount: voucher.usedCount,
    expiresAt: voucher.expiresAt?.toISOString() ?? null,
    createdAt: voucher.createdAt.toISOString(),
  });
});

// --- AUDIT LOGS (enhanced with pagination + filter) ---
router.get("/admin/audit-logs", requireAdmin, async (req, res): Promise<void> => {
  const page   = Math.max(1, parseInt(String(req.query.page  || "1"),  10));
  const limit  = Math.min(200, parseInt(String(req.query.limit || "50"), 10));
  const action = req.query.action as string | undefined;
  const offset = (page - 1) * limit;

  const where = action ? eq(auditLogsTable.action, action) : undefined;

  const [logs, [{ total }]] = await Promise.all([
    db.select().from(auditLogsTable)
      .where(where)
      .orderBy(desc(auditLogsTable.createdAt))
      .limit(limit)
      .offset(offset),
    db.select({ total: count() }).from(auditLogsTable).where(where),
  ]);

  // Enrich with admin email
  const adminIds = [...new Set(logs.map((l) => l.adminId).filter(Boolean))] as number[];
  const admins   = adminIds.length
    ? await db.select({ id: usersTable.id, email: usersTable.email }).from(usersTable).where(sql`${usersTable.id} = ANY(${adminIds})`)
    : [];
  const adminMap = Object.fromEntries(admins.map((a) => [a.id, a.email]));

  res.json({
    total,
    page,
    pages: Math.ceil(total / limit),
    logs: logs.map((l) => ({
      id:         l.id,
      adminId:    l.adminId,
      adminEmail: l.adminId ? adminMap[l.adminId] ?? "unknown" : "system",
      action:     l.action,
      details:    l.details,
      ipAddress:  l.ipAddress,
      createdAt:  l.createdAt.toISOString(),
    })),
  });
});

// --- SETTINGS ---
router.get("/admin/settings", requireAdmin, async (req, res): Promise<void> => {
  const settings = await db.select().from(platformSettingsTable);
  const result: Record<string, unknown> = {};
  for (const s of settings) {
    result[s.key] = s.value;
  }
  res.json(result);
});

router.post("/admin/settings", requireAdmin, async (req, res): Promise<void> => {
  const adminUser = (req as any).user;
  const body = req.body as Record<string, unknown>;
  if (Object.prototype.hasOwnProperty.call(body, "subscription_plan_prices") && !validateSubscriptionPlanPrices(body.subscription_plan_prices)) {
    res.status(400).json({ error: "subscription_plan_prices must contain positive integer Starter, Silver, and Gold prices up to KES 1,000,000." });
    return;
  }

  for (const [key, value] of Object.entries(body)) {
    await db
      .insert(platformSettingsTable)
      .values({ key, value, updatedBy: adminUser.id })
      .onConflictDoUpdate({
        target: platformSettingsTable.key,
        set: { value, updatedBy: adminUser.id, updatedAt: new Date() },
      });
  }

  res.json({ message: "Settings updated" });
});

// --- BROADCASTS ---
router.post("/admin/broadcasts", requireAdmin, async (req, res): Promise<void> => {
  const adminUser = (req as any).user;
  const { title, message } = req.body;

  if (!title || !message) {
    res.status(400).json({ error: "Title and message are required" });
    return;
  }

  const [broadcast] = await db
    .insert(broadcastsTable)
    .values({ adminId: adminUser.id, title, message })
    .returning();

  // Create notification for all users
  const users = await db.select({ id: usersTable.id }).from(usersTable);
  for (const user of users) {
    await db.insert(notificationsTable).values({
      userId: user.id,
      broadcastId: broadcast.id,
      title,
      message,
    });
  }

  await db.insert(auditLogsTable).values({
    adminId: adminUser.id,
    action: "send_broadcast",
    details: { title, userCount: users.length },
    ipAddress: req.ip || null,
  });

  res.json({ message: `Broadcast sent to ${users.length} users` });
});

// --- ADMIN SUPPORT TICKETS ---
router.get("/admin/support/tickets", requireAdmin, async (req, res): Promise<void> => {
  const tickets = await db
    .select()
    .from(supportTicketsTable)
    .orderBy(desc(supportTicketsTable.createdAt));

  res.json(
    tickets.map((t) => ({
      id: t.id,
      userId: t.userId,
      subject: t.subject,
      status: t.status,
      priority: t.priority,
      adminReply: t.adminReply,
      createdAt: t.createdAt.toISOString(),
      closedAt: t.closedAt?.toISOString() ?? null,
    }))
  );
});

router.post("/admin/support/tickets/:id/reply", requireAdmin, async (req, res): Promise<void> => {
  const adminUser = (req as any).user;
  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);
  const { message } = req.body;

  if (!message) {
    res.status(400).json({ error: "Message is required" });
    return;
  }

  const [ticket] = await db.select().from(supportTicketsTable).where(eq(supportTicketsTable.id, id));
  if (!ticket) {
    res.status(404).json({ error: "Ticket not found" });
    return;
  }

  const [msg] = await db
    .insert(ticketMessagesTable)
    .values({ ticketId: id, userId: adminUser.id, message, isAdmin: true })
    .returning();

  await db
    .update(supportTicketsTable)
    .set({ adminReply: message, status: "in_progress" })
    .where(eq(supportTicketsTable.id, id));

  res.status(201).json({
    id: msg.id,
    ticketId: msg.ticketId,
    userId: msg.userId,
    message: msg.message,
    isAdmin: msg.isAdmin,
    createdAt: msg.createdAt.toISOString(),
  });
});

router.post("/admin/support/tickets/:id/close", requireAdmin, async (req, res): Promise<void> => {
  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);

  const [ticket] = await db.select().from(supportTicketsTable).where(eq(supportTicketsTable.id, id));
  if (!ticket) {
    res.status(404).json({ error: "Ticket not found" });
    return;
  }

  await db
    .update(supportTicketsTable)
    .set({ status: "closed", closedAt: new Date() })
    .where(eq(supportTicketsTable.id, id));

  res.json({ message: "Ticket closed" });
});

// ═══════════════════════════════════════════════════════════════
// ADVANCED ADMIN FEATURES
// ═══════════════════════════════════════════════════════════════

// --- SERVER HEALTH (live CPU, RAM, disk, load) ---
router.get("/admin/server-health", requireAdmin, async (_req, res): Promise<void> => {
  const cpus     = os.cpus();
  const totalMem = os.totalmem();
  const freeMem  = os.freemem();
  const usedMem  = totalMem - freeMem;

  // CPU usage: compute from idle/total across all cores
  const cpuUsage = cpus.reduce((acc, cpu) => {
    const total  = Object.values(cpu.times).reduce((a, b) => a + b, 0);
    const idle   = cpu.times.idle;
    return acc + (1 - idle / total) * 100;
  }, 0) / cpus.length;

  // Process memory
  const procMem = process.memoryUsage();

  // Disk: read /proc/mounts for tmpfs/ext4 – fall back gracefully
  let diskUsedGb = 0, diskTotalGb = 0;
  try {
    const { execSync } = await import("child_process");
    const dfOut  = execSync("df -k / --output=used,size 2>/dev/null | tail -1").toString().trim();
    const [used, size] = dfOut.split(/\s+/).map(Number);
    diskUsedGb  = +(used  / 1024 / 1024).toFixed(2);
    diskTotalGb = +(size  / 1024 / 1024).toFixed(2);
  } catch { /* ignore */ }

  res.json({
    cpu: {
      cores: cpus.length,
      model: cpus[0]?.model ?? "unknown",
      usagePercent: +cpuUsage.toFixed(1),
      loadAvg: os.loadavg(),
    },
    memory: {
      totalGb:  +(totalMem / 1024 ** 3).toFixed(2),
      usedGb:   +(usedMem  / 1024 ** 3).toFixed(2),
      freeGb:   +(freeMem  / 1024 ** 3).toFixed(2),
      usedPercent: +(usedMem / totalMem * 100).toFixed(1),
      processRss:  +(procMem.rss      / 1024 ** 2).toFixed(1),
      processHeap: +(procMem.heapUsed / 1024 ** 2).toFixed(1),
    },
    disk: {
      usedGb:  diskUsedGb,
      totalGb: diskTotalGb,
      usedPercent: diskTotalGb ? +((diskUsedGb / diskTotalGb) * 100).toFixed(1) : 0,
    },
    uptime: {
      systemSeconds: os.uptime(),
      processSeconds: process.uptime(),
    },
    platform: os.platform(),
    hostname: os.hostname(),
    nodeVersion: process.version,
    bots: {
      running: runningProcesses.size,
      slotsAvailable: availableSlots(),
    },
  });
});

// --- FLEET: RESTART ALL BOTS ---
router.post("/admin/fleet/restart-all", requireAdmin, async (req, res): Promise<void> => {
  const adminUser = (req as any).user;
  const { userIdFilter } = req.body; // optional: only restart bots of a specific user

  const where = userIdFilter
    ? and(eq(deploymentsTable.status, "running"), eq(deploymentsTable.userId, userIdFilter))
    : eq(deploymentsTable.status, "running");

  const running = await db
    .select({ id: deploymentsTable.id, botId: deploymentsTable.botId, envVars: deploymentsTable.envVars })
    .from(deploymentsTable)
    .where(where);

  let restarted = 0;
  for (const dep of running) {
    try {
      await stopBotProcess(dep.id);
      const [bot] = await db.select({ repoUrl: botsTable.repoUrl }).from(botsTable).where(eq(botsTable.id, dep.botId));
      if (bot) {
        await startBotProcess(dep.id, bot.repoUrl, (dep.envVars as Record<string, string>) ?? {});
        restarted++;
      }
    } catch { /* log but continue */ }
  }

  await db.insert(auditLogsTable).values({
    adminId: adminUser.id,
    action: "fleet_restart_all",
    details: { count: restarted, userIdFilter: userIdFilter ?? null },
    ipAddress: req.ip || null,
  });

  res.json({ message: `Restarted ${restarted} bot(s)` });
});

// --- FLEET: EMERGENCY STOP ALL BOTS ---
router.post("/admin/fleet/stop-all", requireAdmin, async (req, res): Promise<void> => {
  const adminUser = (req as any).user;
  const { userIdFilter } = req.body;

  const where = userIdFilter
    ? and(eq(deploymentsTable.status, "running"), eq(deploymentsTable.userId, userIdFilter))
    : eq(deploymentsTable.status, "running");

  const running = await db
    .select({ id: deploymentsTable.id })
    .from(deploymentsTable)
    .where(where);

  for (const dep of running) {
    await stopBotProcess(dep.id).catch(() => {});
  }

  await db.insert(auditLogsTable).values({
    adminId: adminUser.id,
    action: "fleet_stop_all",
    details: { count: running.length, userIdFilter: userIdFilter ?? null },
    ipAddress: req.ip || null,
  });

  res.json({ message: `Stopped ${running.length} bot(s)` });
});

// --- IMPERSONATE USER ---
router.post("/admin/users/:id/impersonate", requireAdmin, async (req, res): Promise<void> => {
  const adminUser = (req as any).user;
  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);

  if (id === adminUser.id) {
    res.status(400).json({ error: "Cannot impersonate yourself" });
    return;
  }

  const [target] = await db.select().from(usersTable).where(eq(usersTable.id, id));
  if (!target) {
    res.status(404).json({ error: "User not found" });
    return;
  }
  if (target.isAdmin) {
    res.status(403).json({ error: "Cannot impersonate another admin" });
    return;
  }

  (req as any).session.userId = target.id;
  (req as any).session._impersonatedBy = adminUser.id;

  await db.insert(auditLogsTable).values({
    adminId: adminUser.id,
    action: "impersonate_user",
    details: { targetUserId: id, targetEmail: target.email },
    ipAddress: req.ip || null,
  });

  res.json({ message: `Now logged in as ${target.email}`, user: serializeUser(target) });
});

// --- STOP IMPERSONATION ---
router.post("/admin/stop-impersonation", requireAdmin, async (req, res): Promise<void> => {
  const session = (req as any).session;
  const originalAdminId = session._impersonatedBy;

  if (!originalAdminId) {
    res.status(400).json({ error: "Not in impersonation mode" });
    return;
  }

  session.userId = originalAdminId;
  delete session._impersonatedBy;

  res.json({ message: "Returned to admin session" });
});

// --- OVERRIDE SUBSCRIPTION PLAN ---
router.post("/admin/users/:id/plan", requireAdmin, async (req, res): Promise<void> => {
  const adminUser = (req as any).user;
  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);
  const { plan, expiresAt, reason } = req.body;

  const validPlans = ["free", "starter", "silver", "gold"];
  if (!plan || !validPlans.includes(plan)) {
    res.status(400).json({ error: `Plan must be one of: ${validPlans.join(", ")}` });
    return;
  }

  await db.update(usersTable).set({
    subscriptionPlan:      plan,
    subscriptionExpiresAt: expiresAt ? new Date(expiresAt) : null,
  }).where(eq(usersTable.id, id));

  if (plan === "free" || (expiresAt && new Date(expiresAt) <= new Date())) {
    const deps = await db.select({ id: deploymentsTable.id }).from(deploymentsTable).where(eq(deploymentsTable.userId, id));
    for (const dep of deps) await stopBotProcess(dep.id).catch(() => {});
    const webDeps = await db.select({ id: webDeploymentsTable.id }).from(webDeploymentsTable).where(eq(webDeploymentsTable.userId, id));
    for (const dep of webDeps) await stopWebDeployment(dep.id).catch(() => {});
  }

  await db.insert(auditLogsTable).values({
    adminId: adminUser.id,
    action: "override_plan",
    details: { targetUserId: id, plan, expiresAt: expiresAt ?? null, reason },
    ipAddress: req.ip || null,
  });

  res.json({ message: `Plan updated to ${plan}` });
});

// --- FORCE VERIFY USER ---
router.post("/admin/users/:id/verify", requireAdmin, async (req, res): Promise<void> => {
  const adminUser = (req as any).user;
  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);

  await db.update(usersTable).set({ isVerified: true }).where(eq(usersTable.id, id));

  await db.insert(auditLogsTable).values({
    adminId: adminUser.id,
    action: "force_verify_user",
    details: { targetUserId: id },
    ipAddress: req.ip || null,
  });

  res.json({ message: "User verified" });
});

// --- SEARCH USERS (for admin dashboard quick lookup) ---
router.get("/admin/users/search", requireAdmin, async (req, res): Promise<void> => {
  const q = String(req.query.q || "").trim();
  if (!q) {
    res.json([]);
    return;
  }

  const users = await db.select().from(usersTable)
    .where(ilike(usersTable.email, `%${q}%`))
    .limit(20);

  res.json(users.map(serializeUser));
});

// --- DEPLOYMENT METRICS (aggregate for admin) ---
router.get("/admin/bot-health", requireAdmin, async (req, res): Promise<void> => {
  const runningDeps = await db.select({
    id:     deploymentsTable.id,
    userId: deploymentsTable.userId,
    botId:  deploymentsTable.botId,
    pid:    deploymentsTable.pid,
    status: deploymentsTable.status,
  })
  .from(deploymentsTable)
  .where(eq(deploymentsTable.status, "running"));

  const metrics = runningDeps.map((dep) => {
    const proc  = runningProcesses.get(dep.id);
    let cpu = 0, memMb = 0;
    try {
      if (dep.pid) {
        const { execSync } = require("child_process");
        const out = execSync(`ps -p ${dep.pid} -o %cpu=,rss= 2>/dev/null`).toString().trim();
        const [c, m] = out.split(/\s+/).map(Number);
        cpu   = c  || 0;
        memMb = m ? Math.round(m / 1024) : 0;
      }
    } catch { /* not found */ }
    return { deploymentId: dep.id, userId: dep.userId, botId: dep.botId, pid: dep.pid, cpu, memMb };
  });

  res.json(metrics);
});

// --- RESET USER PASSWORD (admin) ---
router.post("/admin/users/:id/reset-password", requireAdmin, async (req, res): Promise<void> => {
  const adminUser = (req as any).user;
  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);
  const { newPassword } = req.body;

  if (!newPassword || newPassword.length < 6) {
    res.status(400).json({ error: "New password must be at least 6 characters" });
    return;
  }

  const bcrypt = await import("bcryptjs");
  const hash   = await bcrypt.default.hash(newPassword, 12);

  await db.update(usersTable).set({ passwordHash: hash }).where(eq(usersTable.id, id));

  await db.insert(auditLogsTable).values({
    adminId:   adminUser.id,
    action:    "reset_user_password",
    details:   { targetUserId: id },
    ipAddress: req.ip || null,
  });

  res.json({ message: "Password reset successfully" });
});

// --- FORCE CREDIT A PAYMENT TRANSACTION (for stuck/pending payments where money was charged) ---
router.post("/admin/payments/:id/force-credit", requireAdmin, async (req, res): Promise<void> => {
  const adminUser = (req as any).user;
  const txnId = parseInt(String(req.params.id), 10);

  if (!txnId) {
    res.status(400).json({ error: "Invalid transaction ID" });
    return;
  }

  const [txn] = await db.select().from(paymentTransactionsTable).where(eq(paymentTransactionsTable.id, txnId));

  if (!txn) {
    res.status(404).json({ error: "Transaction not found" });
    return;
  }

  if (txn.status === "success") {
    res.status(400).json({ error: "Transaction is already marked as success — coins already awarded" });
    return;
  }

  // Mark transaction as success
  await db
    .update(paymentTransactionsTable)
    .set({ status: "success", callbackResponse: { manual: true, creditedBy: adminUser.id } })
    .where(eq(paymentTransactionsTable.id, txnId));

  const coins = txn.coinsAwarded || 0;

  if (txn.package?.startsWith("sub:")) {
    const newPlan = txn.package.replace("sub:", "");
    await db.update(usersTable).set({ subscriptionPlan: newPlan as any }).where(eq(usersTable.id, txn.userId));
  } else {
    await addCoins(txn.userId, coins, "purchase", `Manual credit by admin (txn #${txnId}) — payment confirmed offline`);
  }

  await db.insert(auditLogsTable).values({
    adminId:   adminUser.id,
    action:    "force_credit_payment",
    details:   { txnId, userId: txn.userId, coins, package: txn.package, amountKes: txn.amountKes },
    ipAddress: req.ip || null,
  });

  res.json({ message: `Credited ${coins} coins to user #${txn.userId} for transaction #${txnId}`, coins, userId: txn.userId });
});

// --- LIST ALL PAYMENT TRANSACTIONS (admin) ---
router.get("/admin/payments", requireAdmin, async (_req, res): Promise<void> => {
  const txns = await db
    .select()
    .from(paymentTransactionsTable)
    .orderBy(desc(paymentTransactionsTable.createdAt))
    .limit(100);

  res.json(txns.map(t => ({
    id:            t.id,
    userId:        t.userId,
    phone:         t.phone,
    amountKes:     t.amountKes,
    coinsAwarded:  t.coinsAwarded,
    package:       t.package,
    status:        t.status,
    payheroTxnId:  t.payheroTxnId,
    createdAt:     t.createdAt,
  })));
});

// --- ABORT USER ABUSE FLAG ---
router.post("/admin/users/:id/abuse-flag", requireAdmin, async (req, res): Promise<void> => {
  const adminUser = (req as any).user;
  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);
  const { flag, note } = req.body;

  await db.update(usersTable).set({ abuseFlag: flag, abuseNote: note ?? null }).where(eq(usersTable.id, id));

  await db.insert(auditLogsTable).values({
    adminId:   adminUser.id,
    action:    flag ? "flag_abuse" : "clear_abuse_flag",
    details:   { targetUserId: id, note },
    ipAddress: req.ip || null,
  });

  res.json({ message: flag ? "User flagged for abuse" : "Abuse flag cleared" });
});

// ── PLATFORM WHATSAPP SENDER ──────────────────────────────────────────────────

router.get("/admin/platform-wa/status", requireAdmin, (_req, res): void => {
  res.json({ status: getWASenderStatus() });
});

router.post("/admin/platform-wa/disconnect", requireAdmin, async (_req, res): Promise<void> => {
  waDisconnect();
  await db
    .delete(platformSettingsTable)
    .where(eq(platformSettingsTable.key, "platform_wa_session"));
  res.json({ message: "Disconnected" });
});

router.post("/admin/platform-wa/restart", requireAdmin, async (_req, res): Promise<void> => {
  waDisconnect();
  await new Promise((r) => setTimeout(r, 1000));
  const [row] = await db
    .select()
    .from(platformSettingsTable)
    .where(eq(platformSettingsTable.key, "platform_wa_session"));
  if (!row?.value || typeof row.value !== "string") {
    res.status(400).json({ error: "No saved session found. Please pair the device first." });
    return;
  }
  try {
    await initFromSession(row.value);
    res.json({ message: "Restarting — will reconnect with saved session." });
  } catch (err: any) {
    logger.error({ err }, "Platform WA restart failed");
    res.status(500).json({ error: err?.message ?? "Restart failed." });
  }
});

function sseSetup(res: any) {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();
}

function sseWrite(res: any, event: string, data: Record<string, unknown>) {
  res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

router.get("/admin/platform-wa/pair", requireAdmin, async (req, res): Promise<void> => {
  const number = String(req.query["number"] ?? "").replace(/\D/g, "");
  if (!number || number.length < 7) {
    res.status(400).json({ error: "Valid phone number required (?number=254...)" });
    return;
  }

  sseSetup(res);

  let done = false;
  let cleanup: (() => void) | null = null;

  const ping = setInterval(() => { if (!done) res.write(": ping\n\n"); }, 20000);

  req.on("close", () => {
    done = true;
    clearInterval(ping);
    cleanup?.();
  });

  try {
    cleanup = await connectViaPair(
      number,
      (code) => { if (!done) sseWrite(res, "code", { code }); },
      async (sessionId) => {
        if (done) return;
        done = true;
        clearInterval(ping);
        try {
          await db
            .insert(platformSettingsTable)
            .values({ key: "platform_wa_session", value: sessionId })
            .onConflictDoUpdate({
              target: platformSettingsTable.key,
              set: { value: sessionId, updatedAt: new Date() },
            });
        } catch (err) {
          logger.error({ err }, "Failed to save platform WA session");
        }
        sseWrite(res, "connected", { message: "Connected successfully" });
        res.end();
      },
      (msg) => {
        if (!done) {
          done = true;
          clearInterval(ping);
          sseWrite(res, "error", { message: msg });
          res.end();
        }
      },
    );
  } catch (err: any) {
    logger.error({ err }, "Platform WA pair endpoint error");
    sseWrite(res, "error", { message: err?.message ?? "Unexpected error" });
    res.end();
  }
});

export default router;
