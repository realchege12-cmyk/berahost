import { Router } from "express";
import { db, usersTable, coinTransactionsTable, vouchersTable, voucherRedemptionsTable, dailyClaimsTable } from "@workspace/db";
import { eq, and, desc } from "drizzle-orm";
import { requireAuth, requireAny } from "../middlewares/requireAuth";
import { addCoins } from "../lib/coins";
import { sql } from "drizzle-orm";

const router = Router();

router.get("/coins/balance", requireAny("read"), async (req, res): Promise<void> => {
  const user = (req as any).user;
  const [dbUser] = await db.select().from(usersTable).where(eq(usersTable.id, user.id));

  // Check streak
  const today = new Date().toISOString().split("T")[0];
  const [todayClaim] = await db
    .select()
    .from(dailyClaimsTable)
    .where(and(eq(dailyClaimsTable.userId, user.id), eq(dailyClaimsTable.claimDate, today)));

  const [lastClaim] = await db
    .select()
    .from(dailyClaimsTable)
    .where(eq(dailyClaimsTable.userId, user.id))
    .orderBy(desc(dailyClaimsTable.claimDate))
    .limit(1);

  const streak = lastClaim?.streakDays ?? 0;

  res.json({
    coins: dbUser.coins,
    streak,
    canClaimToday: !todayClaim,
  });
});

router.get("/coins/transactions", requireAny("read"), async (req, res): Promise<void> => {
  const user = (req as any).user;
  const txns = await db
    .select()
    .from(coinTransactionsTable)
    .where(eq(coinTransactionsTable.userId, user.id))
    .orderBy(desc(coinTransactionsTable.createdAt))
    .limit(100);

  res.json(
    txns.map((t) => ({
      id: t.id,
      userId: t.userId,
      amount: t.amount,
      type: t.type,
      reference: t.reference,
      createdAt: t.createdAt.toISOString(),
    }))
  );
});

router.post("/coins/redeem", requireAny("payments"), async (req, res): Promise<void> => {
  const user = (req as any).user;
  const { code } = req.body;

  if (!code) {
    res.status(400).json({ error: "Code is required" });
    return;
  }

  const [voucher] = await db.select().from(vouchersTable).where(eq(vouchersTable.code, code.toUpperCase().trim()));
  if (!voucher) {
    res.status(400).json({ error: "Invalid voucher code" });
    return;
  }

  if (voucher.usedCount >= voucher.maxUses) {
    res.status(400).json({ error: "Voucher has reached maximum uses" });
    return;
  }

  if (voucher.expiresAt && new Date() > voucher.expiresAt) {
    res.status(400).json({ error: "Voucher has expired" });
    return;
  }

  // Check if already used
  const [alreadyUsed] = await db
    .select()
    .from(voucherRedemptionsTable)
    .where(and(eq(voucherRedemptionsTable.voucherId, voucher.id), eq(voucherRedemptionsTable.userId, user.id)));

  if (alreadyUsed) {
    res.status(400).json({ error: "You have already redeemed this voucher" });
    return;
  }

  // Redeem
  await db.transaction(async (tx) => {
    await tx
      .update(vouchersTable)
      .set({ usedCount: sql`${vouchersTable.usedCount} + 1` })
      .where(eq(vouchersTable.id, voucher.id));

    await tx.insert(voucherRedemptionsTable).values({
      voucherId: voucher.id,
      userId: user.id,
    });

    await tx
      .update(usersTable)
      .set({ coins: sql`${usersTable.coins} + ${voucher.coinValue}` })
      .where(eq(usersTable.id, user.id));

    await tx.insert(coinTransactionsTable).values({
      userId: user.id,
      amount: voucher.coinValue,
      type: "gift",
      reference: `Voucher: ${code}`,
    });
  });

  const [dbUser] = await db.select().from(usersTable).where(eq(usersTable.id, user.id));

  res.json({
    message: "Voucher redeemed successfully",
    coinsAwarded: voucher.coinValue,
    newBalance: dbUser.coins,
  });
});

router.post("/coins/daily-claim", requireAny("write"), async (req, res): Promise<void> => {
  const user = (req as any).user;
  const today = new Date().toISOString().split("T")[0];

  const [existingClaim] = await db
    .select()
    .from(dailyClaimsTable)
    .where(and(eq(dailyClaimsTable.userId, user.id), eq(dailyClaimsTable.claimDate, today)));

  if (existingClaim) {
    res.status(400).json({ error: "Already claimed today. Come back tomorrow!" });
    return;
  }

  // Calculate streak
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = yesterday.toISOString().split("T")[0];

  const [lastClaim] = await db
    .select()
    .from(dailyClaimsTable)
    .where(eq(dailyClaimsTable.userId, user.id))
    .orderBy(desc(dailyClaimsTable.claimDate))
    .limit(1);

  let streakDays = 1;
  if (lastClaim?.claimDate === yesterdayStr) {
    streakDays = (lastClaim.streakDays ?? 0) + 1;
  }

  // Coins: 2 base + streak bonus (max 10)
  const baseCoins = 2;
  const streakBonus = Math.min(streakDays - 1, 8);
  const coinsAwarded = baseCoins + streakBonus;

  await db.transaction(async (tx) => {
    await tx.insert(dailyClaimsTable).values({
      userId: user.id,
      claimDate: today,
      coinsAwarded,
      streakDays,
    });

    await tx
      .update(usersTable)
      .set({ coins: sql`${usersTable.coins} + ${coinsAwarded}` })
      .where(eq(usersTable.id, user.id));

    await tx.insert(coinTransactionsTable).values({
      userId: user.id,
      amount: coinsAwarded,
      type: "gift",
      reference: `Daily login bonus (${streakDays}-day streak)`,
    });
  });

  const [dbUser] = await db.select().from(usersTable).where(eq(usersTable.id, user.id));

  res.json({
    message: `Daily bonus claimed! ${streakDays}-day streak!`,
    coinsAwarded,
    streakDays,
    newBalance: dbUser.coins,
  });
});

export default router;
