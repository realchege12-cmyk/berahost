import { pgTable, varchar, jsonb, integer, timestamp } from "drizzle-orm/pg-core";

export const platformSettingsTable = pgTable("platform_settings", {
  key: varchar("key", { length: 100 }).primaryKey(),
  value: jsonb("value"),
  updatedBy: integer("updated_by"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export type PlatformSetting = typeof platformSettingsTable.$inferSelect;
