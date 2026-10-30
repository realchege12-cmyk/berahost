import type { Request, Response, NextFunction } from "express";
import { getUserById } from "../lib/auth";
import { resolveApiKey } from "./requireApiKey";

declare module "express-session" {
  interface SessionData {
    userId?: number;
  }
}

export async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  if (!req.session.userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const user = await getUserById(req.session.userId);
  if (!user || user.isBanned) {
    req.session.destroy(() => {});
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  (req as any).user = user;
  next();
}

export async function requireAdmin(req: Request, res: Response, next: NextFunction): Promise<void> {
  await requireAuth(req, res, async () => {
    const user = (req as any).user;
    if (!user?.isAdmin) {
      res.status(403).json({ error: "Admin access required" });
      return;
    }
    next();
  });
}

/**
 * requireAny(scope)
 *
 * Accepts EITHER:
 *   - A valid browser session (cookie-based login), OR
 *   - A valid API key with the required scope sent as:
 *       x-api-key: bh_xxxxxxxxxxxx
 *       Authorization: Bearer bh_xxxxxxxxxxxx
 *
 * Scopes: "read" | "write" | "payments" | "admin"
 * A key with scope "admin" bypasses all scope checks.
 * A key with scope "write" also covers "read" on write endpoints (write ⊇ read).
 */
export function requireAny(scope: "read" | "write" | "payments" | "admin") {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    // ── 1. Session-based auth (browser login) ──────────────────────────────
    if (req.session.userId) {
      const user = await getUserById(req.session.userId);
      if (user && !user.isBanned) {
        (req as any).user = user;
        return next();
      }
      req.session.destroy(() => {});
    }

    // ── 2. API key auth ────────────────────────────────────────────────────
    const hasKey = req.headers["x-api-key"] || req.headers["authorization"]?.startsWith("Bearer bh_");
    if (!hasKey) {
      res.status(401).json({
        error: "Unauthorized",
        hint: "Send a session cookie or an API key via x-api-key header",
      });
      return;
    }

    const resolved = await resolveApiKey(req);
    if (!resolved) {
      res.status(401).json({ error: "Invalid or expired API key" });
      return;
    }

    const keyRow = (req as any).apiKey;
    const scopes: string[] = keyRow?.scopes ?? [];

    // scope hierarchy: admin > payments/write > read
    const allowed =
      scopes.includes("admin") ||
      scopes.includes(scope) ||
      (scope === "read" && (scopes.includes("write") || scopes.includes("payments")));

    if (!allowed) {
      res.status(403).json({
        error: `API key does not have the required scope: "${scope}"`,
        yourScopes: scopes,
        availableScopes: ["read", "write", "payments", "admin"],
      });
      return;
    }

    next();
  };
}
