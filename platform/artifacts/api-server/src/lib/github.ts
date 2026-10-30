import crypto from "crypto";
import { db, githubWebhooksTable, usersTable, webDeploymentsTable } from "@workspace/db";
import { and, eq } from "drizzle-orm";
import { logger } from "./logger";

const GITHUB_API = "https://api.github.com";
const USER_AGENT = "BERAHOST-GitHub-Integration/1.0";

export type GithubIdentity = {
  id: number;
  login: string;
  name: string | null;
  avatarUrl: string | null;
  email: string | null;
};

export type GithubRepository = {
  id: number;
  fullName: string;
  name: string;
  ownerLogin: string;
  private: boolean;
  htmlUrl: string;
  defaultBranch: string;
  description: string | null;
  updatedAt: string | null;
};

const MANAGED_PUBLIC_URL = "https://berahost-bfer3udn.manus.space";

function clientId() {
  return process.env.GITHUB_CLIENT_ID?.trim() || "";
}

function clientSecret() {
  return process.env.GITHUB_CLIENT_SECRET?.trim() || "";
}

export function githubConfigured() {
  return Boolean(clientId() && clientSecret());
}

function tokenEncryptionKey(): Buffer {
  // SESSION_SECRET is already a protected server-only value. Deriving a separate
  // AES key keeps GitHub tokens encrypted at rest without adding another user setup step.
  return crypto.createHash("sha256").update(process.env.SESSION_SECRET || "fallback-secret-change-me").digest();
}

export function encryptGithubToken(token: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", tokenEncryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(token, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return ["v1", iv.toString("base64url"), tag.toString("base64url"), ciphertext.toString("base64url")].join(".");
}

export function decryptGithubToken(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    const [version, ivText, tagText, ciphertextText] = value.split(".");
    if (version !== "v1" || !ivText || !tagText || !ciphertextText) return null;
    const decipher = crypto.createDecipheriv("aes-256-gcm", tokenEncryptionKey(), Buffer.from(ivText, "base64url"));
    decipher.setAuthTag(Buffer.from(tagText, "base64url"));
    return Buffer.concat([decipher.update(Buffer.from(ciphertextText, "base64url")), decipher.final()]).toString("utf8");
  } catch {
    return null;
  }
}

export function publicBaseUrl(request?: { protocol: string; get(name: string): string | undefined }): string {
  const configured = process.env.PUBLIC_URL || process.env.FRONTEND_URL || (process.env.REPLIT_DOMAINS ? `https://${process.env.REPLIT_DOMAINS.split(",")[0]}` : "") || MANAGED_PUBLIC_URL;
  if (configured) return configured.replace(/\/$/, "");
  if (request) return `${request.protocol}://${request.get("host") || "localhost"}`.replace(/\/$/, "");
  return "";
}

export function githubCallbackUrl(request?: { protocol: string; get(name: string): string | undefined }): string {
  return `${publicBaseUrl(request)}/api/auth/github/callback`;
}

export function managedGithubWebhookUrl(request?: { protocol: string; get(name: string): string | undefined }): string {
  return `${publicBaseUrl(request)}/api/github/webhook`;
}

function repoPath(fullName: string): string {
  const [owner, repo] = String(fullName).split("/");
  if (!owner || !repo || !/^[A-Za-z0-9_.-]+$/.test(owner) || !/^[A-Za-z0-9_.-]+$/.test(repo)) throw new Error("Invalid GitHub repository identity");
  return `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`;
}

async function githubRequest(pathname: string, token: string | undefined, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  headers.set("Accept", "application/vnd.github+json");
  headers.set("X-GitHub-Api-Version", "2022-11-28");
  headers.set("User-Agent", USER_AGENT);
  if (token) headers.set("Authorization", `Bearer ${token}`);
  const response = await fetch(`${GITHUB_API}${pathname}`, { ...init, headers });
  return response;
}

async function readGithubJson(response: Response): Promise<any> {
  const body: any = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = typeof body?.message === "string" ? body.message : `GitHub API request failed (${response.status})`;
    throw new Error(message);
  }
  return body;
}

export async function exchangeGithubCode(code: string, redirectUri: string): Promise<{ accessToken: string; scope: string }> {
  if (!githubConfigured()) throw new Error("GitHub OAuth is not configured on BERAHOST yet.");
  const response = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json", "User-Agent": USER_AGENT },
    body: JSON.stringify({ client_id: clientId(), client_secret: clientSecret(), code, redirect_uri: redirectUri }),
  });
  const body: any = await response.json().catch(() => ({}));
  if (!response.ok || !body.access_token) throw new Error(body.error_description || body.error || "GitHub authorization failed");
  return { accessToken: String(body.access_token), scope: String(body.scope || "") };
}

export async function getGithubIdentity(accessToken: string): Promise<GithubIdentity> {
  const user = await readGithubJson(await githubRequest("/user", accessToken));
  const emails = await readGithubJson(await githubRequest("/user/emails?per_page=100", accessToken)).catch(() => []);
  const verifiedEmail = Array.isArray(emails) ? emails.find((item: any) => item.primary && item.verified)?.email || emails.find((item: any) => item.verified)?.email : null;
  return { id: Number(user.id), login: String(user.login), name: user.name ? String(user.name) : null, avatarUrl: user.avatar_url ? String(user.avatar_url) : null, email: verifiedEmail || (user.email ? String(user.email) : null) };
}

export async function listGithubRepositories(accessToken: string): Promise<GithubRepository[]> {
  const result: GithubRepository[] = [];
  for (let page = 1; page <= 3; page += 1) {
    const rows = await readGithubJson(await githubRequest(`/user/repos?per_page=100&page=${page}&sort=updated&direction=desc&affiliation=owner,collaborator,organization_member`, accessToken));
    if (!Array.isArray(rows) || rows.length === 0) break;
    result.push(...rows.map((repo: any) => ({ id: Number(repo.id), fullName: String(repo.full_name), name: String(repo.name), ownerLogin: String(repo.owner?.login || ""), private: Boolean(repo.private), htmlUrl: String(repo.html_url), defaultBranch: String(repo.default_branch || "main"), description: repo.description ? String(repo.description) : null, updatedAt: repo.updated_at ? String(repo.updated_at) : null })));
    if (rows.length < 100) break;
  }
  return result;
}

export async function listGithubBranches(accessToken: string, fullName: string): Promise<string[]> {
  const rows = await readGithubJson(await githubRequest(`${repoPath(fullName)}/branches?per_page=100`, accessToken));
  return Array.isArray(rows) ? rows.map((row: any) => String(row.name)).filter(Boolean) : [];
}

export async function getGithubRepository(accessToken: string, fullName: string): Promise<GithubRepository> {
  const repo = await readGithubJson(await githubRequest(repoPath(fullName), accessToken));
  return { id: Number(repo.id), fullName: String(repo.full_name), name: String(repo.name), ownerLogin: String(repo.owner?.login || ""), private: Boolean(repo.private), htmlUrl: String(repo.html_url), defaultBranch: String(repo.default_branch || "main"), description: repo.description ? String(repo.description) : null, updatedAt: repo.updated_at ? String(repo.updated_at) : null };
}

export async function createGithubPushWebhook(accessToken: string, fullName: string, secret: string, callbackUrl: string): Promise<number> {
  const response = await githubRequest(`${repoPath(fullName)}/hooks`, accessToken, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: "web", active: true, events: ["push"], config: { url: callbackUrl, content_type: "json", insecure_ssl: "0", secret } }),
  });
  const body = await readGithubJson(response);
  return Number(body.id);
}

export async function deleteGithubWebhook(accessToken: string, fullName: string, hookId: number): Promise<void> {
  const response = await githubRequest(`${repoPath(fullName)}/hooks/${hookId}`, accessToken, { method: "DELETE" });
  if (!response.ok && response.status !== 404) await readGithubJson(response);
}

export async function revokeGithubToken(accessToken: string): Promise<void> {
  if (!githubConfigured()) return;
  const basic = Buffer.from(`${clientId()}:${clientSecret()}`).toString("base64");
  const response = await fetch(`https://api.github.com/applications/${encodeURIComponent(clientId())}/token`, { method: "DELETE", headers: { Accept: "application/vnd.github+json", Authorization: `Basic ${basic}`, "X-GitHub-Api-Version": "2022-11-28", "User-Agent": USER_AGENT, "Content-Type": "application/json" }, body: JSON.stringify({ access_token: accessToken }) });
  if (!response.ok && response.status !== 404) logger.warn({ status: response.status }, "GitHub token revocation failed");
}

function randomWebhookSecret() { return crypto.randomBytes(32).toString("hex"); }

export async function ensureWebDeploymentWebhook(webDeploymentId: number, callbackUrl: string): Promise<{ id: number; webhookId: number } | null> {
  const [deployment] = await db.select().from(webDeploymentsTable).where(eq(webDeploymentsTable.id, webDeploymentId));
  if (!deployment?.githubFullName || !deployment.autoDeploy) return null;
  const [existing] = await db.select().from(githubWebhooksTable).where(eq(githubWebhooksTable.webDeploymentId, webDeploymentId)).limit(1);
  if (existing) return { id: existing.id, webhookId: existing.id };
  const [user] = await db.select({ id: usersTable.id, githubAccessTokenEncrypted: usersTable.githubAccessTokenEncrypted }).from(usersTable).where(eq(usersTable.id, deployment.userId));
  const accessToken = decryptGithubToken(user?.githubAccessTokenEncrypted);
  if (!accessToken) throw new Error("Reconnect GitHub before enabling automatic deployment.");
  const secret = randomWebhookSecret();
  const [hook] = await db.insert(githubWebhooksTable).values({ deploymentId: null, webDeploymentId, userId: deployment.userId, repoUrl: `https://github.com/${deployment.githubFullName}.git`, branch: deployment.branch, webhookSecret: secret, isEnabled: true }).returning({ id: githubWebhooksTable.id });
  try {
    const remoteHookId = await createGithubPushWebhook(accessToken, deployment.githubFullName, secret, `${callbackUrl.replace(/\/$/, "")}/${hook.id}`);
    await db.update(githubWebhooksTable).set({ remoteHookId }).where(eq(githubWebhooksTable.id, hook.id));
    return { id: hook.id, webhookId: remoteHookId };
  } catch (error) {
    await db.delete(githubWebhooksTable).where(eq(githubWebhooksTable.id, hook.id));
    throw error;
  }
}

export async function removeWebDeploymentWebhook(webDeploymentId: number): Promise<void> {
  const [hook] = await db.select().from(githubWebhooksTable).where(eq(githubWebhooksTable.webDeploymentId, webDeploymentId)).limit(1);
  if (!hook) return;
  const [deployment] = await db.select({ githubFullName: webDeploymentsTable.githubFullName, userId: webDeploymentsTable.userId }).from(webDeploymentsTable).where(eq(webDeploymentsTable.id, webDeploymentId));
  if (deployment?.githubFullName) {
    const [user] = await db.select({ githubAccessTokenEncrypted: usersTable.githubAccessTokenEncrypted }).from(usersTable).where(eq(usersTable.id, deployment.userId));
    const accessToken = decryptGithubToken(user?.githubAccessTokenEncrypted);
    const remoteHookId = Number((hook as any).remoteHookId || 0);
    if (accessToken && remoteHookId) await deleteGithubWebhook(accessToken, deployment.githubFullName, remoteHookId).catch(() => {});
  }
  await db.delete(githubWebhooksTable).where(eq(githubWebhooksTable.id, hook.id));
}

export function githubRepoUrl(fullName: string): string {
  return `https://github.com/${fullName}.git`;
}

export function githubRepoNameFromUrl(repoUrl: string): string | null {
  const match = String(repoUrl).trim().replace(/\.git$/, "").match(/^https?:\/\/github\.com\/([^/]+\/[^/]+)$/i);
  return match ? match[1] : null;
}
