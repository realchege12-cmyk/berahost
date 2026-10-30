import { Router } from "express";
import { db, deploymentsTable, botsTable, botLogsTable, usersTable } from "@workspace/db";
import { eq, and, desc, count, sql } from "drizzle-orm";

import { requireAuth, requireAny } from "../middlewares/requireAuth";
import { startBotProcess, stopBotProcess, getPairingCode, clearPairingCode } from "../lib/botProcess";
import { hashSessionId } from "../lib/auth";
import { serializeBot } from "./bots";
import { getPlan, isSubscriptionActive } from "../lib/subscriptions";

const router = Router();

const ADMIN_PLAN = { id: "admin", name: "Administrator", maxDeployments: 9999, maxBots: 9999, maxWebApps: 9999, customDomains: true, githubDeployment: true, priceKes: 0, features: ["Administrator access"] } as const;
const KNOWN_PLANS = new Set(["free", "starter", "silver", "gold"]);
function deploymentPlan(user: { isAdmin?: boolean; subscriptionPlan?: string | null }) {
  return user.isAdmin ? ADMIN_PLAN : getPlan(user.subscriptionPlan);
}
function canUseBots(user: any) {
  if (!user || user.isBanned || user.deletedAt) return false;
  if (user.isAdmin) return true;
  if (!KNOWN_PLANS.has(user.subscriptionPlan)) return false;
  return user.subscriptionPlan === "free" || isSubscriptionActive(user);
}

function serializeDeployment(dep: any, bot: any) {
  return {
    id: dep.id,
    userId: dep.userId,
    botId: dep.botId,
    containerId: dep.containerId,
    pid: dep.pid,
    envVars: dep.envVars,
    sessionIdLocked: dep.sessionIdLocked,
    status: dep.status,
    platform: dep.platform,
    customName: dep.customName ?? null,
    lastActive: dep.lastActive?.toISOString() ?? null,
    storageUsedMb: dep.storageUsedMb,
    storageLimitMb: dep.storageLimitMb,
    createdAt: dep.createdAt.toISOString(),
    updatedAt: dep.updatedAt?.toISOString() ?? null,
    bot: bot ? serializeBot(bot) : null,
  };
}

router.get("/deployments", requireAny("read"), async (req, res): Promise<void> => {
  const user = (req as any).user;
  const deps = await db
    .select()
    .from(deploymentsTable)
    .where(eq(deploymentsTable.userId, user.id))
    .orderBy(desc(deploymentsTable.createdAt));

  const result = await Promise.all(
    deps.map(async (dep) => {
      const [bot] = await db.select().from(botsTable).where(eq(botsTable.id, dep.botId));
      return serializeDeployment(dep, bot);
    })
  );

  res.json(result);
});

router.post("/deployments", requireAny("write"), async (req, res): Promise<void> => {
  const user = (req as any).user;
  const { botId, envVars, customName } = req.body;

  if (!botId || !envVars) {
    res.status(400).json({ error: "botId and envVars are required" });
    return;
  }
  const deploymentName = typeof customName === "string" ? customName.trim() : "";
  if (deploymentName.length > 100) {
    res.status(400).json({ error: "Deployment name must be 100 characters or fewer" });
    return;
  }

  const [bot] = await db.select().from(botsTable).where(eq(botsTable.id, botId));
  if (!bot) {
    res.status(404).json({ error: "Bot not found" });
    return;
  }

  const [dbUser] = await db.select().from(usersTable).where(eq(usersTable.id, user.id));
  if (!canUseBots(dbUser)) {
    res.status(402).json({ error: "An active monthly subscription is required before deploying a bot." });
    return;
  }
  const plan = deploymentPlan(dbUser);
  const existingDeployments = await db.select({ id: deploymentsTable.id }).from(deploymentsTable).where(eq(deploymentsTable.userId, user.id));
  if (existingDeployments.length >= plan.maxBots) {
    res.status(403).json({ error: `${plan.name} supports up to ${plan.maxBots} bots.`, limit: plan.maxDeployments });
    return;
  }

  // Validate SESSION_ID against the bot's declared prefix (if any)
  const sessionId = envVars.SESSION_ID;
  const requiredPrefix = bot.sessionPrefix as string | null | undefined;
  if (sessionId && requiredPrefix && !sessionId.startsWith(requiredPrefix)) {
    res.status(400).json({ error: `SESSION_ID must start with '${requiredPrefix}' for ${bot.name}` });
    return;
  }

  // Hash the session ID
  const sessionIdHash = sessionId ? hashSessionId(sessionId) : null;

  // Create deployment record
  const [deployment] = await db
    .insert(deploymentsTable)
    .values({
      userId: user.id,
      botId: bot.id,
      envVars,
      sessionIdLocked: true,
      sessionIdHash,
      status: "stopped",
      platform: bot.platform,
      customName: deploymentName || null,
    })
    .returning();

  // Start the bot process async (don't await)
  startBotProcess(deployment.id, bot.repoUrl, envVars as Record<string, string>).catch((err) => {
    req.log.error({ err, deploymentId: deployment.id }, "Bot process start failed");
  });

  res.status(201).json(serializeDeployment(deployment, bot));
});

router.get("/deployments/:id", requireAny("read"), async (req, res): Promise<void> => {
  const user = (req as any).user;
  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);

  const [dep] = await db.select().from(deploymentsTable).where(and(eq(deploymentsTable.id, id), eq(deploymentsTable.userId, user.id)));
  if (!dep) {
    res.status(404).json({ error: "Deployment not found" });
    return;
  }

  const [bot] = await db.select().from(botsTable).where(eq(botsTable.id, dep.botId));
  res.json(serializeDeployment(dep, bot));
});

router.delete("/deployments/:id", requireAny("write"), async (req, res): Promise<void> => {
  const user = (req as any).user;
  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);

  const [dep] = await db.select().from(deploymentsTable).where(and(eq(deploymentsTable.id, id), eq(deploymentsTable.userId, user.id)));
  if (!dep) {
    res.status(404).json({ error: "Deployment not found" });
    return;
  }

  await stopBotProcess(id);
  await db.delete(deploymentsTable).where(eq(deploymentsTable.id, id));
  res.json({ message: "Deployment deleted" });
});

router.post("/deployments/:id/start", requireAny("write"), async (req, res): Promise<void> => {
  const user = (req as any).user;
  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);

  const [dep] = await db.select().from(deploymentsTable).where(and(eq(deploymentsTable.id, id), eq(deploymentsTable.userId, user.id)));
  if (!dep) {
    res.status(404).json({ error: "Deployment not found" });
    return;
  }

  if (dep.status === "running") {
    res.status(400).json({ error: "Bot is already running" });
    return;
  }

  const [dbUser] = await db.select().from(usersTable).where(eq(usersTable.id, user.id));
  if (!canUseBots(dbUser)) {
    res.status(402).json({ error: "Your subscription is inactive. Renew before starting this bot." });
    return;
  }
  const plan = deploymentPlan(dbUser);
  const limit = plan.maxBots;

  const [{ runningCount }] = await db
    .select({ runningCount: count() })
    .from(deploymentsTable)
    .where(and(eq(deploymentsTable.userId, user.id), eq(deploymentsTable.status, "running")));

  if (runningCount >= limit) {
    res.status(403).json({
      error: `Your ${plan.name} plan allows ${limit} hosted deployments. Upgrade your plan to run more.`,
      limit,
      currentPlan: plan.id,
    });
    return;
  }

  const [bot] = await db.select().from(botsTable).where(eq(botsTable.id, dep.botId));
  const envVars = (dep.envVars as Record<string, string>) || {};

  startBotProcess(dep.id, bot.repoUrl, envVars).catch((err) => {
    req.log.error({ err, deploymentId: dep.id }, "Bot start failed");
  });

  const [updated] = await db
    .update(deploymentsTable)
    .set({ status: "deploying", updatedAt: new Date() })
    .where(eq(deploymentsTable.id, id))
    .returning();

  res.json(serializeDeployment(updated, bot));
});

router.post("/deployments/:id/stop", requireAny("write"), async (req, res): Promise<void> => {
  const user = (req as any).user;
  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);

  const [dep] = await db.select().from(deploymentsTable).where(and(eq(deploymentsTable.id, id), eq(deploymentsTable.userId, user.id)));
  if (!dep) {
    res.status(404).json({ error: "Deployment not found" });
    return;
  }

  await stopBotProcess(id);

  const [bot] = await db.select().from(botsTable).where(eq(botsTable.id, dep.botId));
  const [updated] = await db.select().from(deploymentsTable).where(eq(deploymentsTable.id, id));
  res.json(serializeDeployment(updated, bot));
});

router.put("/deployments/:id/env", requireAny("write"), async (req, res): Promise<void> => {
  const user = (req as any).user;
  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);
  const { envVars } = req.body;

  const [dep] = await db.select().from(deploymentsTable).where(and(eq(deploymentsTable.id, id), eq(deploymentsTable.userId, user.id)));
  if (!dep) {
    res.status(404).json({ error: "Deployment not found" });
    return;
  }

  // CRITICAL: Block SESSION_ID changes
  if (envVars.SESSION_ID && dep.sessionIdLocked) {
    res.status(403).json({
      error: "SESSION_ID cannot be changed after deployment. Delete and redeploy with a new session ID.",
    });
    return;
  }

  const currentEnv = (dep.envVars as Record<string, string>) || {};
  const allowedUpdates = Object.fromEntries(
    Object.entries(envVars as Record<string, string>).filter(([k]) => k !== "SESSION_ID")
  );

  // Fetch the bot's optional var keys so we can strip empties.
  // If an optional var is sent as "" it means "use bot default" — we remove it
  // from the saved env rather than writing an empty string to .env, which would
  // suppress the bot's own fallback default.
  const [botRow] = await db.select().from(botsTable).where(eq(botsTable.id, dep.botId));
  const optionalKeys = new Set(
    botRow?.optionalVars ? Object.keys(botRow.optionalVars as Record<string, string>) : []
  );
  const cleanedUpdates = Object.fromEntries(
    Object.entries(allowedUpdates).filter(([k, v]) => !optionalKeys.has(k) || v.trim() !== "")
  );

  // Also remove optional keys that were explicitly cleared (present in current
  // env as empty, and not re-sent — handled by deleting from merged result).
  const updatedEnvVars = { ...currentEnv, ...cleanedUpdates };
  // Drop any optional vars that are now empty strings in the merged result.
  for (const k of optionalKeys) {
    if (updatedEnvVars[k] === "") delete updatedEnvVars[k];
  }

  const [updated] = await db
    .update(deploymentsTable)
    .set({ envVars: updatedEnvVars, updatedAt: new Date() })
    .where(eq(deploymentsTable.id, id))
    .returning();

  const [bot] = await db.select().from(botsTable).where(eq(botsTable.id, dep.botId));
  res.json(serializeDeployment(updated, bot));
});

router.get("/deployments/:id/logs", requireAny("read"), async (req, res): Promise<void> => {
  const user = (req as any).user;
  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);
  const limit = parseInt(String(req.query.limit || "100"), 10);

  const [dep] = await db.select().from(deploymentsTable).where(and(eq(deploymentsTable.id, id), eq(deploymentsTable.userId, user.id)));
  if (!dep) {
    res.status(404).json({ error: "Deployment not found" });
    return;
  }

  const logs = await db
    .select()
    .from(botLogsTable)
    .where(eq(botLogsTable.deploymentId, id))
    .orderBy(desc(botLogsTable.createdAt))
    .limit(limit);

  res.json(
    logs.reverse().map((l) => ({
      id: l.id,
      deploymentId: l.deploymentId,
      logLine: l.logLine,
      logType: l.logType,
      createdAt: l.createdAt.toISOString(),
    }))
  );
});

// ═══════════════════════════════════════════════════════════════
// ADVANCED USER DEPLOYMENT FEATURES
// ═══════════════════════════════════════════════════════════════

// --- CLONE DEPLOYMENT ---
router.post("/deployments/:id/clone", requireAny("write"), async (req, res): Promise<void> => {
  const user = (req as any).user;
  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);

  const [dep] = await db.select().from(deploymentsTable).where(and(eq(deploymentsTable.id, id), eq(deploymentsTable.userId, user.id)));
  if (!dep) {
    res.status(404).json({ error: "Deployment not found" });
    return;
  }

  const [bot] = await db.select().from(botsTable).where(eq(botsTable.id, dep.botId));
  if (!bot) {
    res.status(404).json({ error: "Bot not found" });
    return;
  }

  const [dbUser] = await db.select().from(usersTable).where(eq(usersTable.id, user.id));
  if (!canUseBots(dbUser)) {
    res.status(402).json({ error: "An active monthly subscription is required before cloning a bot." });
    return;
  }
  const plan = deploymentPlan(dbUser);
  const hostedCount = await db.select({ id: deploymentsTable.id }).from(deploymentsTable).where(eq(deploymentsTable.userId, user.id));
  if (hostedCount.length >= plan.maxBots) {
    res.status(403).json({ error: `${plan.name} supports up to ${plan.maxBots} bots.` });
    return;
  }

  // Block SESSION_ID cloning — user must provide a new one
  const clonedEnv = Object.fromEntries(
    Object.entries((dep.envVars as Record<string, string>) || {}).filter(([k]) => k !== "SESSION_ID")
  );
  const newName = `${dep.customName ?? bot.name} (Copy)`;

  const [clone] = await db.insert(deploymentsTable).values({
    userId:         user.id,
    botId:          bot.id,
    envVars:        clonedEnv,
    sessionIdLocked: false,
    sessionIdHash:  null,
    status:         "stopped",
    platform:       bot.platform,
    customName:     newName,
  }).returning();

  res.status(201).json(serializeDeployment(clone, bot));
});

// --- METRICS (CPU/RAM of bot process) ---
router.get("/deployments/:id/metrics", requireAny("read"), async (req, res): Promise<void> => {
  const user = (req as any).user;
  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);

  const [dep] = await db.select().from(deploymentsTable).where(and(eq(deploymentsTable.id, id), eq(deploymentsTable.userId, user.id)));
  if (!dep) {
    res.status(404).json({ error: "Deployment not found" });
    return;
  }

  let cpu = 0, memMb = 0, threads = 0;
  if (dep.pid && dep.status === "running") {
    try {
      const { execSync } = await import("child_process");
      const out = execSync(`ps -p ${dep.pid} -o %cpu=,rss=,nlwp= 2>/dev/null`).toString().trim();
      if (out) {
        const [c, m, t] = out.split(/\s+/).map(Number);
        cpu     = +(c || 0).toFixed(1);
        memMb   = Math.round((m || 0) / 1024);
        threads = t || 0;
      }
    } catch { /* process not found */ }
  }

  // Log count in last hour
  const oneHourAgo = new Date(Date.now() - 3600_000);
  const [{ logCount }] = await db
    .select({ logCount: count() })
    .from(botLogsTable)
    .where(and(eq(botLogsTable.deploymentId, id), sql`${botLogsTable.createdAt} >= ${oneHourAgo}`));

  res.json({
    deploymentId: id,
    pid:          dep.pid,
    status:       dep.status,
    cpu,
    memMb,
    threads,
    logsLastHour: logCount,
    uptime:       dep.status === "running" ? Math.floor((Date.now() - new Date(dep.updatedAt ?? dep.createdAt).getTime()) / 1000) : 0,
  });
});

// --- EXPORT LOGS ---
router.get("/deployments/:id/logs/export", requireAny("read"), async (req, res): Promise<void> => {
  const user = (req as any).user;
  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);
  const format = String(req.query.format || "txt");

  const [dep] = await db.select().from(deploymentsTable).where(and(eq(deploymentsTable.id, id), eq(deploymentsTable.userId, user.id)));
  if (!dep) {
    res.status(404).json({ error: "Deployment not found" });
    return;
  }

  const logs = await db
    .select()
    .from(botLogsTable)
    .where(eq(botLogsTable.deploymentId, id))
    .orderBy(botLogsTable.createdAt)
    .limit(10000);

  const filename = `deployment-${id}-logs.${format === "json" ? "json" : "txt"}`;
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);

  if (format === "json") {
    res.setHeader("Content-Type", "application/json");
    res.json(logs.map((l) => ({
      time: l.createdAt.toISOString(),
      type: l.logType,
      line: l.logLine,
    })));
  } else {
    res.setHeader("Content-Type", "text/plain");
    const text = logs
      .map((l) => `[${l.createdAt.toISOString()}] [${l.logType.toUpperCase().padEnd(6)}] ${l.logLine}`)
      .join("\n");
    res.send(text);
  }
});

// --- CONFIGURE WEBHOOK ---
router.put("/deployments/:id/webhook", requireAny("write"), async (req, res): Promise<void> => {
  const user = (req as any).user;
  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);
  const { webhookUrl, events } = req.body;

  const [dep] = await db.select().from(deploymentsTable).where(and(eq(deploymentsTable.id, id), eq(deploymentsTable.userId, user.id)));
  if (!dep) {
    res.status(404).json({ error: "Deployment not found" });
    return;
  }

  if (webhookUrl && !/^https?:\/\/.+/.test(webhookUrl)) {
    res.status(400).json({ error: "Webhook URL must be a valid http/https URL" });
    return;
  }

  const currentEnv = (dep.envVars as Record<string, string>) || {};
  const updatedEnv = {
    ...currentEnv,
    WEBHOOK_URL:    webhookUrl    || "",
    WEBHOOK_EVENTS: Array.isArray(events) ? events.join(",") : (events || "crash,restart"),
  };

  const [updated] = await db
    .update(deploymentsTable)
    .set({ envVars: updatedEnv, updatedAt: new Date() })
    .where(eq(deploymentsTable.id, id))
    .returning();

  const [bot] = await db.select().from(botsTable).where(eq(botsTable.id, dep.botId));
  res.json(serializeDeployment(updated, bot));
});

// --- CLONE DEPLOYMENT ---
router.post("/deployments/:id/clone", requireAny("write"), async (req, res): Promise<void> => {
  const user = (req as any).user;
  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);

  const [dep] = await db.select().from(deploymentsTable).where(and(eq(deploymentsTable.id, id), eq(deploymentsTable.userId, user.id)));
  if (!dep) {
    res.status(404).json({ error: "Deployment not found" });
    return;
  }

  const [bot] = await db.select().from(botsTable).where(eq(botsTable.id, dep.botId));
  if (!bot) {
    res.status(404).json({ error: "Bot not found" });
    return;
  }

  const [dbUser] = await db.select().from(usersTable).where(eq(usersTable.id, user.id));
  if (!canUseBots(dbUser)) {
    res.status(402).json({ error: "An active monthly subscription is required before cloning a bot." });
    return;
  }
  const plan = deploymentPlan(dbUser);
  const hostedCount = await db.select({ id: deploymentsTable.id }).from(deploymentsTable).where(eq(deploymentsTable.userId, user.id));
  if (hostedCount.length >= plan.maxBots) {
    res.status(403).json({ error: `${plan.name} supports up to ${plan.maxBots} bots.` });
    return;
  }

  const existingEnv = (dep.envVars as Record<string, string>) || {};
  const clonedEnv = { ...existingEnv };
  delete clonedEnv["SESSION_ID"];

  const [clone] = await db
    .insert(deploymentsTable)
    .values({
      userId: user.id,
      botId: dep.botId,
      envVars: clonedEnv,
      status: "stopped",
      platform: dep.platform,
      customName: dep.customName ? `${dep.customName} (Clone)` : `${bot.name} (Clone)`,
      sessionIdLocked: false,
    })
    .returning();

  res.status(201).json({
    ...serializeDeployment(clone, bot),
    message: `Deployment cloned successfully. Add your SESSION_ID to start it.`,
  });
});

// --- TEST WEBHOOK ---
router.post("/deployments/:id/webhook/test", requireAny("write"), async (req, res): Promise<void> => {
  const user = (req as any).user;
  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);

  const [dep] = await db.select().from(deploymentsTable).where(and(eq(deploymentsTable.id, id), eq(deploymentsTable.userId, user.id)));
  if (!dep) {
    res.status(404).json({ error: "Deployment not found" });
    return;
  }

  const env = (dep.envVars as Record<string, string>) || {};
  const webhookUrl = env["WEBHOOK_URL"];

  if (!webhookUrl) {
    res.status(400).json({ error: "No webhook URL configured. Set one first." });
    return;
  }

  try {
    const resp = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        event:        "test",
        deploymentId: id,
        message:      "This is a test webhook from BERAHOST",
        timestamp:    new Date().toISOString(),
      }),
    });
    res.json({ success: resp.ok, statusCode: resp.status });
  } catch (err: any) {
    res.status(502).json({ error: `Webhook delivery failed: ${err.message}` });
  }
});

/** SSE: stream live logs for a deployment */
router.get("/deployments/:id/logs/stream", requireAny("read"), async (req, res): Promise<void> => {
  const user = (req as any).user;
  const depId = parseInt(String(req.params.id), 10);

  const [dep] = await db.select().from(deploymentsTable).where(eq(deploymentsTable.id, depId));
  if (!dep || dep.userId !== user.id) { res.status(404).json({ error: "Not found" }); return; }

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();

  const send = (data: object) => res.write(`data: ${JSON.stringify(data)}\n\n`);

  // Send last 50 logs immediately
  const recent = await db
    .select()
    .from(botLogsTable)
    .where(eq(botLogsTable.deploymentId, depId))
    .orderBy(desc(botLogsTable.createdAt))
    .limit(50);
  recent.reverse().forEach((log) => send({ id: log.id, level: log.logType, message: log.logLine, ts: log.createdAt }));

  let lastId = recent[recent.length - 1]?.id ?? 0;

  const interval = setInterval(async () => {
    try {
      const newLogs = await db
        .select()
        .from(botLogsTable)
        .where(and(eq(botLogsTable.deploymentId, depId), sql`${botLogsTable.id} > ${lastId}`))
        .orderBy(botLogsTable.id)
        .limit(20);
      for (const log of newLogs) {
        send({ id: log.id, level: log.logType, message: log.logLine, ts: log.createdAt });
        lastId = log.id;
      }
    } catch { /* ignore */ }
  }, 2000);

  req.on("close", () => { clearInterval(interval); res.end(); });
});

// ═══════════════════════════════════════════════════════════════
// PAIRING CODE — PHONE-NUMBER BASED WHATSAPP LINKING
// ═══════════════════════════════════════════════════════════════

// POST /deployments/:id/phone
// Saves the user's WhatsApp phone number as PHONE_NUMBER env var.
// If the bot is currently running, restarts it so it picks up the new number.
router.post("/deployments/:id/phone", requireAny("write"), async (req, res): Promise<void> => {
  const user = (req as any).user;
  const id   = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);
  const { phone } = req.body as { phone?: string };

  if (!phone || !/^[0-9]{7,15}$/.test(phone.replace(/[^0-9]/g, ""))) {
    res.status(400).json({ error: "Invalid phone number. Include country code, digits only (e.g. 254712345678)." });
    return;
  }

  const cleanPhone = phone.replace(/[^0-9]/g, "");

  const [dep] = await db.select().from(deploymentsTable)
    .where(and(eq(deploymentsTable.id, id), eq(deploymentsTable.userId, user.id)));
  if (!dep) { res.status(404).json({ error: "Deployment not found" }); return; }

  const currentEnv = (dep.envVars as Record<string, string>) || {};
  const newEnv = { ...currentEnv, PHONE_NUMBER: cleanPhone };

  await db.update(deploymentsTable)
    .set({ envVars: newEnv, updatedAt: new Date() })
    .where(eq(deploymentsTable.id, id));

  // Clear any stale pairing code for this deployment
  clearPairingCode(id);

  // If bot is running, restart it to pick up the new phone number
  const wasRunning = dep.status === "running" || dep.status === "deploying";
  if (wasRunning) {
    await stopBotProcess(id);
    const [bot] = await db.select().from(botsTable).where(eq(botsTable.id, dep.botId));
    if (bot) {
      // Give it a moment to stop cleanly
      setTimeout(() => {
        startBotProcess(id, bot.repoUrl, newEnv).catch((err) => {
          console.error("[phone-restart]", err);
        });
      }, 2000);
    }
  }

  res.json({ ok: true, phone: cleanPhone, restarted: wasRunning });
});

// GET /deployments/:id/paircode
// Returns the latest pairing code detected in this deployment's stdout (if any).
router.get("/deployments/:id/paircode", requireAny("read"), async (req, res): Promise<void> => {
  const user = (req as any).user;
  const id   = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);

  const [dep] = await db.select().from(deploymentsTable)
    .where(and(eq(deploymentsTable.id, id), eq(deploymentsTable.userId, user.id)));
  if (!dep) { res.status(404).json({ error: "Deployment not found" }); return; }

  const entry = getPairingCode(id);
  if (!entry) {
    res.json({ code: null });
    return;
  }

  res.json({
    code:       entry.code,
    phone:      entry.phone,
    detectedAt: entry.detectedAt.toISOString(),
  });
});

export default router;
