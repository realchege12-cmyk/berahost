import { Router } from "express";
import { db, deploymentsTable, usersTable } from "@workspace/db";
import { eq, desc, and, sql } from "drizzle-orm";

const router = Router();

router.get("/leaderboard", async (_req, res): Promise<void> => {
  const runningDeps = await db
    .select()
    .from(deploymentsTable)
    .where(eq(deploymentsTable.status, "running"))
    .orderBy(desc(deploymentsTable.lastActive));

  const userMap = new Map<number, { email: string; totalBots: number; restartCount: number; deploymentIds: number[] }>();

  for (const dep of runningDeps) {
    const uid = dep.userId;
    if (!userMap.has(uid)) {
      userMap.set(uid, { email: "", totalBots: 0, restartCount: 0, deploymentIds: [] });
    }
    const entry = userMap.get(uid)!;
    entry.totalBots += 1;
    entry.restartCount += dep.restartCount;
    entry.deploymentIds.push(dep.id);
  }

  const leaderboard = [];
  for (const [userId, data] of userMap.entries()) {
    const [user] = await db.select({ email: usersTable.email }).from(usersTable).where(eq(usersTable.id, userId));
    const displayName = user?.email?.split("@")[0] ?? `user${userId}`;
    const healthScore = Math.max(0, 100 - Math.min(data.restartCount * 2, 50));
    leaderboard.push({
      userId,
      displayName,
      totalBots: data.totalBots,
      restartCount: data.restartCount,
      healthScore,
    });
  }

  leaderboard.sort((a, b) => b.healthScore - a.healthScore || b.totalBots - a.totalBots);

  res.json(leaderboard.slice(0, 50));
});

router.get("/leaderboard/my-score", async (req, res): Promise<void> => {
  const userId = (req as any).user?.id;
  if (!userId) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }

  const myDeps = await db
    .select()
    .from(deploymentsTable)
    .where(eq(deploymentsTable.userId, userId));

  const running = myDeps.filter((d) => d.status === "running").length;
  const totalRestarts = myDeps.reduce((sum, d) => sum + d.restartCount, 0);
  const healthScore = myDeps.length === 0 ? 0 : Math.max(0, 100 - Math.min(totalRestarts * 2, 50));

  res.json({
    totalDeployments: myDeps.length,
    runningBots: running,
    totalRestarts,
    healthScore,
  });
});

export default router;
