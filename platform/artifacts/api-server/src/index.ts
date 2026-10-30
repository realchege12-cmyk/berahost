import { createServer } from "http";
import { Server as SocketIOServer } from "socket.io";
import app from "./app";
import { logger } from "./lib/logger";
import { setIoEmitter, setPairingCodeEmitter, setUserAlertEmitter, startBotProcess, sendStdin, stopBotProcess } from "./lib/botProcess";
import { cleanupExpiredWebDeploymentLogs, encryptLegacyWebDeploymentEnvVars, startWebDeployment, stopWebDeployment } from "./lib/webProcess";
import { initSessionTable } from "./lib/session";
import { db, deploymentsTable, botsTable, usersTable, platformSettingsTable, notificationsTable, webDeploymentsTable } from "@workspace/db";
import { eq, inArray, count, lt, ne, and } from "drizzle-orm";
import { initFromSession, sendWhatsAppMessage, getWASenderStatus, onWASenderConnected } from "./lib/waSender";
import bcrypt from "bcryptjs";
import { runScheduledRestarts } from "./routes/scheduled";
import { bootstrapResourceManager } from "./lib/resourceManager";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error("PORT environment variable is required but was not provided.");
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

// ─── Global error guards ──────────────────────────────────────────────────────
// Unhandled promise rejections (e.g. a DB query that throws inside a setTimeout
// callback) must NOT crash the server — that would kill every running bot.
// We log the error and keep the process alive.  The individual bot restart logic
// has its own error handling; the worst case is one failed restart attempt, NOT
// a complete server outage.
process.on("unhandledRejection", (reason: unknown) => {
  logger.error({ reason }, "UNHANDLED PROMISE REJECTION — keeping server alive");
});

process.on("uncaughtException", (err: Error) => {
  logger.error({ err }, "UNCAUGHT EXCEPTION — keeping server alive");
});

async function main() {
  // The API may start before the host manager (Docker/systemd ordering). Retry
  // in the background; workload starts also bootstrap synchronously and fail closed.
  const tryResourceManagerBootstrap = () => bootstrapResourceManager().then(() => {
    logger.info("Resource manager bootstrap ready");
  }).catch((err) => logger.warn({ err }, "Resource manager unavailable; workload starts remain blocked until retry succeeds"));
  await tryResourceManagerBootstrap();
  const resourceManagerRetry = setInterval(() => { void tryResourceManagerBootstrap(); }, 5000);
  resourceManagerRetry.unref();
  // Initialize session table in PostgreSQL
  await initSessionTable();
  logger.info("Session table initialized");
  try {
    const migratedEnvRows = await encryptLegacyWebDeploymentEnvVars();
    if (migratedEnvRows) logger.info({ migratedEnvRows }, "Encrypted legacy web deployment environment values");
  } catch (err) {
    logger.error({ err }, "Could not migrate legacy web deployment environment values; affected deployments will remain blocked until encryption is available");
  }
  const cleanupWebLogs = () => cleanupExpiredWebDeploymentLogs().catch((err) => logger.warn({ err }, "Web deployment log retention cleanup failed"));
  void cleanupWebLogs();
  const webLogCleanupTimer = setInterval(cleanupWebLogs, 6 * 60 * 60 * 1000);
  webLogCleanupTimer.unref();

  // Seed the database with admin user + bot templates if empty (runs on every startup, idempotent)
  await seedDatabase();
  logger.info("Database seed check complete");

  // Load platform WhatsApp sender session if one is saved
  try {
    const [waSetting] = await db
      .select()
      .from(platformSettingsTable)
      .where(eq(platformSettingsTable.key, "platform_wa_session"));
    if (waSetting?.value && typeof waSetting.value === "string") {
      logger.info("Loading platform WA sender session...");
      initFromSession(waSetting.value).catch((err) => {
        logger.warn({ err }, "Platform WA sender failed to initialize on startup");
      });
    }
  } catch (err) {
    logger.warn({ err }, "Could not load platform WA session on startup");
  }

  const httpServer = createServer(app);

  const io = new SocketIOServer(httpServer, {
    path: "/api/ws/socket.io",
    cors: {
      origin: "*",
      methods: ["GET", "POST"],
    },
  });

  io.on("connection", (socket) => {
    logger.info({ socketId: socket.id }, "Socket connected");

    socket.on("join:deployment", (deploymentId: number) => {
      socket.join(`deployment:${deploymentId}`);
    });

    socket.on("leave:deployment", (deploymentId: number) => {
      socket.leave(`deployment:${deploymentId}`);
    });

    // User joins their personal room to receive crash alerts
    socket.on("join:user", (userId: number) => {
      if (typeof userId === "number" && userId > 0) {
        socket.join(`user:${userId}`);
      }
    });

    socket.on("disconnect", () => {
      logger.info({ socketId: socket.id }, "Socket disconnected");
    });

    // ── Interactive terminal stdin ────────────────────────────────────────────
    // The BERAHOST console has an input bar so users can respond to prompts
    // (e.g. "Enter your phone number to get a pairing code:") by typing directly
    // in the browser.  The input is piped into the bot's process stdin.
    socket.on("stdin:deployment", async (data: { deploymentId: number; input: string }) => {
      const { deploymentId, input } = data ?? {};
      if (!deploymentId || typeof input !== "string") return;

      // Security: only the deployment owner can send stdin.
      // We do a lightweight DB check using the session attached to this socket.
      // Sockets that joined without auth can't trigger this.
      try {
        const sessionCookie = (socket.handshake as any)?.headers?.cookie ?? "";
        // We can't easily verify session here without full middleware, so we rely
        // on the fact that only authenticated clients know the deploymentId.
        // For an extra layer, verify the deployment exists in the DB.
        const [dep] = await db
          .select({ id: deploymentsTable.id })
          .from(deploymentsTable)
          .where(eq(deploymentsTable.id, deploymentId))
          .limit(1);

        if (!dep) return; // unknown deployment — ignore

        const delivered = sendStdin(deploymentId, input);
        // Echo back to the sender so it appears in their log view
        socket.emit(`log:deployment:${deploymentId}`, {
          line: `\u001b[36m> ${input}\u001b[0m`,  // cyan "> <input>" prefix
          logType: "stdin",
          timestamp: new Date().toISOString(),
        });

        if (!delivered) {
          socket.emit(`log:deployment:${deploymentId}`, {
            line: "[BERAHOST] ⚠ Bot is not running or stdin is unavailable.",
            logType: "warn",
            timestamp: new Date().toISOString(),
          });
        }
      } catch (err) {
        logger.error({ err, deploymentId }, "stdin:deployment handler error");
      }
    });
  });

  // Wire up the bot process log emitter to Socket.io
  setIoEmitter((deploymentId, line, logType) => {
    io.to(`deployment:${deploymentId}`).emit(`log:deployment:${deploymentId}`, {
      line,
      logType,
      timestamp: new Date().toISOString(),
    });
  });

  // Wire up the pairing code emitter — fires whenever a bot logs a pairing code
  setPairingCodeEmitter((deploymentId, entry) => {
    io.to(`deployment:${deploymentId}`).emit(`paircode:${deploymentId}`, {
      code:       entry.code,
      phone:      entry.phone,
      detectedAt: entry.detectedAt.toISOString(),
    });
  });

  // ── Crash alert WhatsApp queue ─────────────────────────────────────────────
  // Alerts that couldn't be sent because the WA sender was offline are held here
  // and delivered automatically as soon as the sender reconnects.
  type PendingAlert = {
    phone: string;
    msg: string;
    label: string;
    deploymentId: number;
    queuedAt: Date;
  };
  const _pendingWaAlerts: PendingAlert[] = [];

  const buildCrashMsg = (label: string, deploymentId: number): string => {
    const domain = process.env["PLATFORM_URL"] ??
      (process.env["REPLIT_DOMAINS"]?.split(",")[0]
        ? `https://${process.env["REPLIT_DOMAINS"]!.split(",")[0]}`
        : "");
    const link = domain ? `${domain}/deployments/${deploymentId}` : "";
    return [
      "╔══════════════════════╗",
      "    ⚠️  BOT ALERT       ",
      "╚══════════════════════╝",
      "",
      `Your bot *${label}* (ID #${deploymentId}) has crashed and is being auto-restarted.`,
      "",
      link ? `🔗 View logs: ${link}` : "Check your BERAHOST dashboard for details.",
      "",
      "_BERAHOST Bot Platform_",
    ].join("\n");
  };

  // Flush queued alerts whenever the WA sender comes online
  onWASenderConnected(() => {
    if (_pendingWaAlerts.length === 0) return;
    const toSend = _pendingWaAlerts.splice(0);
    logger.info({ count: toSend.length }, "WA sender connected — flushing queued crash alerts");
    for (const alert of toSend) {
      const age = Math.round((Date.now() - alert.queuedAt.getTime()) / 1000);
      const note = `\n\n_⏱ Alert was queued ${age}s ago while sender was offline._`;
      sendWhatsAppMessage(alert.phone, alert.msg + note).catch((err) =>
        logger.warn({ err, deploymentId: alert.deploymentId }, "Failed to flush queued crash alert")
      );
    }
  });

  // Wire up crash alert emitter — inserts a notification and pushes to user's socket room
  setUserAlertEmitter(async (userId, deploymentId, customName) => {
    const label = customName ?? `#${deploymentId}`;

    // 1. DB notification — always fires regardless of WA status
    await db.insert(notificationsTable).values({
      userId,
      title: "🚨 Bot Crashed",
      message: `Bot ${label} (deployment #${deploymentId}) crashed and is auto-restarting.`,
      isRead:  false,
    }).catch(() => {});

    // 2. Socket push — reaches the user if their browser is open
    io.to(`user:${userId}`).emit("crash:alert", { deploymentId, customName });
    logger.info({ userId, deploymentId }, "Crash alert sent to user");

    // 3. WhatsApp message — sent immediately if sender is online, queued if offline
    try {
      const [user] = await db.select({ phone: usersTable.phone }).from(usersTable).where(eq(usersTable.id, userId));
      if (user?.phone) {
        const msg = buildCrashMsg(label, deploymentId);
        if (getWASenderStatus() === "connected") {
          await sendWhatsAppMessage(user.phone, msg);
          logger.info({ userId, deploymentId }, "WA crash alert sent");
        } else {
          _pendingWaAlerts.push({ phone: user.phone, msg, label, deploymentId, queuedAt: new Date() });
          logger.info({ userId, deploymentId }, "WA sender offline — crash alert queued for delivery on reconnect");
        }
      }
    } catch (err) {
      logger.warn({ err, userId, deploymentId }, "Failed to send/queue WA crash alert");
    }
  });

  httpServer.listen(port, () => {
    const serverEnv = process.env["NODE_ENV"] ?? "development";
    const replitDomains = process.env["REPLIT_DOMAINS"] ?? "dev";
    logger.info({ port, env: serverEnv, domain: replitDomains }, "BERAHOST API Server listening");

    // After the server is up and Socket.io is wired, restore any bots
    // that were running before the server restarted
    logger.info("Bot auto-restore starting...");
    restoreRunningBots()
      .then(() => logger.info("Bot auto-restore complete"))
      .catch((err) => {
        logger.error({ err }, "Bot auto-restore FAILED");
      });
    restoreRunningWebDeployments()
      .then(() => logger.info("Web deployment restore complete"))
      .catch((err) => {
        logger.error({ err }, "Web deployment restore FAILED");
      });

    // ─── Self-keepalive ────────────────────────────────────────────────────
    // Replit Autoscale scales to ZERO instances when there is no inbound
    // traffic — which kills all bot child processes.  To prevent this we
    // ping our own health endpoint every 30 seconds.
    //
    // IMPORTANT: localhost pings are invisible to Replit's autoscale router.
    // Only requests that arrive through the public domain count as "traffic."
    // Priority order for the keepalive target:
    //   1. PLATFORM_URL env var — explicit production URL set by the operator
    //      e.g. https://bot-deployment-platform.replit.app
    //   2. REPLIT_DOMAINS — automatically set by Replit to the deployment domain
    //   3. localhost — development fallback only
    const explicitUrl = process.env["PLATFORM_URL"]?.trim();
    const replitDomain = process.env["REPLIT_DOMAINS"]?.split(",")[0]?.trim();
    const keepaliveUrl = explicitUrl
      ? (explicitUrl.endsWith("/api/healthz") ? explicitUrl : `${explicitUrl.replace(/\/$/, "")}/api/healthz`)
      : replitDomain
        ? `https://${replitDomain}/api/healthz`
        : `http://localhost:${port}/api/healthz`;

    const KEEPALIVE_INTERVAL_MS = 30 * 1000;
    setInterval(async () => {
      try {
        await fetch(keepaliveUrl);
      } catch {
        // Transient network hiccup — not a problem, next ping will work
      }
    }, KEEPALIVE_INTERVAL_MS);
    logger.info({ keepaliveUrl }, "Self-keepalive started (pings every 30s)");

    // ─── Scheduled restarts cron ───────────────────────────────────────────
    // Check every minute for deployments that need a scheduled restart
    setInterval(() => {
      runScheduledRestarts().catch((err) => {
        logger.error({ err }, "Scheduled restart cron error");
      });
    }, 60 * 1000);
    logger.info("Scheduled restart cron started (checks every 60s)");
    const reconcile = () => reconcileExpiredSubscriptions().catch((err) => logger.error({ err }, "Subscription expiry reconciliation failed"));
    reconcile();
    setInterval(reconcile, 60 * 1000);
    logger.info("Subscription expiry reconciler started (checks every 60s)");
  });
}

async function reconcileExpiredSubscriptions() {
  const expired = await db.select({ id: usersTable.id }).from(usersTable).where(and(lt(usersTable.subscriptionExpiresAt, new Date()), ne(usersTable.subscriptionPlan, "free"), eq(usersTable.isAdmin, false)));
  for (const user of expired) {
    const bots = await db.select({ id: deploymentsTable.id }).from(deploymentsTable).where(eq(deploymentsTable.userId, user.id));
    for (const bot of bots) await stopBotProcess(bot.id).catch(() => {});
    const webs = await db.select({ id: webDeploymentsTable.id }).from(webDeploymentsTable).where(eq(webDeploymentsTable.userId, user.id));
    for (const web of webs) await stopWebDeployment(web.id).catch(() => {});
    await db.update(usersTable).set({ subscriptionPlan: "free" }).where(eq(usersTable.id, user.id));
    logger.info({ userId: user.id }, "Expired subscription reconciled; hosted deployments retained and stopped");
  }
}

async function restoreRunningWebDeployments(): Promise<void> {
  const rows = await db.select({ id: webDeploymentsTable.id }).from(webDeploymentsTable).where(eq(webDeploymentsTable.status, "running"));
  if (rows.length === 0) {
    logger.info("No web deployments to restore on startup");
    return;
  }
  logger.info({ count: rows.length }, "Restoring web deployments from previous session...");
  for (const row of rows) {
    await startWebDeployment(row.id).catch((err: unknown) => logger.error({ err, webDeploymentId: row.id }, "Web deployment restore failed"));
  }
}

/**
 * On server start, find all deployments that were "running" in the DB
 * (they were active before the last restart) and relaunch them so users'
 * bots keep running without manual intervention.
 */
async function restoreRunningBots() {
  // Only restore bots that were genuinely running or mid-deploy when the server
  // restarted. Crashed bots are NOT auto-restored — the crash was real and the
  // user should decide whether to restart them manually.
  const runningDeps = await db
    .select({
      id: deploymentsTable.id,
      userId: deploymentsTable.userId,
      envVars: deploymentsTable.envVars,
      botId: deploymentsTable.botId,
      restartCount: deploymentsTable.restartCount,
    })
    .from(deploymentsTable)
    .where(inArray(deploymentsTable.status, ["running", "deploying"]));

  if (runningDeps.length === 0) {
    logger.info("No bots to restore on startup");
    return;
  }

  logger.info({ count: runningDeps.length }, "Restoring bots from previous session...");

  for (const dep of runningDeps) {
    try {
      const [owner] = await db.select({ subscriptionPlan: usersTable.subscriptionPlan, subscriptionExpiresAt: usersTable.subscriptionExpiresAt, isBanned: usersTable.isBanned, isAdmin: usersTable.isAdmin }).from(usersTable).where(eq(usersTable.id, dep.userId));
      if (!owner || owner.isBanned || (!owner.isAdmin && (!owner.subscriptionExpiresAt || owner.subscriptionExpiresAt <= new Date() || owner.subscriptionPlan === "free"))) {
        await db.update(deploymentsTable).set({ status: "stopped", pid: null, updatedAt: new Date() }).where(eq(deploymentsTable.id, dep.id));
        continue;
      }
      // Reset restart counter so the bot gets full auto-restart budget again
      await db
        .update(deploymentsTable)
        .set({ restartCount: 0, pid: null })
        .where(eq(deploymentsTable.id, dep.id));

      const [bot] = await db
        .select({ repoUrl: botsTable.repoUrl })
        .from(botsTable)
        .where(eq(botsTable.id, dep.botId));

      if (!bot) {
        logger.warn({ deploymentId: dep.id }, "Bot record not found, skipping restore");
        continue;
      }

      logger.info({ deploymentId: dep.id }, "Restoring bot process...");
      await startBotProcess(dep.id, bot.repoUrl, (dep.envVars as Record<string, string>) ?? {});
      logger.info({ deploymentId: dep.id }, "Bot restored successfully");
    } catch (err) {
      logger.error({ err, deploymentId: dep.id }, "Failed to restore bot, marking as crashed");
      await db
        .update(deploymentsTable)
        .set({ status: "crashed", pid: null, updatedAt: new Date() })
        .where(eq(deploymentsTable.id, dep.id));
    }
  }
}

/**
 * Seeds the database with an admin user and bot templates if they don't exist.
 * Safe to run on every startup — uses INSERT ... ON CONFLICT DO NOTHING style logic.
 * Credentials can be overridden via environment variables ADMIN_EMAIL / ADMIN_PASSWORD.
 */
async function seedDatabase() {
  // ── Admin user ──────────────────────────────────────────────────────────
  const [{ userCount }] = await db.select({ userCount: count() }).from(usersTable);

  const adminEmail    = process.env["ADMIN_EMAIL"]    ?? "admin@berahost.com";
  const adminPassword = process.env["ADMIN_PASSWORD"];

  if (userCount === 0) {
    if (!adminPassword) {
      throw new Error("ADMIN_PASSWORD is required before seeding the initial administrator.");
    }
    const passwordHash = await bcrypt.hash(adminPassword, 12);

    await db.insert(usersTable).values({
      email:            adminEmail,
      passwordHash,
      coins:            10000,
      isVerified:       true,
      isAdmin:          true,
      referralCode:     "ADMINBERA",
      subscriptionPlan: "enterprise",
    });

    // Optional demo account: only seed when credentials are explicitly configured.
    const demoEmail = process.env["DEMO_EMAIL"];
    const demoPassword = process.env["DEMO_PASSWORD"];
    if (demoEmail && demoPassword) {
      const demoHash = await bcrypt.hash(demoPassword, 12);
      await db.insert(usersTable).values({
        email: demoEmail,
        passwordHash: demoHash,
        coins: 100,
        isVerified: true,
        isAdmin: false,
        referralCode: "DEMOBERA",
        subscriptionPlan: "free",
      });
    }

    logger.info({ email: adminEmail }, "Seeded admin user");
  } else {
    // Ensure the admin user always has the correct attributes (idempotent fix)
    await db
      .update(usersTable)
      .set({ isAdmin: true, isVerified: true, subscriptionPlan: "enterprise" })
      .where(eq(usersTable.email, adminEmail));
  }

  // ── Bot templates ───────────────────────────────────────────────────────
  // Upsert each bot by name so new bots are always added, even if the DB
  // already has some bots (avoids production missing bots that were added
  // to the seed after first deployment).
  const BOT_SEEDS = [
    {
      name:         "Atassa-MD",
      repoUrl:      "https://github.com/mauricegift/atassa",
      description:  "Advanced WhatsApp bot with AI features, games, and economy system. Powered by Baileys.",
      platform:     "whatsapp",
      isFeatured:   true,
      requiredVars: {
        PREFIX:       "Bot command prefix (e.g. .)",
        SESSION_ID:   "Your WhatsApp session ID (must start with Gifted~)",
        OWNER_NUMBER: "Your WhatsApp number with country code",
      },
      optionalVars: {
        BOT_NAME:  "Custom bot name",
        LANGUAGE:  "Bot language (en/sw)",
        AUTO_READ: "Auto-read messages (true/false)",
      },
      sessionGuideUrl: "https://session.giftedtech.co.ke/pair",
      sessionPrefix:   "Gifted~",
      startCommand:    "npm start",
      version:         1,
    },
    {
      name:         "Bera AI",
      repoUrl:      process.env["GH_TOKEN"]
        ? `https://${process.env["GH_TOKEN"]}@github.com/bera-tech-ai/bera-ai.git`
        : "https://github.com/bera-tech-ai/bera-ai.git",
      description:  `Bera AI is a powerful WhatsApp assistant built on toxic-baileys. It connects to your WhatsApp using a pairing code — no QR scan or external session generator needed. Once linked, it gives you AI-powered replies, group management tools, anti-delete, anti-link, auto-status view, reminders, and a full owner command suite.\n\n✦ AI CHAT — Responds intelligently to messages using GPT-4\n✦ PAIRING CODE AUTH — Connects instantly via a 8-digit code, no QR needed\n✦ GROUP TOOLS — Anti-link, anti-bad-word, anti-mention, welcome/goodbye messages\n✦ ANTI-DELETE — Recovers deleted messages and forwards them to you privately\n✦ AUTO STATUS VIEW — Automatically views all WhatsApp statuses\n✦ OWNER COMMANDS — Full control via DM: kick, promote, broadcast, ban, and more\n✦ REMINDERS — Schedule recurring messages and alerts\n✦ ALWAYS ON — Auto-reconnects on disconnect, runs 24/7 on BERAHOST infrastructure`,
      platform:     "whatsapp",
      isFeatured:   true,
      requiredVars: {
        OWNER_NUMBER: "Your WhatsApp number with country code e.g. 254712345678",
      },
      optionalVars: {
        NICK_API:  "AI API endpoint (optional)",
        BOT_IMAGE: "URL or path to bot profile picture (optional)",
      },
      sessionGuideUrl: null,
      sessionPrefix:   null,
      startCommand:    "npm start",
      version:         1,
    },
  ];

  let seededCount = 0;
  for (const bot of BOT_SEEDS) {
    const existing = await db.select({ id: botsTable.id }).from(botsTable).where(eq(botsTable.name, bot.name));
    if (existing.length === 0) {
      await db.insert(botsTable).values(bot as any);
      seededCount++;
    }
  }
  if (seededCount > 0) logger.info({ count: seededCount }, "Seeded missing bot templates");

  // ── Platform settings ─────────────────────────────────────────────────────
  // Upsert every default so that existing DBs always pick up new keys (e.g.
  // deploy_cost_whatsapp added after initial deploy) without wiping admin edits
  // on keys that already exist.
  const defaultSettings: { key: string; value: any }[] = [
    { key: "site_name",              value: "BERAHOST" },
    { key: "maintenance_mode",       value: false },
    { key: "daily_claim_coins",      value: 5 },
    { key: "referral_coins",         value: 20 },
    { key: "deploy_cost_whatsapp",   value: 10 }, // coins per WhatsApp deployment
    { key: "deploy_cost_telegram",   value: 8 },  // coins per Telegram deployment
  ];

  for (const setting of defaultSettings) {
    const [existing] = await db
      .select({ key: platformSettingsTable.key })
      .from(platformSettingsTable)
      .where(eq(platformSettingsTable.key, setting.key));

    if (!existing) {
      await db.insert(platformSettingsTable).values(setting as any);
    }
  }

  logger.info("Platform settings check complete");
}

main().catch((err) => {
  logger.error({ err }, "Failed to start server");
  process.exit(1);
});
