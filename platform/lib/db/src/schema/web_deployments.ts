import { pgTable, serial, integer, varchar, text, jsonb, timestamp, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const webDeploymentsTable = pgTable("web_deployments", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  repoUrl: text("repo_url").notNull(),
  githubRepoId: integer("github_repo_id"),
  githubFullName: varchar("github_full_name", { length: 255 }),
  githubPrivate: boolean("github_private").default(false).notNull(),
  branch: varchar("branch", { length: 120 }).default("main").notNull(),
  customName: varchar("custom_name", { length: 100 }),
  slug: varchar("slug", { length: 80 }).unique().notNull(),
  installCommand: text("install_command"),
  buildCommand: text("build_command"),
  startCommand: text("start_command"),
  projectType: varchar("project_type", { length: 16 }),
  manifestConfig: jsonb("manifest_config"),
  detectedConfig: jsonb("detected_config"),
  envVars: jsonb("env_vars"),
  scannedVars: jsonb("scanned_vars"),
  outputDirectory: text("output_directory"),
  runtimePort: integer("runtime_port"),
  pid: integer("pid"),
  status: varchar("status", { length: 20 }).default("queued").notNull(),
  healthPath: varchar("health_path", { length: 256 }),
  healthStatus: varchar("health_status", { length: 20 }),
  lastHealthAt: timestamp("last_health_at", { withTimezone: true }),
  restartCount: integer("restart_count").default(0).notNull(),
  stopReason: varchar("stop_reason", { length: 80 }),
  lastExitCode: integer("last_exit_code"),
  currentRunId: varchar("current_run_id", { length: 64 }),
  autoDeploy: boolean("auto_deploy").default(false).notNull(),
  lastCommitSha: varchar("last_commit_sha", { length: 64 }),
  lastCommitMessage: text("last_commit_message"),
  buildLog: text("build_log"),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }),
});

export const insertWebDeploymentSchema = createInsertSchema(webDeploymentsTable).omit({ id: true, createdAt: true });
export type InsertWebDeployment = z.infer<typeof insertWebDeploymentSchema>;
export type WebDeployment = typeof webDeploymentsTable.$inferSelect;
