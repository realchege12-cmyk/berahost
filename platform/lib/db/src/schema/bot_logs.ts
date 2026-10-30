import { pgTable, serial, integer, text, varchar, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const botLogsTable = pgTable("bot_logs", {
  id: serial("id").primaryKey(),
  deploymentId: integer("deployment_id").notNull(),
  logLine: text("log_line").notNull(),
  logType: varchar("log_type", { length: 20 }).default("stdout").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const insertBotLogSchema = createInsertSchema(botLogsTable).omit({ id: true, createdAt: true });
export type InsertBotLog = z.infer<typeof insertBotLogSchema>;
export type BotLog = typeof botLogsTable.$inferSelect;
