import type { Request, Response, NextFunction } from "express";
import crypto from "crypto";
import { db, apiKeysTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { getUserById } from "../lib/auth";

function hashKey(key: string): string {
  return crypto.createHash("sha256").update(key).digest("hex");
}

function extractRawKey(req: Request): string | null {
  const header = req.headers["x-api-key"];
  if (header) return Array.isArray(header) ? header[0] : header;

  const auth = req.headers["authorization"];
  if (auth?.startsWith("Bearer bh_")) return auth.slice(7);

  return null;
}

export async function resolveApiKey(req: Request): Promise<boolean> {
  const raw = extractRawKey(req);
  if (!raw) return false;

  const keyHash = hashKey(raw);
  const [keyRow] = await db
    .select()
    .from(apiKeysTable)
    .where(eq(apiKeysTable.keyHash, keyHash))
    .limit(1);

  if (!keyRow) return false;
  if (keyRow.expiresAt && keyRow.expiresAt < new Date()) return false;

  const user = await getUserById(keyRow.userId);
  if (!user || user.isBanned) return false;

  (req as any).user = user;
  (req as any).apiKey = keyRow;

  db.update(apiKeysTable)
    .set({ lastUsed: new Date() })
    .where(eq(apiKeysTable.id, keyRow.id))
    .catch(() => {});

  return true;
}

export function requireScope(scope: string) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const resolved = await resolveApiKey(req);
    if (!resolved) {
      res.status(401).json({ error: "Invalid or missing API key" });
      return;
    }

    const keyRow = (req as any).apiKey;
    const scopes: string[] = keyRow?.scopes ?? [];

    if (!scopes.includes(scope) && !scopes.includes("admin")) {
      res.status(403).json({
        error: `API key missing required scope: "${scope}"`,
        yourScopes: scopes,
      });
      return;
    }

    next();
  };
}
