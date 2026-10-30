import { pgTable, serial, integer, text, varchar, boolean, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const sessionBackupsTable = pgTable("session_backups", {
  id: serial("id").primaryKey(),
  deploymentId: integer("deployment_id").notNull(),
  userId: integer("user_id").notNull(),
  sessionData: text("session_data").notNull(),
  sessionLabel: varchar("session_label", { length: 100 }),
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const insertSessionBackupSchema = createInsertSchema(sessionBackupsTable).omit({ id: true, createdAt: true });
export type InsertSessionBackup = z.infer<typeof insertSessionBackupSchema>;
export type SessionBackup = typeof sessionBackupsTable.$inferSelect;
