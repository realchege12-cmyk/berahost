import { pgTable, serial, integer, date, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const dailyClaimsTable = pgTable("daily_claims", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  claimDate: date("claim_date").notNull(),
  coinsAwarded: integer("coins_awarded"),
  streakDays: integer("streak_days").default(1).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const insertDailyClaimSchema = createInsertSchema(dailyClaimsTable).omit({ id: true, createdAt: true });
export type InsertDailyClaim = z.infer<typeof insertDailyClaimSchema>;
export type DailyClaim = typeof dailyClaimsTable.$inferSelect;
