import { Router } from "express";
import { db, deploymentsTable, sessionBackupsTable } from "@workspace/db";
import { eq, and, desc } from "drizzle-orm";
import { requireAny } from "../middlewares/requireAuth";
import fs from "fs";
import path from "path";

const router = Router();

function getSessionPath(deploymentId: number): string {
  return path.join(process.cwd(), "bot_sessions", String(deploymentId));
}

router.get("/deployments/:id/session-backups", requireAny("read"), async (req, res): Promise<void> => {
  const user = (req as any).user;
  const deploymentId = parseInt(String(req.params.id));

  const [dep] = await db.select().from(deploymentsTable).where(eq(deploymentsTable.id, deploymentId));
  if (!dep || dep.userId !== user.id) {
    res.status(404).json({ error: "Deployment not found" });
    return;
  }

  const backups = await db
    .select()
    .from(sessionBackupsTable)
    .where(and(eq(sessionBackupsTable.deploymentId, deploymentId), eq(sessionBackupsTable.isActive, true)))
    .orderBy(desc(sessionBackupsTable.createdAt))
    .limit(10);

  res.json(
    backups.map((b) => ({
      id: b.id,
      deploymentId: b.deploymentId,
      sessionLabel: b.sessionLabel,
      createdAt: b.createdAt.toISOString(),
    }))
  );
});

router.post("/deployments/:id/session-backups", requireAny("write"), async (req, res): Promise<void> => {
  const user = (req as any).user;
  const deploymentId = parseInt(String(req.params.id));
  const { label } = req.body;

  const [dep] = await db.select().from(deploymentsTable).where(eq(deploymentsTable.id, deploymentId));
  if (!dep || dep.userId !== user.id) {
    res.status(404).json({ error: "Deployment not found" });
    return;
  }

  const sessionDir = getSessionPath(deploymentId);
  let sessionData = "{}";
  if (fs.existsSync(sessionDir)) {
    try {
      const files = fs.readdirSync(sessionDir);
      const sessionObj: Record<string, string> = {};
      for (const file of files) {
        const fp = path.join(sessionDir, file);
        if (fs.statSync(fp).isFile()) {
          sessionObj[file] = fs.readFileSync(fp, "utf-8");
        }
      }
      sessionData = JSON.stringify(sessionObj);
    } catch (_e) {
      sessionData = "{}";
    }
  }

  const [backup] = await db
    .insert(sessionBackupsTable)
    .values({
      deploymentId,
      userId: user.id,
      sessionData,
      sessionLabel: label || `Backup ${new Date().toLocaleString("en-KE")}`,
      isActive: true,
    })
    .returning();

  res.status(201).json({
    id: backup.id,
    deploymentId: backup.deploymentId,
    sessionLabel: backup.sessionLabel,
    createdAt: backup.createdAt.toISOString(),
    message: "Session backed up successfully",
  });
});

router.post("/deployments/:id/session-backups/:backupId/restore", requireAny("write"), async (req, res): Promise<void> => {
  const user = (req as any).user;
  const deploymentId = parseInt(String(req.params.id));
  const backupId = parseInt(String(req.params.backupId));

  const [dep] = await db.select().from(deploymentsTable).where(eq(deploymentsTable.id, deploymentId));
  if (!dep || dep.userId !== user.id) {
    res.status(404).json({ error: "Deployment not found" });
    return;
  }

  const [backup] = await db
    .select()
    .from(sessionBackupsTable)
    .where(and(eq(sessionBackupsTable.id, backupId), eq(sessionBackupsTable.deploymentId, deploymentId)));
  if (!backup) {
    res.status(404).json({ error: "Backup not found" });
    return;
  }

  try {
    const sessionObj = JSON.parse(backup.sessionData) as Record<string, string>;
    const sessionDir = getSessionPath(deploymentId);
    fs.mkdirSync(sessionDir, { recursive: true });
    for (const [file, content] of Object.entries(sessionObj)) {
      const safeName = path.basename(file);
      fs.writeFileSync(path.join(sessionDir, safeName), content, "utf-8");
    }
    res.json({ message: "Session restored successfully. Restart the bot to apply." });
  } catch (e) {
    res.status(500).json({ error: "Failed to restore session" });
  }
});

router.delete("/deployments/:id/session-backups/:backupId", requireAny("write"), async (req, res): Promise<void> => {
  const user = (req as any).user;
  const deploymentId = parseInt(String(req.params.id));
  const backupId = parseInt(String(req.params.backupId));

  const [dep] = await db.select().from(deploymentsTable).where(eq(deploymentsTable.id, deploymentId));
  if (!dep || dep.userId !== user.id) {
    res.status(404).json({ error: "Deployment not found" });
    return;
  }

  await db
    .update(sessionBackupsTable)
    .set({ isActive: false })
    .where(and(eq(sessionBackupsTable.id, backupId), eq(sessionBackupsTable.deploymentId, deploymentId)));

  res.json({ message: "Backup deleted" });
});

export default router;
