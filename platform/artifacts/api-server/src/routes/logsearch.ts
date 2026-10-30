import { Router } from "express";
import { db, botLogsTable, deploymentsTable } from "@workspace/db";
import { eq, and, ilike, desc, gte } from "drizzle-orm";
import { requireAny } from "../middlewares/requireAuth";

const router = Router();

router.get("/deployments/:id/logs/search", requireAny("read"), async (req, res): Promise<void> => {
  const user = (req as any).user;
  const depId = parseInt(String(req.params.id));
  const query = (req.query.q as string) || "";
  const logType = req.query.type as string | undefined;
  const since = req.query.since as string | undefined;
  const limit = Math.min(parseInt((req.query.limit as string) || "100"), 500);

  const [dep] = await db.select().from(deploymentsTable).where(eq(deploymentsTable.id, depId));
  if (!dep || dep.userId !== user.id) {
    res.status(404).json({ error: "Deployment not found" });
    return;
  }

  const conditions: any[] = [eq(botLogsTable.deploymentId, depId)];

  if (query.trim()) {
    conditions.push(ilike(botLogsTable.logLine, `%${query.trim()}%`));
  }

  if (logType && ["stdout", "stderr", "info", "warn", "error"].includes(logType)) {
    conditions.push(eq(botLogsTable.logType, logType));
  }

  if (since) {
    const sinceDate = new Date(since);
    if (!isNaN(sinceDate.getTime())) {
      conditions.push(gte(botLogsTable.createdAt, sinceDate));
    }
  }

  const logs = await db
    .select()
    .from(botLogsTable)
    .where(and(...conditions))
    .orderBy(desc(botLogsTable.createdAt))
    .limit(limit);

  res.json({
    query,
    total: logs.length,
    logs: logs.map((l) => ({
      id: l.id,
      logLine: l.logLine,
      logType: l.logType,
      createdAt: l.createdAt.toISOString(),
    })).reverse(),
  });
});

export default router;
