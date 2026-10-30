import { pgTable, serial, integer, varchar, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const domainOrdersTable = pgTable("domain_orders", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  webDeploymentId: integer("web_deployment_id").notNull(),
  hostname: varchar("hostname", { length: 255 }).notNull().unique(),
  priceKes: integer("price_kes").default(134).notNull(),
  status: varchar("status", { length: 20 }).default("pending").notNull(),
  verificationToken: varchar("verification_token", { length: 120 }).notNull(),
  payheroTransactionId: integer("payhero_transaction_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  verifiedAt: timestamp("verified_at", { withTimezone: true }),
  updatedAt: timestamp("updated_at", { withTimezone: true }),
});

export const insertDomainOrderSchema = createInsertSchema(domainOrdersTable).omit({ id: true, createdAt: true });
export type InsertDomainOrder = z.infer<typeof insertDomainOrderSchema>;
export type DomainOrder = typeof domainOrdersTable.$inferSelect;
