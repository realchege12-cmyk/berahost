import { pgTable, serial, integer, varchar, boolean, jsonb, timestamp, text } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const deploymentsTable = pgTable("deployments", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  botId: integer("bot_id").notNull(),
  containerId: varchar("container_id", { length: 100 }),
  pid: integer("pid"),
  envVars: jsonb("env_vars"),
  sessionIdLocked: boolean("session_id_locked").default(true).notNull(),
  sessionIdHash: varchar("session_id_hash", { length: 255 }),
  status: varchar("status", { length: 20 }).default("stopped").notNull(),
  platform: varchar("platform", { length: 50 }),
  customName: varchar("custom_name", { length: 100 }),
  lastActive: timestamp("last_active", { withTimezone: true }),
  storageUsedMb: integer("storage_used_mb").default(0).notNull(),
  storageLimitMb: integer("storage_limit_mb").default(100).notNull(),
  restartCount: integer("restart_count").default(0).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }),
});

export const insertDeploymentSchema = createInsertSchema(deploymentsTable).omit({ id: true, createdAt: true });
export type InsertDeployment = z.infer<typeof insertDeploymentSchema>;
export type Deployment = typeof deploymentsTable.$inferSelect;
