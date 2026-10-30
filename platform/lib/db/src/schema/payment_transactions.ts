import { pgTable, serial, integer, varchar, jsonb, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const paymentTransactionsTable = pgTable("payment_transactions", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  payheroTxnId: varchar("payhero_txn_id", { length: 100 }),
  phone: varchar("phone", { length: 20 }),
  amountKes: integer("amount_kes"),
  coinsAwarded: integer("coins_awarded"),
  package: varchar("package", { length: 50 }),
  status: varchar("status", { length: 20 }).default("pending").notNull(),
  callbackResponse: jsonb("callback_response"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const insertPaymentTransactionSchema = createInsertSchema(paymentTransactionsTable).omit({ id: true, createdAt: true });
export type InsertPaymentTransaction = z.infer<typeof insertPaymentTransactionSchema>;
export type PaymentTransaction = typeof paymentTransactionsTable.$inferSelect;
