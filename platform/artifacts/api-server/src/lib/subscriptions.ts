import { db, usersTable, platformSettingsTable } from "@workspace/db";
import { eq } from "drizzle-orm";

// Static entitlement definitions are the canonical source for all non-price plan properties.
const PLAN_ENTITLEMENTS = {
  free: { id: "free", name: "Free", maxBots: 1, maxWebApps: 0, ramMb: 256, storageMb: 500, cpuPercent: 25, customDomains: false, githubDeployment: false, environmentVariables: true, logs: true, support: "Community" },
  starter: { id: "starter", name: "Starter", maxBots: 2, maxWebApps: 1, ramMb: 512, storageMb: 2048, cpuPercent: 50, customDomains: false, githubDeployment: true, environmentVariables: true, logs: true, support: "Standard" },
  silver: { id: "silver", name: "Silver", maxBots: 5, maxWebApps: 3, ramMb: 1024, storageMb: 5120, cpuPercent: 100, customDomains: true, githubDeployment: true, environmentVariables: true, logs: true, support: "Priority" },
  gold: { id: "gold", name: "Gold", maxBots: 15, maxWebApps: 10, ramMb: 2048, storageMb: 15360, cpuPercent: 200, customDomains: true, githubDeployment: true, environmentVariables: true, logs: true, support: "Priority" },
} as const;

export const DEFAULT_SUBSCRIPTION_PLAN_PRICES = { starter: 100, silver: 300, gold: 700 } as const;
export type SubscriptionPlanId = keyof typeof DEFAULT_SUBSCRIPTION_PLAN_PRICES;
export const SUBSCRIPTION_TERM_DAYS = 30;
export const FREE_PLAN = { ...PLAN_ENTITLEMENTS.free, priceKes: 0, maxDeployments: 1, botLimit: 1, webLimit: 0, billing: "monthly", features: ["1 bot", "256 MB RAM", "500 MB storage", "25% CPU", "Community support"] } as const;

export function validateSubscriptionPlanPrices(value: unknown): value is Record<SubscriptionPlanId, number> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const v = value as Record<string, unknown>;
  return ["starter", "silver", "gold"].every((id) => Number.isSafeInteger(v[id]) && (v[id] as number) >= 1 && (v[id] as number) <= 1_000_000);
}

export async function getSubscriptionPlanPrices(): Promise<Record<SubscriptionPlanId, number>> {
  try {
    const [setting] = await db.select().from(platformSettingsTable).where(eq(platformSettingsTable.key, "subscription_plan_prices"));
    const value = typeof setting?.value === "string" ? JSON.parse(setting.value) : setting?.value;
    if (validateSubscriptionPlanPrices(value)) return { starter: value.starter, silver: value.silver, gold: value.gold };
  } catch { /* corrupt/unavailable settings safely fall back to defaults */ }
  return { ...DEFAULT_SUBSCRIPTION_PLAN_PRICES };
}

export async function getSubscriptionPlans() {
  const prices = await getSubscriptionPlanPrices();
  return (Object.keys(PLAN_ENTITLEMENTS) as Array<keyof typeof PLAN_ENTITLEMENTS>).map((id) => {
    const p = PLAN_ENTITLEMENTS[id];
    const priceKes = id === "free" ? 0 : prices[id as SubscriptionPlanId];
    return { ...p, priceKes, maxDeployments: p.maxBots + p.maxWebApps, botLimit: p.maxBots, webLimit: p.maxWebApps, billing: "monthly", features: [`${p.maxBots} bot${p.maxBots === 1 ? "" : "s"}`, `${p.maxWebApps} web app${p.maxWebApps === 1 ? "" : "s"}`, `${p.ramMb >= 1024 ? `${p.ramMb / 1024} GB` : `${p.ramMb} MB`} RAM`, `${p.storageMb >= 1024 ? `${p.storageMb / 1024} GB` : `${p.storageMb} MB`} storage`, `${p.cpuPercent}% CPU`, `Custom domains: ${p.customDomains ? "Yes" : "No"}`, `GitHub deployment: ${p.githubDeployment ? "Yes" : "No"}`, "Environment variables and logs", `${p.support} support`] };
  });
}

export function getPlan(plan: string | null | undefined) {
  const id = plan && plan in PLAN_ENTITLEMENTS ? plan as keyof typeof PLAN_ENTITLEMENTS : "free";
  const p = PLAN_ENTITLEMENTS[id];
  const priceKes = id === "free" ? 0 : DEFAULT_SUBSCRIPTION_PLAN_PRICES[id as SubscriptionPlanId];
  return { ...p, priceKes, maxDeployments: p.maxBots + p.maxWebApps, botLimit: p.maxBots, webLimit: p.maxWebApps, billing: "monthly", features: [`${p.maxBots} bot${p.maxBots === 1 ? "" : "s"}`, `${p.maxWebApps} web app${p.maxWebApps === 1 ? "" : "s"}`, `${p.ramMb >= 1024 ? `${p.ramMb / 1024} GB` : `${p.ramMb} MB`} RAM`, `${p.storageMb >= 1024 ? `${p.storageMb / 1024} GB` : `${p.storageMb} MB`} storage`, `${p.cpuPercent}% CPU`, `Custom domains: ${p.customDomains ? "Yes" : "No"}`, `GitHub deployment: ${p.githubDeployment ? "Yes" : "No"}`, "Environment variables and logs", `${p.support} support`] };
}

export function isSubscriptionActive(user: { subscriptionPlan?: string | null; subscriptionExpiresAt?: Date | null; isBanned?: boolean }) {
  return !user.isBanned && !!user.subscriptionExpiresAt && user.subscriptionExpiresAt.getTime() > Date.now() && !!user.subscriptionPlan && user.subscriptionPlan in PLAN_ENTITLEMENTS && user.subscriptionPlan !== "free";
}

export function subscriptionExpiryFrom(current: Date | null | undefined, now = new Date()) {
  const base = current && current.getTime() > now.getTime() ? current : now;
  const expiry = new Date(base);
  expiry.setUTCDate(expiry.getUTCDate() + SUBSCRIPTION_TERM_DAYS);
  return expiry;
}

export async function getUserEntitlement(userId: number) {
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
  if (!user) return null;
  return { user, plan: getPlan(user.subscriptionPlan), active: isSubscriptionActive(user) };
}
