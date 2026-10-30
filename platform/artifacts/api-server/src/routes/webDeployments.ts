import { Router } from "express";
import crypto from "crypto";
import dns from "dns/promises";
import { db, webDeploymentsTable, webDeploymentLogsTable, domainOrdersTable, usersTable, deploymentsTable } from "@workspace/db";
import { and, asc, desc, eq, gt, gte, ilike } from "drizzle-orm";
import { requireAny } from "../middlewares/requireAuth";
import { getPlan, isSubscriptionActive } from "../lib/subscriptions";
import { deleteWebDeployment, normalizeGithubUrl, startWebDeployment, stopWebDeployment } from "../lib/webProcess";
import { validateWebDeploymentSlug, WEB_DEPLOYMENT_DOMAIN, webDeploymentUrl } from "../lib/webDeploymentConfig";
import { decryptGithubToken, ensureWebDeploymentWebhook, getGithubRepository, githubRepoUrl, managedGithubWebhookUrl, removeWebDeploymentWebhook } from "../lib/github";
import { logger } from "../lib/logger";
import { decryptWebEnvVars, encryptWebEnvVars } from "../lib/webEnvSecrets";

const router = Router();
function publicUrl(slug: string) {
  return webDeploymentUrl(slug);
}
function serialize(row: any) {
  const { envVars, ...publicRow } = row;
  let buildLog = String(row.buildLog || "");
  try {
    const secretValues = Object.values(decryptWebEnvVars(envVars)).filter((value) => value.length > 0).sort((a, b) => b.length - a.length);
    for (const secret of secretValues) buildLog = buildLog.split(secret).join("[REDACTED]");
  } catch {
    if (envVars) buildLog = "[Deployment logs are temporarily hidden because secrets could not be safely redacted.]";
  }
  const scannedVars = Array.isArray(row.scannedVars) ? row.scannedVars.map((entry: any) => ({ key: entry?.key, description: entry?.description, required: Boolean(entry?.required) })).filter((entry: any) => typeof entry.key === "string") : [];
  return { ...publicRow, buildLog, hasEnvironmentVariables: Boolean(envVars), scannedVars, publicUrl: publicUrl(row.slug), createdAt: row.createdAt?.toISOString?.() ?? row.createdAt, updatedAt: row.updatedAt?.toISOString?.() ?? null, expiresAt: row.expiresAt?.toISOString?.() ?? null };
}
function parseOptionalCommand(value: unknown, label: string): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string") throw new Error(`${label} must be a command string.`);
  const command = value.trim();
  if (!command) return null;
  if (command.length > 1000 || /[\0\r\n]/.test(command)) throw new Error(`${label} must be a single-line command of at most 1,000 characters.`);
  return command;
}
async function activeUser(userId: number) {
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
  if (!user || user.isBanned || user.deletedAt) return null;
  if (user.isAdmin) return { user, plan: { id: "admin", name: "Administrator", maxDeployments: 9999, maxBots: 9999, maxWebApps: 9999, customDomains: true, githubDeployment: true, priceKes: 0, features: ["Administrator access"] } };
  const knownPlan = ["starter", "silver", "gold"].includes(user.subscriptionPlan || "");
  return knownPlan && isSubscriptionActive(user) ? { user, plan: getPlan(user.subscriptionPlan) } : null;
}

router.get("/web-deployments", requireAny("read"), async (req, res): Promise<void> => {
  const user = (req as any).user;
  const rows = await db.select().from(webDeploymentsTable).where(eq(webDeploymentsTable.userId, user.id)).orderBy(desc(webDeploymentsTable.createdAt));
  res.json(rows.map(serialize));
});

router.get("/web-deployments/slug-availability", requireAny("read"), async (req, res): Promise<void> => {
  const checked = validateWebDeploymentSlug(req.query.slug);
  if (checked.error) { res.json({ slug: checked.slug, available: false, error: checked.error }); return; }
  const hostname = `${checked.slug}.${WEB_DEPLOYMENT_DOMAIN}`;
  const [[existingSlug], [existingDomain]] = await Promise.all([
    db.select({ id: webDeploymentsTable.id }).from(webDeploymentsTable).where(eq(webDeploymentsTable.slug, checked.slug)).limit(1),
    db.select({ id: domainOrdersTable.id }).from(domainOrdersTable).where(eq(domainOrdersTable.hostname, hostname)).limit(1),
  ]);
  const available = !existingSlug && !existingDomain;
  res.json({
    slug: checked.slug,
    available,
    publicUrl: webDeploymentUrl(checked.slug),
    ...(available ? {} : { error: existingSlug ? "That subdomain is already taken. Choose another." : "That hostname is reserved by a domain request." }),
  });
});

router.get("/web-deployments/:id", requireAny("read"), async (req, res): Promise<void> => {
  const user = (req as any).user;
  const id = Number(req.params.id);
  const [row] = await db.select().from(webDeploymentsTable).where(and(eq(webDeploymentsTable.id, id), eq(webDeploymentsTable.userId, user.id)));
  if (!row) { res.status(404).json({ error: "Web deployment not found" }); return; }
  res.json(serialize(row));
});

router.get("/web-deployments/:id/logs", requireAny("read"), async (req, res): Promise<void> => {
  const user = (req as any).user;
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id < 1) { res.status(404).json({ error: "Web deployment not found" }); return; }
  const [deployment] = await db.select({ id: webDeploymentsTable.id, currentRunId: webDeploymentsTable.currentRunId, status: webDeploymentsTable.status, stopReason: webDeploymentsTable.stopReason }).from(webDeploymentsTable).where(and(eq(webDeploymentsTable.id, id), eq(webDeploymentsTable.userId, user.id)));
  if (!deployment) { res.status(404).json({ error: "Web deployment not found" }); return; }
  const conditions: any[] = [eq(webDeploymentLogsTable.deploymentId, id), gte(webDeploymentLogsTable.createdAt, new Date(Date.now() - 7 * 24 * 60 * 60 * 1000))];
  const after = Number(req.query.after || 0);
  if (Number.isSafeInteger(after) && after > 0) conditions.push(gt(webDeploymentLogsTable.id, after));
  const stage = String(req.query.stage || "");
  if (["queue", "clone", "detect", "install", "build", "start", "runtime", "health", "system"].includes(stage)) conditions.push(eq(webDeploymentLogsTable.stage, stage));
  const logType = String(req.query.type || "");
  if (["stdout", "stderr", "info", "warn", "error"].includes(logType)) conditions.push(eq(webDeploymentLogsTable.logType, logType));
  const runId = String(req.query.runId || "");
  if (runId && /^[A-Za-z0-9-]{1,64}$/.test(runId)) conditions.push(eq(webDeploymentLogsTable.runId, runId));
  const query = String(req.query.q || "").trim().slice(0, 100);
  if (query) conditions.push(ilike(webDeploymentLogsTable.message, `%${query}%`));
  const limitRaw = Number(req.query.limit || 200);
  const limit = Number.isSafeInteger(limitRaw) ? Math.max(1, Math.min(limitRaw, 500)) : 200;
  const live = Number.isSafeInteger(after) && after > 0;
  let logs = await db.select().from(webDeploymentLogsTable).where(and(...conditions)).orderBy(live ? asc(webDeploymentLogsTable.id) : desc(webDeploymentLogsTable.id)).limit(limit);
  if (!live) logs = logs.reverse();
  res.json({
    deployment: { status: deployment.status, currentRunId: deployment.currentRunId, stopReason: deployment.stopReason },
    query: { after: live ? after : null, stage: stage || null, type: logType || null, runId: runId || null, q: query || null },
    logs: logs.map((entry) => ({ id: entry.id, runId: entry.runId, stage: entry.stage, logType: entry.logType, message: entry.message, createdAt: entry.createdAt.toISOString() })),
    nextCursor: logs.at(-1)?.id ?? after,
  });
});

router.post("/web-deployments/scan", requireAny("write"), async (req, res): Promise<void> => {
  const repoUrl = normalizeGithubUrl(req.body?.repoUrl);
  if (!repoUrl) { res.status(400).json({ error: "Enter a public GitHub repository URL such as https://github.com/owner/repository" }); return; }
  res.json({ repoUrl, message: "Environment variables are scanned during the first build. Add values only for the variables your project requires." });
});

router.post("/web-deployments", requireAny("write"), async (req, res): Promise<void> => {
  const user = (req as any).user;
  const entitlement = await activeUser(user.id);
  if (!entitlement) { res.status(402).json({ error: "An active monthly subscription is required before deploying a web application." }); return; }
  const projectType = req.body?.projectType;
  if (projectType !== "static" && projectType !== "service") { res.status(400).json({ error: "Choose either Static Site or Web Service." }); return; }
  const checkedSlug = validateWebDeploymentSlug(req.body?.slug);
  if (checkedSlug.error) { res.status(400).json({ error: checkedSlug.error }); return; }
  const [existingSlug] = await db.select({ id: webDeploymentsTable.id }).from(webDeploymentsTable).where(eq(webDeploymentsTable.slug, checkedSlug.slug)).limit(1);
  const [existingDomain] = await db.select({ id: domainOrdersTable.id }).from(domainOrdersTable).where(eq(domainOrdersTable.hostname, `${checkedSlug.slug}.${WEB_DEPLOYMENT_DOMAIN}`)).limit(1);
  if (existingSlug || existingDomain) { res.status(409).json({ error: "That subdomain is no longer available. Choose another." }); return; }
  if (!entitlement.plan.githubDeployment) { res.status(403).json({ error: "GitHub deployment is not available on this plan." }); return; }
  const selectedRepo = req.body?.githubRepo && typeof req.body.githubRepo === "object" ? req.body.githubRepo : null;
  let repoUrl = normalizeGithubUrl(req.body?.repoUrl);
  let githubRepoId: number | null = null;
  let githubFullName: string | null = null;
  let githubPrivate = false;
  let defaultBranch = "main";
  if (selectedRepo?.fullName) {
    const token = decryptGithubToken(entitlement.user.githubAccessTokenEncrypted);
    if (!token) { res.status(409).json({ error: "Connect GitHub before deploying a selected repository." }); return; }
    try {
      const verified = await getGithubRepository(token, String(selectedRepo.fullName));
      repoUrl = githubRepoUrl(verified.fullName);
      githubRepoId = verified.id;
      githubFullName = verified.fullName;
      githubPrivate = verified.private;
      defaultBranch = verified.defaultBranch;
    } catch (error: any) {
      res.status(403).json({ error: error?.message || "You do not have access to this GitHub repository." });
      return;
    }
  }
  if (!repoUrl) { res.status(400).json({ error: "Choose a connected GitHub repository or enter a public GitHub repository URL." }); return; }
  const branch = String(req.body?.branch || defaultBranch).trim();
  if (!/^[A-Za-z0-9._/-]{1,120}$/.test(branch) || branch.includes("..")) { res.status(400).json({ error: "Invalid branch name" }); return; }
  let installCommand: string | null;
  let buildCommand: string | null;
  let startCommand: string | null;
  try {
    installCommand = parseOptionalCommand(req.body?.installCommand, "Install command");
    buildCommand = parseOptionalCommand(req.body?.buildCommand, "Build command");
    startCommand = parseOptionalCommand(req.body?.startCommand, "Start command");
  } catch (error: any) { res.status(400).json({ error: error?.message || "Invalid deployment command." }); return; }
  const existing = await db.select({ id: webDeploymentsTable.id }).from(webDeploymentsTable).where(eq(webDeploymentsTable.userId, user.id));
  if (existing.length >= entitlement.plan.maxWebApps) { res.status(403).json({ error: `${entitlement.plan.name} supports up to ${entitlement.plan.maxWebApps} web apps.`, limit: entitlement.plan.maxWebApps }); return; }
  const rawEnvVars = req.body?.envVars ?? {};
  if (!rawEnvVars || typeof rawEnvVars !== "object" || Array.isArray(rawEnvVars)) { res.status(400).json({ error: "Environment values must be an object of KEY=VALUE pairs." }); return; }
  const entries = Object.entries(rawEnvVars);
  if (entries.length > 100) { res.status(400).json({ error: "A deployment can have at most 100 environment values." }); return; }
  const envVars: Record<string, string> = {};
  let envBytes = 0;
  const reservedEnvKeys = new Set(["PORT", "NODE_ENV", "PATH", "HOME", "TMPDIR", "CI", "BASH_ENV", "ENV", "LD_PRELOAD", "LD_LIBRARY_PATH", "NODE_OPTIONS"]);
  for (const [key, value] of entries) {
    if (!/^[A-Za-z_][A-Za-z0-9_]{0,127}$/.test(key) || typeof value !== "string" || value.includes("\0") || ["__PROTO__", "CONSTRUCTOR", "PROTOTYPE"].includes(key.toUpperCase())) { res.status(400).json({ error: "Environment keys must be valid names and values must be NUL-free strings." }); return; }
    if (reservedEnvKeys.has(key.toUpperCase()) || key.toUpperCase().startsWith("BERAHOST_")) { res.status(400).json({ error: `${key} is controlled by BERAHOST and cannot be set by a deployment.` }); return; }
    envBytes += Buffer.byteLength(key, "utf8") + Buffer.byteLength(value, "utf8");
    if (envBytes > 65536) { res.status(400).json({ error: "Environment values exceed the 64 KB total limit." }); return; }
    envVars[key] = value;
  }
  let encryptedEnvVars: string | null = null;
  try { if (entries.length) encryptedEnvVars = encryptWebEnvVars(envVars); }
  catch (error: any) { logger.error({ err: error }, "Could not encrypt web deployment environment values"); res.status(500).json({ error: "Server-side environment encryption is not configured." }); return; }
  const autoDeploy = Boolean(selectedRepo) && req.body?.autoDeploy !== false;
  let row: any;
  try {
    [row] = await db.insert(webDeploymentsTable).values({ userId: user.id, repoUrl, githubRepoId, githubFullName, githubPrivate, branch, customName: typeof req.body?.customName === "string" ? req.body.customName.trim().slice(0, 100) || null : null, slug: checkedSlug.slug, projectType, installCommand, buildCommand, startCommand, envVars: encryptedEnvVars, expiresAt: user.subscriptionExpiresAt, status: "queued", autoDeploy }).returning();
  } catch (error: any) {
    if (error?.code === "23505" || error?.cause?.code === "23505") { res.status(409).json({ error: "That subdomain was just claimed. Choose another." }); return; }
    throw error;
  }
  let automationWarning: string | undefined;
  if (autoDeploy) {
    try { await ensureWebDeploymentWebhook(row.id, managedGithubWebhookUrl(req as any)); }
    catch (error: any) {
      automationWarning = error?.message || "Automatic deployment could not be enabled.";
      await db.update(webDeploymentsTable).set({ autoDeploy: false, updatedAt: new Date() }).where(eq(webDeploymentsTable.id, row.id));
      row.autoDeploy = false;
    }
  }
  startWebDeployment(row.id).catch((err) => logger.error({ err, webDeploymentId: row.id }, "Web deployment start failed"));
  res.status(201).json({ ...serialize(row), automationWarning });
});

router.patch("/web-deployments/:id", requireAny("write"), async (req, res): Promise<void> => {
  const user = (req as any).user;
  const id = Number(req.params.id);
  const [row] = await db.select().from(webDeploymentsTable).where(and(eq(webDeploymentsTable.id, id), eq(webDeploymentsTable.userId, user.id)));
  if (!row) { res.status(404).json({ error: "Web deployment not found" }); return; }
  const nextAutoDeploy = req.body?.autoDeploy === undefined ? row.autoDeploy : Boolean(req.body.autoDeploy);
  const nextBranch = req.body?.branch === undefined ? row.branch : String(req.body.branch).trim();
  if (!/^[A-Za-z0-9._/-]{1,120}$/.test(nextBranch) || nextBranch.includes("..")) { res.status(400).json({ error: "Invalid branch name" }); return; }
  if (row.autoDeploy && (!nextAutoDeploy || nextBranch !== row.branch)) await removeWebDeploymentWebhook(id).catch(() => {});
  const [updated] = await db.update(webDeploymentsTable).set({ branch: nextBranch, autoDeploy: nextAutoDeploy, updatedAt: new Date() }).where(eq(webDeploymentsTable.id, id)).returning();
  let automationWarning: string | undefined;
  if (nextAutoDeploy) {
    try { await ensureWebDeploymentWebhook(id, managedGithubWebhookUrl(req as any)); }
    catch (error: any) { automationWarning = error?.message || "Automatic deployment could not be enabled."; await db.update(webDeploymentsTable).set({ autoDeploy: false }).where(eq(webDeploymentsTable.id, id)); updated.autoDeploy = false; }
  }
  res.json({ ...serialize(updated), automationWarning });
});

router.post("/web-deployments/:id/start", requireAny("write"), async (req, res): Promise<void> => {
  const user = (await activeUser((req as any).user.id));
  if (!user) { res.status(402).json({ error: "Your subscription is inactive. Renew to start this web deployment." }); return; }
  const id = Number(req.params.id);
  const [row] = await db.select().from(webDeploymentsTable).where(and(eq(webDeploymentsTable.id, id), eq(webDeploymentsTable.userId, user.user.id)));
  if (!row) { res.status(404).json({ error: "Web deployment not found" }); return; }
  if (row.status === "running" || ["queued", "building", "deploying", "starting"].includes(row.status)) {
    res.json({ message: row.status === "running" ? "Web deployment is already running." : "Web deployment is already in progress." });
    return;
  }
  await db.update(webDeploymentsTable).set({ expiresAt: user.user.subscriptionExpiresAt, status: "queued", updatedAt: new Date() }).where(eq(webDeploymentsTable.id, id));
  startWebDeployment(id).catch((err) => logger.error({ err, webDeploymentId: id }, "Web deployment restart failed"));
  res.json({ message: "Web deployment starting" });
});

router.post("/web-deployments/:id/stop", requireAny("write"), async (req, res): Promise<void> => {
  const user = (req as any).user;
  const id = Number(req.params.id);
  const [row] = await db.select().from(webDeploymentsTable).where(and(eq(webDeploymentsTable.id, id), eq(webDeploymentsTable.userId, user.id)));
  if (!row) { res.status(404).json({ error: "Web deployment not found" }); return; }
  await stopWebDeployment(id);
  res.json({ message: "Web deployment stopped" });
});

router.delete("/web-deployments/:id", requireAny("write"), async (req, res): Promise<void> => {
  const user = (req as any).user;
  const id = Number(req.params.id);
  const [row] = await db.select({ id: webDeploymentsTable.id }).from(webDeploymentsTable).where(and(eq(webDeploymentsTable.id, id), eq(webDeploymentsTable.userId, user.id)));
  if (!row) { res.status(404).json({ error: "Web deployment not found" }); return; }

  await deleteWebDeployment(id);
  await removeWebDeploymentWebhook(id).catch(() => {});
  await db.delete(domainOrdersTable).where(and(eq(domainOrdersTable.webDeploymentId, id), eq(domainOrdersTable.userId, user.id)));
  await db.delete(webDeploymentsTable).where(and(eq(webDeploymentsTable.id, id), eq(webDeploymentsTable.userId, user.id)));
  res.json({ message: "Web deployment deleted" });
});

router.post("/web-deployments/:id/domains", requireAny("payments"), async (req, res): Promise<void> => {
  const user = (req as any).user;
  const entitlement = await activeUser(user.id);
  if (!entitlement || (!user.isAdmin && !entitlement.plan.customDomains)) { res.status(403).json({ error: "Custom domain requests are available on Silver and Gold plans." }); return; }
  const id = Number(req.params.id);
  const hostname = String(req.body?.hostname || "").trim().toLowerCase();
  if (!/^(?=.{4,255}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(hostname)) { res.status(400).json({ error: "Enter a valid domain name" }); return; }
  if (hostname === WEB_DEPLOYMENT_DOMAIN || hostname.endsWith(`.${WEB_DEPLOYMENT_DOMAIN}`)) { res.status(400).json({ error: `Domains under ${WEB_DEPLOYMENT_DOMAIN} are reserved for BERAHOST subdomains. Use a domain you own outside this zone.` }); return; }
  const [deployment] = await db.select().from(webDeploymentsTable).where(and(eq(webDeploymentsTable.id, id), eq(webDeploymentsTable.userId, user.id)));
  if (!deployment) { res.status(404).json({ error: "Web deployment not found" }); return; }
  const token = `bera-verify-${crypto.randomBytes(16).toString("hex")}`;
  const adminFree = Boolean(user.isAdmin);
  const [order] = await db.insert(domainOrdersTable).values({ userId: user.id, webDeploymentId: id, hostname, priceKes: adminFree ? 0 : 134, verificationToken: token, status: adminFree ? "paid" : "pending" }).returning();
  res.status(201).json({ id: order.id, hostname, amountKes: adminFree ? 0 : 134, adminFree, verificationToken: token, message: adminFree ? "Domain request created for the administrator at no charge. Add the verification TXT record shown here." : "Domain request created. Complete the KES 134 PayHero payment, then add the verification TXT record shown here." });
});

router.post("/web-deployments/domains/:id/verify", requireAny("write"), async (req, res): Promise<void> => {
  const user = (req as any).user;
  const id = Number(req.params.id);
  const [order] = await db.select().from(domainOrdersTable).where(and(eq(domainOrdersTable.id, id), eq(domainOrdersTable.userId, user.id)));
  if (!order) { res.status(404).json({ error: "Domain order not found" }); return; }
  if (order.status !== "paid") { res.status(400).json({ error: "The domain order must be paid before verification." }); return; }
  try {
    const records = await dns.resolveTxt(`_berahost.${order.hostname}`);
    const verified = records.flat().some((record) => record === order.verificationToken);
    if (!verified) { res.status(400).json({ verified: false, error: `Add a TXT record at _berahost.${order.hostname} with value ${order.verificationToken}, then try again.` }); return; }
    await db.update(domainOrdersTable).set({ status: "active", verifiedAt: new Date(), updatedAt: new Date() }).where(eq(domainOrdersTable.id, order.id));
    res.json({ verified: true, message: "Domain verified and routed to your hosted web deployment." });
  } catch {
    res.status(400).json({ verified: false, error: `DNS record not found. Add a TXT record at _berahost.${order.hostname} with value ${order.verificationToken}, then try again.` });
  }
});

export default router;
