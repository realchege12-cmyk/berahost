import fs from "fs/promises";
import { db, usersTable, deploymentsTable, webDeploymentsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { getPlan } from "./subscriptions";

const endpoint = process.env.BERAHOST_RESOURCE_MANAGER_URL || (process.env.NODE_ENV === "production" ? "http://172.17.0.1:18765/v1" : "");
const tokenPath = process.env.BERAHOST_RESOURCE_MANAGER_TOKEN_FILE || "/etc/berahost-resource-manager.token";
let tokenCache: string | null = null;
const inFlight = new Map<number, Promise<number>>();
const cachedUsage = new Map<number, { at: number; bytes: number }>();
let bootstrapInFlight: Promise<void> | null = null;
let managerReady = false;
async function token(): Promise<string> {
  if (process.env.BERAHOST_RESOURCE_MANAGER_TOKEN) return process.env.BERAHOST_RESOURCE_MANAGER_TOKEN;
  if (!tokenCache) tokenCache = (await fs.readFile(tokenPath, "utf8")).trim();
  if (!tokenCache) throw new Error("Resource manager token is empty.");
  return tokenCache;
}
export function managerConfigured(): boolean { return Boolean(endpoint); }
export async function managerRequest(payload: Record<string, unknown>): Promise<any> {
  if (!endpoint) {
    if (process.env.NODE_ENV === "production") throw new Error("Resource manager is not configured; workload start refused.");
    return null;
  }
  const bearer = await token();
  const response = await fetch(endpoint, { method: "POST", headers: { Authorization: `Bearer ${bearer}`, "Content-Type": "application/json" }, body: JSON.stringify(payload), signal: AbortSignal.timeout(10_000) });
  if (!response.ok) throw new Error(`Resource manager request failed (${response.status}).`);
  return response.json().catch(() => null);
}
export async function bootstrapResourceManager(): Promise<void> {
  if (managerReady) return;
  if (!endpoint) {
    if (process.env.NODE_ENV === "production") throw new Error("Resource manager is not configured.");
    managerReady = true;
    return;
  }
  if (!bootstrapInFlight) {
    bootstrapInFlight = managerRequest({ action: "bootstrap" }).then(() => { managerReady = true; }).finally(() => { bootstrapInFlight = null; });
  }
  await bootstrapInFlight;
}
export async function ensureAccountCgroup(userId: number): Promise<{ ramMb: number; cpuPercent: number; storageMb: number; isAdmin: boolean }> {
  await bootstrapResourceManager();
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
  if (!user) throw new Error("Workload owner was not found.");
  const isAdmin = Boolean(user.isAdmin);
  const plan = getPlan(user.subscriptionPlan);
  if (!isAdmin) await managerRequest({ action: "ensure_user", userId, memoryBytes: plan.ramMb * 1024 * 1024, cpuPercent: plan.cpuPercent });
  return { ramMb: plan.ramMb, cpuPercent: plan.cpuPercent, storageMb: plan.storageMb, isAdmin };
}
export async function attachAccountProcess(userId: number, pid: number): Promise<void> { await managerRequest({ action: "attach", userId, pid }); }
async function du(file: string): Promise<number> {
  try { const stat = await fs.lstat(file); if (stat.isSymbolicLink()) return stat.size; if (stat.isFile()) return stat.size; if (!stat.isDirectory()) return 0;
    let total = 0; for (const entry of await fs.readdir(file)) total += await du(`${file}/${entry}`); return total;
  } catch (error: any) { if (error?.code === "ENOENT") return 0; throw error; }
}
export async function accountStorageUsageBytes(userId: number, force = false): Promise<number> {
  const running = inFlight.get(userId); if (running) return running;
  if (!force) { const cached = cachedUsage.get(userId); if (cached && Date.now() - cached.at < 10_000) return cached.bytes; }
  const scan = (async () => {
    const bots = await db.select({ id: deploymentsTable.id }).from(deploymentsTable).where(eq(deploymentsTable.userId, userId));
    const webs = await db.select({ id: webDeploymentsTable.id }).from(webDeploymentsTable).where(eq(webDeploymentsTable.userId, userId));
    let total = 0;
    for (const row of bots) total += await du(`/tmp/berahost_dep_${row.id}`);
    for (const row of webs) { const root = `/tmp/berahost_web_${row.id}`; total += await du(root); total += await du(`${root}.source.tar.gz`); }
    cachedUsage.set(userId, { at: Date.now(), bytes: total }); return total;
  })();
  inFlight.set(userId, scan); try { return await scan; } finally { inFlight.delete(userId); }
}
export async function refreshAccountQuota(userId: number): Promise<{ usedBytes: number; limitBytes: number; exceeded: boolean }> {
  const info = await ensureAccountCgroup(userId); const usedBytes = await accountStorageUsageBytes(userId, true); const limitBytes = info.storageMb * 1024 * 1024;
  return { usedBytes, limitBytes, exceeded: !info.isAdmin && usedBytes > limitBytes };
}
