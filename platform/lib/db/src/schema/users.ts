import { pgTable, serial, varchar, integer, boolean, timestamp, text } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const usersTable = pgTable("users", {
  id: serial("id").primaryKey(),
  email: varchar("email", { length: 255 }).unique().notNull(),
  passwordHash: varchar("password_hash", { length: 255 }).notNull(),
  displayName: varchar("display_name", { length: 100 }),
  avatarUrl: text("avatar_url"),
  phone: varchar("phone", { length: 20 }),
  coins: integer("coins").default(0).notNull(),
  isVerified: boolean("is_verified").default(false).notNull(),
  isBanned: boolean("is_banned").default(false).notNull(),
  isAdmin: boolean("is_admin").default(false).notNull(),
  referralCode: varchar("referral_code", { length: 50 }).unique(),
  referredBy: integer("referred_by"),
  abuseFlag: boolean("abuse_flag").default(false).notNull(),
  abuseNote: text("abuse_note"),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
  subscriptionPlan: varchar("subscription_plan", { length: 50 }).default("free").notNull(),
  subscriptionExpiresAt: timestamp("subscription_expires_at", { withTimezone: true }),
  githubId: varchar("github_id", { length: 100 }).unique(),
  githubLogin: varchar("github_login", { length: 100 }),
  githubAvatarUrl: text("github_avatar_url"),
  githubAccessTokenEncrypted: text("github_access_token_encrypted"),
  googleId: varchar("google_id", { length: 100 }).unique(),
  googleAvatarUrl: text("google_avatar_url"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const insertUserSchema = createInsertSchema(usersTable).omit({ id: true, createdAt: true });
export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof usersTable.$inferSelect;
