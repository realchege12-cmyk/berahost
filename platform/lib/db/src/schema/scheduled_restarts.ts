import { pgTable, serial, integer, varchar, boolean, timestamp, text } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const scheduledRestartsTable = pgTable("scheduled_restarts", {
  id: serial("id").primaryKey(),
  deploymentId: integer("deployment_id").notNull().unique(),
  userId: integer("user_id").notNull(),
  restartTime: varchar("restart_time", { length: 5 }).notNull(),
  timezone: varchar("timezone", { length: 100 }).default("Africa/Nairobi").notNull(),
  isEnabled: boolean("is_enabled").default(true).notNull(),
  lastRestartAt: timestamp("last_restart_at", { withTimezone: true }),
  nextRestartAt: timestamp("next_restart_at", { withTimezone: true }),
  note: text("note"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }),
});

export const insertScheduledRestartSchema = createInsertSchema(scheduledRestartsTable).omit({ id: true, createdAt: true });
export type InsertScheduledRestart = z.infer<typeof insertScheduledRestartSchema>;
export type ScheduledRestart = typeof scheduledRestartsTable.$inferSelect;
