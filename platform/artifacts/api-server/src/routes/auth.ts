import { Router } from "express";
import multer from "multer";
import crypto from "crypto";
import { db, usersTable, coinTransactionsTable, auditLogsTable, platformSettingsTable, otpCodesTable } from "@workspace/db";
import { eq, sql, and, gt } from "drizzle-orm";
import { hashPassword, comparePassword, generateReferralCode, serializeUser } from "../lib/auth";
import { requireAuth } from "../middlewares/requireAuth";
import { requireAdmin } from "../middlewares/requireAdmin";
import { addCoins } from "../lib/coins";
import { sendWhatsAppMessage, getWASenderStatus } from "../lib/waSender";
import { encryptGithubToken, exchangeGithubCode, getGithubIdentity, githubCallbackUrl, githubConfigured, publicBaseUrl } from "../lib/github";
import { exchangeGoogleCode, getGoogleIdentity, googleAuthorizationUrl, googleCallbackUrl, googleConfigured, googleState } from "../lib/google";

const router = Router();

const avatarUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith("image/")) cb(null, true);
    else cb(new Error("Only image files are allowed"));
  },
});

// ── OTP HELPERS ───────────────────────────────────────────────────────────────

function generateOTP(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

function formatOTPMessage(otp: string): string {
  return [
    "╔══════════════════════╗",
    "    🔐  BERAHOST OTP    ",
    "╚══════════════════════╝",
    "",
    "Your one-time code is:",
    "",
    `  *${otp}*`,
    "",
    "⏱ Expires in *10 minutes*",
    "🚫 Do not share this code",
    "",
    "_BERAHOST Bot Platform_",
  ].join("\n");
}

// POST /auth/otp/send — send registration OTP to a phone number
router.post("/auth/otp/send", async (req, res): Promise<void> => {
  const { phone } = req.body;
  if (!phone) {
    res.status(400).json({ error: "Phone number required" });
    return;
  }
  const normalized = String(phone).replace(/\D/g, "");
  if (normalized.length < 7) {
    res.status(400).json({ error: "Invalid phone number" });
    return;
  }
  if (getWASenderStatus() !== "connected") {
    res.status(503).json({ error: "Platform WhatsApp sender is not connected. Contact admin." });
    return;
  }
  const otp = generateOTP();
  await db.insert(otpCodesTable).values({
    phone: normalized,
    code: otp,
    purpose: "registration",
    expiresAt: new Date(Date.now() + 10 * 60 * 1000),
  });
  await sendWhatsAppMessage(normalized, formatOTPMessage(otp));
  res.json({ message: "OTP sent to your WhatsApp number" });
});

// POST /auth/otp/forgot-password — send password-reset OTP to saved phone
router.post("/auth/otp/forgot-password", async (req, res): Promise<void> => {
  const { email } = req.body;
  if (!email) {
    res.status(400).json({ error: "Email required" });
    return;
  }
  const [user] = await db.select().from(usersTable).where(eq(usersTable.email, email));
  if (!user || !user.phone) {
    // Ambiguous response to prevent enumeration
    res.json({ message: "If an account with that email exists and has a saved phone, an OTP has been sent." });
    return;
  }
  if (getWASenderStatus() !== "connected") {
    res.status(503).json({ error: "Platform WhatsApp sender is not connected. Contact admin." });
    return;
  }
  const otp = generateOTP();
  await db.insert(otpCodesTable).values({
    userId: user.id,
    phone: user.phone,
    code: otp,
    purpose: "password_reset",
    expiresAt: new Date(Date.now() + 10 * 60 * 1000),
  });
  await sendWhatsAppMessage(user.phone, formatOTPMessage(otp));
  res.json({ message: "OTP sent to your registered WhatsApp number" });
});

// POST /auth/otp/reset-password — reset password using OTP
router.post("/auth/otp/reset-password", async (req, res): Promise<void> => {
  const { email, otp, newPassword } = req.body;
  if (!email || !otp || !newPassword) {
    res.status(400).json({ error: "Email, OTP, and new password are required" });
    return;
  }
  if (String(newPassword).length < 6) {
    res.status(400).json({ error: "Password must be at least 6 characters" });
    return;
  }
  const [user] = await db.select().from(usersTable).where(eq(usersTable.email, email));
  if (!user) {
    res.status(400).json({ error: "Invalid OTP" });
    return;
  }
  const [otpRecord] = await db
    .select()
    .from(otpCodesTable)
    .where(
      and(
        eq(otpCodesTable.userId, user.id),
        eq(otpCodesTable.code, String(otp)),
        eq(otpCodesTable.purpose, "password_reset"),
        eq(otpCodesTable.used, false),
        gt(otpCodesTable.expiresAt, new Date()),
      ),
    );
  if (!otpRecord) {
    res.status(400).json({ error: "Invalid or expired OTP. Please request a new one." });
    return;
  }
  await db.update(otpCodesTable).set({ used: true }).where(eq(otpCodesTable.id, otpRecord.id));
  const newHash = await hashPassword(String(newPassword));
  await db.update(usersTable).set({ passwordHash: newHash }).where(eq(usersTable.id, user.id));
  res.json({ message: "Password reset successfully. Please log in." });
});

// ── REGISTER ──────────────────────────────────────────────────────────────────

router.post("/auth/register", async (req, res): Promise<void> => {
  const { email, password, phone, referralCode } = req.body;

  if (!email || !password) {
    res.status(400).json({ error: "Email and password are required" });
    return;
  }

  if (password.length < 6) {
    res.status(400).json({ error: "Password must be at least 6 characters" });
    return;
  }

  const [existing] = await db.select().from(usersTable).where(eq(usersTable.email, email));
  if (existing) {
    res.status(400).json({ error: "Email already registered" });
    return;
  }

  const passwordHash = await hashPassword(password);
  const myReferralCode = generateReferralCode();

  let referredById: number | null = null;
  if (referralCode) {
    const [referrer] = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.referralCode, referralCode));
    if (referrer) {
      referredById = referrer.id;
    }
  }

  // Read signup coins from platform settings (admin-configurable), default 10
  const [signupSetting] = await db
    .select()
    .from(platformSettingsTable)
    .where(eq(platformSettingsTable.key, "signup_coins"));
  const signupCoins = signupSetting ? Number(signupSetting.value) || 10 : 10;

  const [user] = await db
    .insert(usersTable)
    .values({
      email,
      passwordHash,
      phone: phone ?? null,
      coins: signupCoins,
      referralCode: myReferralCode,
      referredBy: referredById,
    })
    .returning();

  // Welcome bonus
  await db.insert(coinTransactionsTable).values({
    userId: user.id,
    amount: signupCoins,
    type: "gift",
    reference: "Welcome bonus",
  });

  // Referral reward
  if (referredById) {
    await addCoins(referredById, 30, "referral", `Referred ${email}`);
  }

  req.session.userId = user.id;

  res.status(201).json({ user: serializeUser(user), message: "Account created successfully" });
});

router.post("/auth/login", async (req, res): Promise<void> => {
  const { email, password } = req.body;

  if (!email || !password) {
    res.status(400).json({ error: "Email and password are required" });
    return;
  }

  const [user] = await db.select().from(usersTable).where(eq(usersTable.email, email));

  if (!user || !(await comparePassword(password, user.passwordHash))) {
    res.status(401).json({ error: "Invalid email or password" });
    return;
  }

  if (user.isBanned || user.deletedAt) {
    res.status(401).json({ error: "Account banned. Contact support." });
    return;
  }

  req.session.userId = user.id;

  res.json({ user: serializeUser(user), message: "Login successful" });
});

router.get("/auth/github", (req, res): void => {
  if (!githubConfigured()) {
    res.redirect(`${publicBaseUrl(req as any)}/login?github=unconfigured`);
    return;
  }
  const mode = String(req.query.mode || "") === "connect" && Boolean((req.session as any).userId) ? "connect" : "login";
  const returnTo = String(req.query.returnTo || (mode === "connect" ? "/web-deployments" : "/dashboard"));
  const safeReturnTo = returnTo.startsWith("/") && !returnTo.startsWith("//") ? returnTo : "/dashboard";
  const state = crypto.randomBytes(24).toString("hex");
  (req.session as any).githubOAuth = { state, mode, userId: (req.session as any).userId || null, returnTo: safeReturnTo };
  const params = new URLSearchParams({ client_id: process.env.GITHUB_CLIENT_ID || "", redirect_uri: githubCallbackUrl(req as any), scope: "repo read:user user:email", state });
  res.redirect(`https://github.com/login/oauth/authorize?${params.toString()}`);
});

router.get("/auth/github/callback", async (req, res): Promise<void> => {
  const oauth = (req.session as any).githubOAuth;
  delete (req.session as any).githubOAuth;
  if (!oauth || !req.query.state || String(req.query.state) !== oauth.state) {
    res.status(400).send("GitHub sign-in expired or was invalid. Please try again.");
    return;
  }
  try {
    const code = String(req.query.code || "");
    if (!code) throw new Error("GitHub did not return an authorization code.");
    const { accessToken } = await exchangeGithubCode(code, githubCallbackUrl(req as any));
    const identity = await getGithubIdentity(accessToken);
    const encryptedToken = encryptGithubToken(accessToken);
    let user: typeof usersTable.$inferSelect | undefined;

    if (oauth.mode === "connect" && oauth.userId) {
      [user] = await db.select().from(usersTable).where(eq(usersTable.id, Number(oauth.userId)));
      const [owned] = await db.select({ id: usersTable.id }).from(usersTable).where(eq(usersTable.githubId, String(identity.id)));
      if (owned && owned.id !== user?.id) throw new Error("This GitHub account is already connected to another BERAHOST account.");
      if (!user) throw new Error("Your BERAHOST session expired. Sign in again.");
    } else {
      [user] = await db.select().from(usersTable).where(eq(usersTable.githubId, String(identity.id)));
      if (!user && identity.email) [user] = await db.select().from(usersTable).where(eq(usersTable.email, identity.email.toLowerCase()));
      if (!user) {
        user = (await db.insert(usersTable).values({ email: (identity.email || `github-${identity.id}@users.noreply.github.com`).toLowerCase(), passwordHash: await hashPassword(crypto.randomBytes(32).toString("hex")), displayName: identity.name || identity.login, avatarUrl: identity.avatarUrl, githubId: String(identity.id), githubLogin: identity.login, githubAvatarUrl: identity.avatarUrl, githubAccessTokenEncrypted: encryptedToken, isVerified: true, subscriptionPlan: "free", coins: 0, referralCode: generateReferralCode() }).returning())[0];
      }
    }

    if (!user) throw new Error("Could not create or find your BERAHOST account.");
    [user] = await db.update(usersTable).set({ githubId: String(identity.id), githubLogin: identity.login, githubAvatarUrl: identity.avatarUrl, githubAccessTokenEncrypted: encryptedToken, isVerified: true, ...(user.displayName ? {} : { displayName: identity.name || identity.login }), ...(user.avatarUrl ? {} : { avatarUrl: identity.avatarUrl }) }).where(eq(usersTable.id, user.id)).returning();
    (req.session as any).userId = user.id;
    const separator = oauth.returnTo.includes("?") ? "&" : "?";
    res.redirect(`${publicBaseUrl(req as any)}${oauth.returnTo}${separator}github=connected`);
  } catch (error: any) {
    const message = encodeURIComponent(error?.message || "GitHub sign-in failed");
    res.redirect(`${publicBaseUrl(req as any)}/login?github=error&message=${message}`);
  }
});

router.get("/auth/google", (req, res): void => {
  if (!googleConfigured()) {
    res.redirect(`${publicBaseUrl(req as any)}/login?google=unconfigured`);
    return;
  }
  const returnTo = String(req.query.returnTo || "/dashboard");
  const safeReturnTo = returnTo.startsWith("/") && !returnTo.startsWith("//") ? returnTo : "/dashboard";
  const state = googleState();
  (req.session as any).googleOAuth = { state, returnTo: safeReturnTo };
  res.redirect(googleAuthorizationUrl(state, googleCallbackUrl(req as any)));
});

router.get("/auth/google/callback", async (req, res): Promise<void> => {
  const oauth = (req.session as any).googleOAuth;
  delete (req.session as any).googleOAuth;
  if (!oauth || !req.query.state || String(req.query.state) !== oauth.state) {
    res.status(400).send("Google sign-in expired or was invalid. Please try again.");
    return;
  }
  try {
    const code = String(req.query.code || "");
    if (!code) throw new Error("Google did not return an authorization code.");
    const accessToken = await exchangeGoogleCode(code, googleCallbackUrl(req as any));
    const identity = await getGoogleIdentity(accessToken);
    if (!identity.emailVerified) throw new Error("Google returned an unverified email address.");
    let [user] = await db.select().from(usersTable).where(eq(usersTable.googleId, identity.id));
    if (!user) [user] = await db.select().from(usersTable).where(eq(usersTable.email, identity.email));
    if (!user) {
      [user] = await db.insert(usersTable).values({ email: identity.email, passwordHash: await hashPassword(crypto.randomBytes(32).toString("hex")), displayName: identity.name, avatarUrl: identity.avatarUrl, googleId: identity.id, googleAvatarUrl: identity.avatarUrl, isVerified: true, subscriptionPlan: "free", coins: 0, referralCode: generateReferralCode() }).returning();
    } else if (user.isBanned || user.deletedAt) {
      throw new Error("Account banned. Contact support.");
    }
    [user] = await db.update(usersTable).set({ googleId: identity.id, googleAvatarUrl: identity.avatarUrl, isVerified: true, ...(user.displayName ? {} : { displayName: identity.name }), ...(user.avatarUrl ? {} : { avatarUrl: identity.avatarUrl }) }).where(eq(usersTable.id, user.id)).returning();
    (req.session as any).userId = user.id;
    const separator = oauth.returnTo.includes("?") ? "&" : "?";
    res.redirect(`${publicBaseUrl(req as any)}${oauth.returnTo}${separator}google=connected`);
  } catch (error: any) {
    const message = encodeURIComponent(error?.message || "Google sign-in failed");
    res.redirect(`${publicBaseUrl(req as any)}/login?google=error&message=${message}`);
  }
});

router.get("/auth/me", requireAuth, async (req, res): Promise<void> => {
  const user = (req as any).user;
  res.json(serializeUser(user));
});

router.put("/auth/profile", requireAuth, async (req, res): Promise<void> => {
  const userId = (req as any).user.id as number;
  const { displayName, avatarUrl, phone } = req.body;

  const updates: Record<string, unknown> = {};
  if (displayName !== undefined) {
    if (typeof displayName !== "string" || displayName.length > 100) {
      res.status(400).json({ error: "Display name must be a string under 100 characters" });
      return;
    }
    updates.displayName = displayName.trim() || null;
  }
  if (avatarUrl !== undefined) {
    updates.avatarUrl = typeof avatarUrl === "string" && avatarUrl.trim() ? avatarUrl.trim() : null;
  }
  if (phone !== undefined) {
    updates.phone = typeof phone === "string" && phone.trim() ? phone.trim() : null;
  }

  if (Object.keys(updates).length === 0) {
    res.status(400).json({ error: "No fields to update" });
    return;
  }

  const [updated] = await db
    .update(usersTable)
    .set(updates)
    .where(eq(usersTable.id, userId))
    .returning();

  res.json({ user: serializeUser(updated), message: "Profile updated" });
});

router.post("/auth/change-password", requireAuth, async (req, res): Promise<void> => {
  const userId = (req as any).user.id as number;
  const { currentPassword, newPassword } = req.body;

  if (!currentPassword || !newPassword) {
    res.status(400).json({ error: "Current password and new password are required" });
    return;
  }
  if (newPassword.length < 6) {
    res.status(400).json({ error: "New password must be at least 6 characters" });
    return;
  }

  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  const valid = await comparePassword(currentPassword, user.passwordHash);
  if (!valid) {
    res.status(401).json({ error: "Current password is incorrect" });
    return;
  }

  const newHash = await hashPassword(newPassword);
  await db.update(usersTable).set({ passwordHash: newHash }).where(eq(usersTable.id, userId));

  res.json({ message: "Password changed successfully" });
});

router.post("/auth/logout", async (req, res): Promise<void> => {
  req.session.destroy(() => {});
  res.json({ message: "Logged out" });
});

router.post(
  "/auth/upload-avatar",
  requireAuth,
  avatarUpload.single("avatar"),
  async (req, res): Promise<void> => {
    const userId = (req as any).user.id as number;
    const file = (req as any).file as Express.Multer.File | undefined;

    if (!file) {
      res.status(400).json({ error: "No image file provided" });
      return;
    }

    const mime = file.mimetype;
    const b64 = file.buffer.toString("base64");
    const dataUrl = `data:${mime};base64,${b64}`;

    const [updated] = await db
      .update(usersTable)
      .set({ avatarUrl: dataUrl })
      .where(eq(usersTable.id, userId))
      .returning();

    res.json({ user: serializeUser(updated), message: "Avatar updated" });
  },
);

router.post("/auth/admin/set-password", requireAuth, requireAdmin, async (req, res): Promise<void> => {
  const adminUser = (req as any).user;
  const { newPassword } = req.body;

  if (!newPassword || newPassword.length < 6) {
    res.status(400).json({ error: "Password must be at least 6 characters" });
    return;
  }

  const newHash = await hashPassword(newPassword);
  await db.update(usersTable).set({ passwordHash: newHash }).where(eq(usersTable.id, adminUser.id));

  await db.insert(auditLogsTable).values({
    adminId: adminUser.id,
    action: "admin_set_own_password",
    details: {},
    ipAddress: req.ip || null,
  });

  res.json({ message: "Password updated successfully" });
});

export default router;
