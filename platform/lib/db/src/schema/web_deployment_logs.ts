import { pgTable, serial, integer, text, varchar, timestamp, index } from "drizzle-orm/pg-core";
import { webDeploymentsTable } from "./web_deployments";

export const webDeploymentLogsTable = pgTable("web_deployment_logs", {
  id: serial("id").primaryKey(),
  deploymentId: integer("deployment_id").notNull().references(() => webDeploymentsTable.id, { onDelete: "cascade" }),
  runId: varchar("run_id", { length: 64 }).notNull(),
  stage: varchar("stage", { length: 32 }).default("system").notNull(),
  logType: varchar("log_type", { length: 20 }).default("info").notNull(),
  message: text("message").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index("web_deployment_logs_deployment_id_id_idx").on(table.deploymentId, table.id),
  index("web_deployment_logs_created_at_idx").on(table.createdAt),
]);

export type WebDeploymentLog = typeof webDeploymentLogsTable.$inferSelect;
