import { Router } from "express";
import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireAuth } from "../middlewares/requireAuth";
import { getSubscriptionPlans, getPlan, isSubscriptionActive } from "../lib/subscriptions";

const router = Router();
router.get("/subscriptions/plans", async (_req, res): Promise<void> => {
  res.json(await getSubscriptionPlans());
});
router.get("/subscriptions/status", requireAuth, async (req, res): Promise<void> => {
  const user = (req as any).user;
  const [dbUser] = await db.select().from(usersTable).where(eq(usersTable.id, user.id));
  const active = !!dbUser && isSubscriptionActive(dbUser);
  const details = (await getSubscriptionPlans()).find((plan) => plan.id === (dbUser?.subscriptionPlan || "free")) || getPlan(dbUser?.subscriptionPlan);
  res.json({ plan: details.id, planDetails: details, expiresAt: dbUser?.subscriptionExpiresAt?.toISOString() ?? null, isActive: active, billing: "monthly" });
});
router.post("/subscriptions/subscribe", requireAuth, async (_req, res): Promise<void> => {
  res.status(410).json({ error: "Use the PayHero subscription checkout from the subscription page." });
});
export default router;
