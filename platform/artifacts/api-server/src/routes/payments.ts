import { Router } from "express";
import crypto from "crypto";
import { db, paymentTransactionsTable, usersTable, platformSettingsTable, domainOrdersTable } from "@workspace/db";
import { eq, desc, and } from "drizzle-orm";
import { requireAny } from "../middlewares/requireAuth";
import { logger } from "../lib/logger";
import { sql } from "drizzle-orm";
import { getSubscriptionPlans, subscriptionExpiryFrom } from "../lib/subscriptions";

const router = Router();
const DOMAIN_PRICE_KES = 134;

async function getPayheroCredentials(): Promise<{ authToken: string; channelId: string } | null> {
  const authToken = process.env.PAYHERO_AUTH_TOKEN;
  const channelId = process.env.PAYHERO_CHANNEL_ID;
  if (authToken && channelId) return { authToken, channelId };
  const rows = await db.select().from(platformSettingsTable).where(sql`${platformSettingsTable.key} IN ('payhero_auth_token', 'payhero_channel_id')`);
  const map = Object.fromEntries(rows.map((r) => [r.key, String(r.value ?? "")]));
  return map.payhero_auth_token && map.payhero_channel_id ? { authToken: map.payhero_auth_token, channelId: map.payhero_channel_id } : null;
}
function callbackSig(txnId: number): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error("SESSION_SECRET must be configured for PayHero callbacks");
  return crypto.createHmac("sha256", secret).update(`BERA-PAYMENT-${txnId}`).digest("hex").slice(0, 40);
}
function normalizePhone(raw: string): string | null {
  const p = raw.replace(/[\s\-\(\)\+]/g, "");
  if (/^07\d{8}$/.test(p) || /^01\d{8}$/.test(p)) return `254${p.slice(1)}`;
  if (/^254[71]\d{8}$/.test(p)) return p;
  return null;
}
function callbackBase() { return (process.env.PUBLIC_URL || process.env.FRONTEND_URL || (process.env.REPLIT_DOMAINS ? `https://${process.env.REPLIT_DOMAINS.split(",")[0]}` : "")).replace(/\/$/, ""); }

async function createPayheroPayment(userId: number, phone: string, amountKes: number, packageName: string) {
  const creds = await getPayheroCredentials();
  if (!creds) throw new Error("Payment system not configured. Ask your admin to add PayHero credentials.");
  const [txn] = await db.insert(paymentTransactionsTable).values({ userId, phone, amountKes, coinsAwarded: 0, package: packageName, status: "pending" }).returning();
  try {
    const response = await fetch("https://backend.payhero.co.ke/api/v2/payments", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Basic ${creds.authToken.replace(/^Basic\s+/i, "")}` },
      body: JSON.stringify({ amount: amountKes, phone_number: phone, channel_id: parseInt(creds.channelId, 10), provider: "m-pesa", external_reference: `BERA-${txn.id}`, callback_url: `${callbackBase()}/api/payments/callback?sig=${callbackSig(txn.id)}` }),
    });
    const data = await response.json() as any;
    await db.update(paymentTransactionsTable).set({ status: response.ok ? "pending" : "failed", payheroTxnId: data?.reference || data?.id || String(txn.id), callbackResponse: data }).where(eq(paymentTransactionsTable.id, txn.id));
    if (!response.ok) throw new Error("PayHero rejected the payment request");
  } catch (err) {
    logger.error({ err, txnId: txn.id }, "PayHero payment request failed");
    await db.update(paymentTransactionsTable).set({ status: "failed" }).where(eq(paymentTransactionsTable.id, txn.id));
    throw err;
  }
  return txn;
}

router.get("/payments/plans", async (_req, res): Promise<void> => {
  res.json({ subscriptionPlans: (await getSubscriptionPlans()).filter((plan) => plan.id !== "free") });
});
router.post("/payments/initiate", requireAny("payments"), async (_req, res): Promise<void> => {
  res.status(410).json({ error: "Coin purchases have been removed. Choose a monthly subscription instead." });
});

router.post("/payments/subscribe", requireAny("payments"), async (req, res): Promise<void> => {
  const user = (req as any).user;
  const planId = String(req.body?.plan || "");
  const plan = planId === "starter" || planId === "silver" || planId === "gold" ? (await getSubscriptionPlans()).find((item) => item.id === planId) : undefined;
  const phone = normalizePhone(String(req.body?.phone || ""));
  if (!plan || !phone) { res.status(400).json({ error: "Choose Starter, Silver, or Gold and provide a valid Kenyan phone number." }); return; }
  try {
    const txn = await createPayheroPayment(user.id, phone, plan.priceKes, `sub:${plan.id}`);
    res.json({ message: `Payment initiated for ${plan.name}. Check your phone for the M-Pesa prompt.`, transactionId: txn.id, plan: plan.id, amountKes: plan.priceKes });
  } catch (err: any) { res.status(502).json({ error: err.message || "Unable to start PayHero payment" }); }
});

router.post("/payments/domain", requireAny("payments"), async (req, res): Promise<void> => {
  const user = (req as any).user;
  const orderId = Number(req.body?.orderId);
  const [order] = await db.select().from(domainOrdersTable).where(and(eq(domainOrdersTable.id, orderId), eq(domainOrdersTable.userId, user.id)));
  if (user.isAdmin && order?.status === "paid" && order.priceKes === 0) {
    res.json({ message: "Administrator domain enabled at no charge.", amountKes: 0, adminFree: true });
    return;
  }
  const phone = normalizePhone(String(req.body?.phone || ""));
  if (!order || order.status !== "pending" || !phone) { res.status(400).json({ error: "A pending domain order and valid Kenyan phone number are required." }); return; }
  try {
    const txn = await createPayheroPayment(user.id, phone, DOMAIN_PRICE_KES, `domain:${order.id}`);
    await db.update(domainOrdersTable).set({ payheroTransactionId: txn.id, updatedAt: new Date() }).where(eq(domainOrdersTable.id, order.id));
    res.json({ message: "Domain payment initiated. Check your phone for the M-Pesa prompt.", transactionId: txn.id, amountKes: DOMAIN_PRICE_KES });
  } catch (err: any) { res.status(502).json({ error: err.message || "Unable to start PayHero payment" }); }
});

router.post("/payments/callback", async (req, res): Promise<void> => {
  const body = req.body || {};
  const externalRef = String(body.external_reference || body.ExternalReference || "");
  const txnId = Number(externalRef.replace("BERA-", ""));
  if (!Number.isInteger(txnId) || txnId <= 0) { res.json({ message: "OK" }); return; }
  let signature = "";
  try { signature = callbackSig(txnId); } catch { res.json({ message: "OK" }); return; }
  if ((req.query.sig as string) !== signature) { res.json({ message: "OK" }); return; }
  const isSuccess = body.status === "SUCCESS" || body.ResultCode === "0" || body.Status === "Success";
  const reportedAmount = body.amount ?? body.Amount ?? body.TransAmount;
  try {
    const [txn] = await db.select().from(paymentTransactionsTable).where(eq(paymentTransactionsTable.id, txnId));
    if (!txn || txn.status !== "pending") { res.json({ message: "OK" }); return; }
    if (isSuccess && reportedAmount !== undefined && Math.round(Number(reportedAmount)) !== txn.amountKes) {
      await db.update(paymentTransactionsTable).set({ status: "failed", callbackResponse: { ...body, _fraud: "amount_mismatch" } }).where(and(eq(paymentTransactionsTable.id, txnId), eq(paymentTransactionsTable.status, "pending")));
      res.json({ message: "OK" }); return;
    }
    const [claimed] = await db.update(paymentTransactionsTable).set({ status: isSuccess ? "success" : "failed", callbackResponse: body }).where(and(eq(paymentTransactionsTable.id, txnId), eq(paymentTransactionsTable.status, "pending"))).returning();
    if (!claimed || !isSuccess) { res.json({ message: "OK" }); return; }
    if (txn.package?.startsWith("sub:")) {
      const plan = txn.package.slice(4);
      const [user] = await db.select().from(usersTable).where(eq(usersTable.id, txn.userId));
      if (user && ["starter", "silver", "gold"].includes(plan)) await db.update(usersTable).set({ subscriptionPlan: plan, subscriptionExpiresAt: subscriptionExpiryFrom(user.subscriptionExpiresAt) }).where(eq(usersTable.id, txn.userId));
    } else if (txn.package?.startsWith("domain:")) {
      const orderId = Number(txn.package.slice(7));
      await db.update(domainOrdersTable).set({ status: "paid", updatedAt: new Date() }).where(and(eq(domainOrdersTable.id, orderId), eq(domainOrdersTable.userId, txn.userId)));
    }
  } catch (err) { logger.error({ err, txnId }, "PayHero callback processing error"); }
  res.json({ message: "OK" });
});

router.get("/payments/status/:id", requireAny("read"), async (req, res): Promise<void> => {
  const user = (req as any).user; const txnId = Number(req.params.id);
  const [txn] = await db.select().from(paymentTransactionsTable).where(and(eq(paymentTransactionsTable.id, txnId), eq(paymentTransactionsTable.userId, user.id)));
  if (!txn) { res.status(404).json({ error: "Transaction not found" }); return; }
  res.json({ id: txn.id, status: txn.status, package: txn.package, amountKes: txn.amountKes });
});
router.get("/payments/history", requireAny("read"), async (req, res): Promise<void> => {
  const user = (req as any).user;
  const txns = await db.select().from(paymentTransactionsTable).where(eq(paymentTransactionsTable.userId, user.id)).orderBy(desc(paymentTransactionsTable.createdAt)).limit(50);
  res.json(txns.map((txn) => ({ id: txn.id, payheroTxnId: txn.payheroTxnId, phone: txn.phone, amountKes: txn.amountKes, package: txn.package, status: txn.status, createdAt: txn.createdAt.toISOString() })));
});
export default router;
