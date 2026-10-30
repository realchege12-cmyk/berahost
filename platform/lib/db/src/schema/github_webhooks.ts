import { pgTable, serial, integer, text, varchar, boolean, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const githubWebhooksTable = pgTable("github_webhooks", {
  id: serial("id").primaryKey(),
  deploymentId: integer("deployment_id"),
  webDeploymentId: integer("web_deployment_id"),
  userId: integer("user_id").notNull(),
  repoUrl: text("repo_url").notNull(),
  branch: varchar("branch", { length: 100 }).default("main").notNull(),
  webhookSecret: varchar("webhook_secret", { length: 100 }).notNull(),
  remoteHookId: integer("remote_hook_id"),
  isEnabled: boolean("is_enabled").default(true).notNull(),
  lastTriggeredAt: timestamp("last_triggered_at", { withTimezone: true }),
  lastCommitSha: varchar("last_commit_sha", { length: 50 }),
  lastCommitMsg: text("last_commit_msg"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const insertGithubWebhookSchema = createInsertSchema(githubWebhooksTable).omit({ id: true, createdAt: true });
export type InsertGithubWebhook = z.infer<typeof insertGithubWebhookSchema>;
export type GithubWebhook = typeof githubWebhooksTable.$inferSelect;
