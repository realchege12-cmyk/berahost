import { Router } from "express";
import { db, githubWebhooksTable, deploymentsTable, botsTable, usersTable, webDeploymentsTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { requireAny } from "../middlewares/requireAuth";
import { stopBotProcess, startBotProcess } from "../lib/botProcess";
import { decryptGithubToken, deleteGithubWebhook, getGithubIdentity, listGithubBranches, listGithubRepositories, managedGithubWebhookUrl, removeWebDeploymentWebhook, revokeGithubToken } from "../lib/github";
import { redeployWebDeployment } from "../lib/webProcess";
import { logger } from "../lib/logger";
import crypto from "crypto";

const router = Router();

router.get("/github/status", requireAny("read"), async (req, res): Promise<void> => {
  const user = (req as any).user;
  res.json({ connected: Boolean(user.githubId && user.githubAccessTokenEncrypted), login: user.githubLogin || null, avatarUrl: user.githubAvatarUrl || null, userId: user.githubId || null });
});

router.get("/github/repos", requireAny("read"), async (req, res): Promise<void> => {
  const user = (req as any).user;
  const token = decryptGithubToken(user.githubAccessTokenEncrypted);
  if (!token) { res.status(409).json({ error: "Connect GitHub before choosing a repository." }); return; }
  try { res.json(await listGithubRepositories(token)); }
  catch (error: any) { res.status(502).json({ error: error?.message || "Unable to load GitHub repositories." }); }
});

router.get("/github/repos/branches", requireAny("read"), async (req, res): Promise<void> => {
  const user = (req as any).user;
  const fullName = String(req.query.fullName || "");
  const token = decryptGithubToken(user.githubAccessTokenEncrypted);
  if (!token) { res.status(409).json({ error: "Connect GitHub before loading branches." }); return; }
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(fullName)) { res.status(400).json({ error: "Invalid repository identity." }); return; }
  try { res.json({ branches: await listGithubBranches(token, fullName) }); }
  catch (error: any) { res.status(502).json({ error: error?.message || "Unable to load repository branches." }); }
});

router.post("/github/disconnect", requireAny("write"), async (req, res): Promise<void> => {
  const user = (req as any).user;
  const token = decryptGithubToken(user.githubAccessTokenEncrypted);
  const deployments = await db.select({ id: webDeploymentsTable.id }).from(webDeploymentsTable).where(eq(webDeploymentsTable.userId, user.id));
  for (const deployment of deployments) await removeWebDeploymentWebhook(deployment.id).catch(() => {});
  if (token) await revokeGithubToken(token).catch(() => {});
  await db.update(usersTable).set({ githubId: null, githubLogin: null, githubAvatarUrl: null, githubAccessTokenEncrypted: null }).where(eq(usersTable.id, user.id));
  res.json({ message: "GitHub disconnected" });
});

function generateWebhookSecret(): string {
  return crypto.randomBytes(20).toString("hex");
}

router.get("/github/webhooks", requireAny("read"), async (req, res): Promise<void> => {
  const user = (req as any).user;
  const hooks = await db.select().from(githubWebhooksTable).where(eq(githubWebhooksTable.userId, user.id));

  res.json(
    hooks.map((h) => ({
      id: h.id,
      deploymentId: h.deploymentId,
      repoUrl: h.repoUrl,
      branch: h.branch,
      isEnabled: h.isEnabled,
      lastTriggeredAt: h.lastTriggeredAt?.toISOString() ?? null,
      lastCommitMsg: h.lastCommitMsg,
      webhookUrl: `${process.env.FRONTEND_URL || ""}/api/github/webhook/${h.id}`,
      webhookSecret: h.webhookSecret,
      createdAt: h.createdAt.toISOString(),
    }))
  );
});

router.post("/github/webhooks", requireAny("write"), async (req, res): Promise<void> => {
  const user = (req as any).user;
  const { deploymentId, repoUrl, branch } = req.body;

  if (!deploymentId || !repoUrl) {
    res.status(400).json({ error: "deploymentId and repoUrl are required" });
    return;
  }

  const [dep] = await db.select().from(deploymentsTable).where(eq(deploymentsTable.id, deploymentId));
  if (!dep || dep.userId !== user.id) {
    res.status(404).json({ error: "Deployment not found" });
    return;
  }

  const webhookSecret = generateWebhookSecret();
  const [hook] = await db
    .insert(githubWebhooksTable)
    .values({
      deploymentId,
      userId: user.id,
      repoUrl,
      branch: branch || "main",
      webhookSecret,
      isEnabled: true,
    })
    .returning();

  const replitDomain = process.env.REPLIT_DOMAINS?.split(",")[0] || process.env.REPLIT_DEV_DOMAIN || "";
  const webhookUrl = `https://${replitDomain}/api/github/webhook/${hook.id}`;

  res.status(201).json({
    id: hook.id,
    webhookUrl,
    webhookSecret: hook.webhookSecret,
    message: "GitHub webhook configured. Add this URL to your GitHub repo → Settings → Webhooks.",
  });
});

router.delete("/github/webhooks/:id", requireAny("write"), async (req, res): Promise<void> => {
  const user = (req as any).user;
  const hookId = parseInt(String(req.params.id));

  await db.delete(githubWebhooksTable).where(and(eq(githubWebhooksTable.id, hookId), eq(githubWebhooksTable.userId, user.id)));
  res.json({ message: "Webhook removed" });
});

router.post("/github/webhook/:hookId", async (req, res): Promise<void> => {
  const hookId = parseInt(String(req.params.hookId));

  const [hook] = await db.select().from(githubWebhooksTable).where(eq(githubWebhooksTable.id, hookId));
  if (!hook || !hook.isEnabled) {
    res.status(404).json({ error: "Webhook not found or disabled" });
    return;
  }

  const signature = req.headers["x-hub-signature-256"] as string;
  if (signature) {
    const expected = "sha256=" + crypto.createHmac("sha256", hook.webhookSecret).update((req as any).rawBody || JSON.stringify(req.body)).digest("hex");
    const valid = signature.length === expected.length && crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
    if (!valid) {
      res.status(401).json({ error: "Invalid signature" });
      return;
    }
  }

  const event = req.headers["x-github-event"] as string;
  const payload = req.body as any;
  const branch = payload?.ref?.replace("refs/heads/", "");

  if (event !== "push" || branch !== hook.branch) {
    res.json({ message: "Ignored (not a push to configured branch)" });
    return;
  }

  const commitSha = payload?.head_commit?.id?.slice(0, 7) ?? "";
  const commitMsg = payload?.head_commit?.message ?? "";

  await db.update(githubWebhooksTable).set({
    lastTriggeredAt: new Date(),
    lastCommitSha: commitSha,
    lastCommitMsg: commitMsg,
  }).where(eq(githubWebhooksTable.id, hookId));

  if (hook.webDeploymentId) {
    const [web] = await db.select().from(webDeploymentsTable).where(eq(webDeploymentsTable.id, hook.webDeploymentId));
    if (!web || !web.autoDeploy) { res.json({ message: "Push recorded; automatic deployment is disabled", commitSha, commitMsg }); return; }
    if (payload?.repository?.full_name && web.githubFullName && payload.repository.full_name.toLowerCase() !== web.githubFullName.toLowerCase()) {
      res.status(409).json({ error: "Repository does not match this deployment" }); return;
    }
    logger.info({ webDeploymentId: web.id, commitSha, commitMsg }, "GitHub push — redeploying web application");
    redeployWebDeployment(web.id, commitSha, commitMsg).catch((error) => logger.error({ error, webDeploymentId: web.id }, "GitHub web auto-deploy failed"));
    res.json({ message: "Web redeployment queued", commitSha, commitMsg });
    return;
  }

  if (!hook.deploymentId) {
    res.json({ message: "Push recorded", commitSha, commitMsg });
    return;
  }
  const [dep] = await db.select().from(deploymentsTable).where(eq(deploymentsTable.id, hook.deploymentId));
  const [bot] = dep
    ? await db.select().from(botsTable).where(eq(botsTable.id, dep.botId))
    : [];
  if (dep && bot && dep.status === "running") {
    logger.info({ deploymentId: dep.id, commitSha, commitMsg }, "GitHub push — redeploying bot");
    try {
      await stopBotProcess(dep.id);
      await new Promise((r) => setTimeout(r, 2000));
      await startBotProcess(dep.id, bot.repoUrl, (dep.envVars ?? {}) as Record<string, string>);
    } catch (err: any) {
      logger.error({ err: err.message, deploymentId: dep.id }, "GitHub auto-deploy failed");
    }
  }

  res.json({ message: "Redeployment triggered", commitSha, commitMsg });
});

export default router;
