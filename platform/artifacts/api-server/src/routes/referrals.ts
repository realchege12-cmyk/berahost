import { Router } from "express";
import { db, usersTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { requireAny } from "../middlewares/requireAuth";
import { addCoins } from "../lib/coins";
import { logger } from "../lib/logger";
import crypto from "crypto";

const router = Router();

const REFERRER_REWARD = 20;
const REFERRED_REWARD = 10;

router.get("/referrals/my", requireAny("read"), async (req, res): Promise<void> => {
  const user = (req as any).user;
  const referralLink = `${process.env.REPLIT_DEV_DOMAIN ? `https://${process.env.REPLIT_DEV_DOMAIN}` : ""}/register?ref=${user.referralCode}`;

  const rows = await db.execute(
    sql`SELECT r.id, r.coins_awarded, r.created_at, u.email AS referred_email
        FROM referrals r
        JOIN users u ON u.id = r.referred_id
        WHERE r.referrer_id = ${user.id}
        ORDER BY r.created_at DESC
        LIMIT 50`
  );

  const totalEarned = (rows.rows as any[]).reduce((s: number, r: any) => s + Number(r.coins_awarded), 0);

  res.json({
    referralCode: user.referralCode,
    referralLink,
    referrerReward: REFERRER_REWARD,
    referredReward: REFERRED_REWARD,
    totalReferrals: rows.rows.length,
    totalCoinsEarned: totalEarned,
    referrals: (rows.rows as any[]).map((r: any) => ({
      id: r.id,
      email: r.referred_email,
      coinsAwarded: Number(r.coins_awarded),
      createdAt: r.created_at,
    })),
  });
});

router.post("/referrals/apply", requireAny("write"), async (req, res): Promise<void> => {
  const user = (req as any).user;
  const { referralCode } = req.body;

  if (!referralCode) { res.status(400).json({ error: "Referral code is required" }); return; }

  const existing = await db.execute(
    sql`SELECT id FROM referrals WHERE referred_id = ${user.id} LIMIT 1`
  );
  if ((existing.rows as any[]).length > 0) {
    res.status(400).json({ error: "You have already used a referral code" });
    return;
  }

  const [referrer] = await db.select().from(usersTable).where(eq(usersTable.referralCode, referralCode));
  if (!referrer) { res.status(404).json({ error: "Invalid referral code" }); return; }
  if (referrer.id === user.id) { res.status(400).json({ error: "You cannot refer yourself" }); return; }

  await db.execute(
    sql`INSERT INTO referrals (referrer_id, referred_id, coins_awarded) VALUES (${referrer.id}, ${user.id}, ${REFERRER_REWARD})`
  );

  await addCoins(referrer.id, REFERRER_REWARD, "referral", `Referral bonus: ${user.email} joined via your link`);
  await addCoins(user.id, REFERRED_REWARD, "referral", `Welcome bonus: referred by ${referrer.email}`);

  logger.info({ referrerId: referrer.id, referredId: user.id }, "Referral applied");
  res.json({ message: `Referral applied! You got ${REFERRED_REWARD} coins, your referrer got ${REFERRER_REWARD} coins.`, coinsAwarded: REFERRED_REWARD });
});

export default router;
