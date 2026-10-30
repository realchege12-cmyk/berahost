import { Router } from "express";
import { db, scheduledRestartsTable, deploymentsTable, botsTable } from "@workspace/db";
import { eq, and, lte } from "drizzle-orm";
import { requireAny } from "../middlewares/requireAuth";
import { stopBotProcess, startBotProcess } from "../lib/botProcess";
import { logger } from "../lib/logger";

const router = Router();

function computeNextRestart(timeStr: string, timezone: string): Date {
  const now = new Date();
  const [hh, mm] = timeStr.split(":").map(Number);
  const next = new Date();
  next.setHours(hh, mm, 0, 0);
  if (next <= now) {
    next.setDate(next.getDate() + 1);
  }
  return next;
}

router.get("/deployments/:id/schedule", requireAny("read"), async (req, res): Promise<void> => {
  const user = (req as any).user;
  const depId = parseInt(String(req.params.id));

  const [dep] = await db.select().from(deploymentsTable).where(eq(deploymentsTable.id, depId));
  if (!dep || dep.userId !== user.id) {
    res.status(404).json({ error: "Deployment not found" });
    return;
  }

  const [schedule] = await db.select().from(scheduledRestartsTable).where(eq(scheduledRestartsTable.deploymentId, depId));
  if (!schedule) {
    res.json(null);
    return;
  }

  res.json({
    id: schedule.id,
    deploymentId: schedule.deploymentId,
    restartTime: schedule.restartTime,
    timezone: schedule.timezone,
    isEnabled: schedule.isEnabled,
    lastRestartAt: schedule.lastRestartAt?.toISOString() ?? null,
    nextRestartAt: schedule.nextRestartAt?.toISOString() ?? null,
    note: schedule.note,
  });
});

router.put("/deployments/:id/schedule", requireAny("write"), async (req, res): Promise<void> => {
  const user = (req as any).user;
  const depId = parseInt(String(req.params.id));
  const { restartTime, timezone, isEnabled, note } = req.body;

  const [dep] = await db.select().from(deploymentsTable).where(eq(deploymentsTable.id, depId));
  if (!dep || dep.userId !== user.id) {
    res.status(404).json({ error: "Deployment not found" });
    return;
  }

  if (!restartTime || !/^\d{2}:\d{2}$/.test(restartTime)) {
    res.status(400).json({ error: "restartTime must be HH:MM format (e.g. 03:00)" });
    return;
  }

  const nextRestartAt = computeNextRestart(restartTime, timezone || "Africa/Nairobi");

  const [existing] = await db.select().from(scheduledRestartsTable).where(eq(scheduledRestartsTable.deploymentId, depId));

  if (existing) {
    await db.update(scheduledRestartsTable).set({
      restartTime,
      timezone: timezone || "Africa/Nairobi",
      isEnabled: isEnabled !== false,
      nextRestartAt,
      note: note || null,
      updatedAt: new Date(),
    }).where(eq(scheduledRestartsTable.id, existing.id));
  } else {
    await db.insert(scheduledRestartsTable).values({
      deploymentId: depId,
      userId: user.id,
      restartTime,
      timezone: timezone || "Africa/Nairobi",
      isEnabled: isEnabled !== false,
      nextRestartAt,
      note: note || null,
    });
  }

  res.json({ message: "Restart schedule saved", nextRestartAt: nextRestartAt.toISOString() });
});

router.delete("/deployments/:id/schedule", requireAny("write"), async (req, res): Promise<void> => {
  const user = (req as any).user;
  const depId = parseInt(String(req.params.id));

  const [dep] = await db.select().from(deploymentsTable).where(eq(deploymentsTable.id, depId));
  if (!dep || dep.userId !== user.id) {
    res.status(404).json({ error: "Deployment not found" });
    return;
  }

  await db.delete(scheduledRestartsTable).where(eq(scheduledRestartsTable.deploymentId, depId));
  res.json({ message: "Schedule removed" });
});

export async function runScheduledRestarts(): Promise<void> {
  try {
    const now = new Date();
    const due = await db
      .select()
      .from(scheduledRestartsTable)
      .where(and(eq(scheduledRestartsTable.isEnabled, true), lte(scheduledRestartsTable.nextRestartAt, now)));

    for (const schedule of due) {
      const [dep] = await db.select().from(deploymentsTable).where(eq(deploymentsTable.id, schedule.deploymentId));
      if (!dep || dep.status !== "running") {
        const nextRestartAt = computeNextRestart(schedule.restartTime, schedule.timezone);
        await db.update(scheduledRestartsTable).set({ lastRestartAt: now, nextRestartAt }).where(eq(scheduledRestartsTable.id, schedule.id));
        continue;
      }
      const [bot] = await db.select().from(botsTable).where(eq(botsTable.id, dep.botId));
      if (!bot) continue;
      logger.info({ deploymentId: dep.id, restartTime: schedule.restartTime }, "Scheduled restart triggered");
      try {
        await stopBotProcess(dep.id);
        await new Promise((r) => setTimeout(r, 3000));
        await startBotProcess(dep.id, bot.repoUrl, (dep.envVars ?? {}) as Record<string, string>);
      } catch (err: any) {
        logger.error({ err: err.message, deploymentId: dep.id }, "Scheduled restart failed");
      }
      const nextRestartAt = computeNextRestart(schedule.restartTime, schedule.timezone);
      await db.update(scheduledRestartsTable).set({ lastRestartAt: now, nextRestartAt, updatedAt: now }).where(eq(scheduledRestartsTable.id, schedule.id));
    }
  } catch (err: any) {
    logger.error({ err: err.message }, "runScheduledRestarts error");
  }
}

export default router;
