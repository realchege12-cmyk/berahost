import { db, usersTable, coinTransactionsTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { logger } from "./logger";

export async function addCoins(
  userId: number,
  amount: number,
  type: string,
  reference?: string
): Promise<void> {
  await db.transaction(async (tx) => {
    await tx
      .update(usersTable)
      .set({ coins: sql`${usersTable.coins} + ${amount}` })
      .where(eq(usersTable.id, userId));

    await tx.insert(coinTransactionsTable).values({
      userId,
      amount,
      type,
      reference: reference ?? null,
    });
  });
  logger.info({ userId, amount, type }, "Coins added");
}

export async function deductCoins(
  userId: number,
  amount: number,
  type: string,
  reference?: string
): Promise<void> {
  await db.transaction(async (tx) => {
    const [user] = await tx
      .select({ coins: usersTable.coins })
      .from(usersTable)
      .where(eq(usersTable.id, userId))
      .for("update");

    if (!user || user.coins < amount) {
      throw new Error("Insufficient coins");
    }

    await tx
      .update(usersTable)
      .set({ coins: sql`${usersTable.coins} - ${amount}` })
      .where(eq(usersTable.id, userId));

    await tx.insert(coinTransactionsTable).values({
      userId,
      amount: -amount,
      type,
      reference: reference ?? null,
    });
  });
}

// Deployment costs per platform (coins). Override via platform_settings in admin panel.
export const DEPLOYMENT_COSTS: Record<string, number> = {
  whatsapp: 10,
  "whatsapp-premium": 20,
  telegram: 8,
  discord: 10,
};

// Coin packages — affordable KES pricing for Kenyan users
export const COIN_PACKAGES: Record<string, { kes: number; coins: number; bonus: number }> = {
  starter:    { kes: 10,  coins: 15,   bonus: 0   },   // KES 10  → 15 coins
  popular:    { kes: 30,  coins: 45,   bonus: 5   },   // KES 30  → 50 coins (best value entry)
  pro:        { kes: 50,  coins: 80,   bonus: 20  },   // KES 50  → 100 coins
  business:   { kes: 150, coins: 250,  bonus: 100 },   // KES 150 → 350 coins
  enterprise: { kes: 500, coins: 900,  bonus: 400 },   // KES 500 → 1300 coins
};
