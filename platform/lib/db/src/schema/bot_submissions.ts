import { pgTable, serial, integer, text, varchar, timestamp, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const botSubmissionsTable = pgTable("bot_submissions", {
  id: serial("id").primaryKey(),
  submittedBy: integer("submitted_by").notNull(),
  name: varchar("name", { length: 100 }).notNull(),
  description: text("description").notNull(),
  repoUrl: text("repo_url").notNull(),
  platform: varchar("platform", { length: 50 }).notNull(),
  sessionGuideUrl: text("session_guide_url"),
  sessionPrefix: varchar("session_prefix", { length: 100 }),
  requiredVars: jsonb("required_vars"),
  optionalVars: jsonb("optional_vars"),
  startCommand: text("start_command"),
  status: varchar("status", { length: 20 }).default("pending").notNull(),
  adminNote: text("admin_note"),
  reviewedBy: integer("reviewed_by"),
  reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const insertBotSubmissionSchema = createInsertSchema(botSubmissionsTable).omit({ id: true, createdAt: true });
export type InsertBotSubmission = z.infer<typeof insertBotSubmissionSchema>;
export type BotSubmission = typeof botSubmissionsTable.$inferSelect;
