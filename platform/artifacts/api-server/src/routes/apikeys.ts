import { Router } from "express";
import { db, apiKeysTable } from "@workspace/db";
import { eq, and, desc } from "drizzle-orm";
import { requireAuth } from "../middlewares/requireAuth";
import { generateApiKey } from "../lib/auth";
import crypto from "crypto";

const router = Router();

function hashKey(key: string): string {
  return crypto.createHash("sha256").update(key).digest("hex");
}

router.get("/api-keys", requireAuth, async (req, res): Promise<void> => {
  const user = (req as any).user;
  const keys = await db
    .select()
    .from(apiKeysTable)
    .where(eq(apiKeysTable.userId, user.id))
    .orderBy(desc(apiKeysTable.createdAt));

  res.json(
    keys.map((k) => ({
      id: k.id,
      userId: k.userId,
      name: k.name,
      scopes: k.scopes,
      lastUsed: k.lastUsed?.toISOString() ?? null,
      expiresAt: k.expiresAt?.toISOString() ?? null,
      createdAt: k.createdAt.toISOString(),
    }))
  );
});

router.post("/api-keys", requireAuth, async (req, res): Promise<void> => {
  const user = (req as any).user;
  const { name, scopes, expiresAt } = req.body;

  const rawKey = generateApiKey();
  const keyHash = hashKey(rawKey);

  const [key] = await db
    .insert(apiKeysTable)
    .values({
      userId: user.id,
      keyHash,
      name: name || null,
      scopes: scopes || ["read"],
      expiresAt: expiresAt ? new Date(expiresAt) : null,
    })
    .returning();

  res.status(201).json({
    id: key.id,
    key: rawKey,
    name: key.name,
    createdAt: key.createdAt.toISOString(),
  });
});

router.delete("/api-keys/:id", requireAuth, async (req, res): Promise<void> => {
  const user = (req as any).user;
  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);

  await db.delete(apiKeysTable).where(and(eq(apiKeysTable.id, id), eq(apiKeysTable.userId, user.id)));
  res.json({ message: "API key revoked" });
});

export default router;
