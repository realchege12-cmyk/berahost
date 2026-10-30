import bcrypt from "bcryptjs";
import crypto from "crypto";
import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
}

export async function comparePassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export function hashSessionId(sessionId: string): string {
  return crypto.createHash("sha256").update(sessionId).digest("hex");
}

export function generateReferralCode(): string {
  return crypto.randomBytes(4).toString("hex").toUpperCase();
}

export function generateApiKey(): string {
  return `bh_${crypto.randomBytes(24).toString("hex")}`;
}

export async function getUserById(id: number) {
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, id));
  return user;
}

export function serializeUser(user: typeof usersTable.$inferSelect) {
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName ?? null,
    avatarUrl: user.avatarUrl ?? null,
    phone: user.phone,
    coins: 0,
    isVerified: user.isVerified,
    isBanned: user.isBanned,
    isAdmin: user.isAdmin,
    referralCode: user.referralCode,
    subscriptionPlan: user.subscriptionPlan,
    subscriptionExpiresAt: user.subscriptionExpiresAt?.toISOString() ?? null,
    githubConnected: Boolean(user.githubId && user.githubAccessTokenEncrypted),
    githubLogin: user.githubLogin ?? null,
    githubAvatarUrl: user.githubAvatarUrl ?? null,
    googleConnected: Boolean(user.googleId),
    googleAvatarUrl: user.googleAvatarUrl ?? null,
    createdAt: user.createdAt.toISOString(),
  };
}
