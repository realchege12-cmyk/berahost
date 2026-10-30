import { pgTable, serial, varchar, text, boolean, jsonb, timestamp, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const botsTable = pgTable("bots", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 100 }).notNull(),
  repoUrl: text("repo_url").notNull(),
  description: text("description"),
  platform: varchar("platform", { length: 50 }).notNull(),
  isFeatured: boolean("is_featured").default(false).notNull(),
  requiredVars: jsonb("required_vars"),
  optionalVars: jsonb("optional_vars"),
  sessionGuideUrl: text("session_guide_url"),
  /** Required prefix for the SESSION_ID env var, e.g. "Gifted~" or "WOLF-BOT:" */
  sessionPrefix: varchar("session_prefix", { length: 100 }),
  /**
   * JSON array of relative paths (from the bot root) to scan for SQLite settings DBs.
   * Each DB is checked for a key-value table and our env vars are injected.
   * Example: ["gift/database/database.db", "database/settings.db"]
   */
  sqliteSettingsPaths: jsonb("sqlite_settings_paths"),
  systemDeps: text("system_deps").array(),
  installPackages: text("install_packages").array(),
  startCommand: text("start_command"),
  version: integer("version").default(1).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const insertBotSchema = createInsertSchema(botsTable).omit({ id: true, createdAt: true });
export type InsertBot = z.infer<typeof insertBotSchema>;
export type Bot = typeof botsTable.$inferSelect;
