import { Router } from "express";
import { db, botsTable, platformSettingsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { DEPLOYMENT_COSTS } from "../lib/coins";

const router = Router();

async function getDeployCostForPlatform(platform: string): Promise<number> {
  const key = platform === "telegram" ? "deploy_cost_telegram" : "deploy_cost_whatsapp";
  const [row] = await db
    .select({ value: platformSettingsTable.value })
    .from(platformSettingsTable)
    .where(eq(platformSettingsTable.key, key));
  if (row?.value !== undefined && row.value !== null) {
    const n = parseInt(String(row.value), 10);
    if (!isNaN(n) && n >= 0) return n;
  }
  return DEPLOYMENT_COSTS[platform] ?? 10;
}

function serializeBot(bot: typeof botsTable.$inferSelect, includeRepoUrl = false, deployCost?: number) {
  return {
    id: bot.id,
    name: bot.name,
    ...(includeRepoUrl ? { repoUrl: bot.repoUrl } : {}),
    description: bot.description,
    platform: bot.platform,
    isFeatured: bot.isFeatured,
    requiredVars: bot.requiredVars,
    optionalVars: bot.optionalVars,
    sessionGuideUrl: bot.sessionGuideUrl,
    sessionPrefix: bot.sessionPrefix,
    sqliteSettingsPaths: bot.sqliteSettingsPaths,
    systemDeps: bot.systemDeps,
    startCommand: bot.startCommand,
    version: bot.version,
    deployCost: deployCost ?? null,
    createdAt: bot.createdAt.toISOString(),
  };
}

router.get("/bots", async (_req, res): Promise<void> => {
  const bots = await db.select().from(botsTable).orderBy(botsTable.createdAt);
  // Include deployCost for each bot (batch lookup by platform)
  const costs: Record<string, number> = {};
  for (const bot of bots) {
    if (!(bot.platform in costs)) {
      costs[bot.platform] = await getDeployCostForPlatform(bot.platform);
    }
  }
  res.json(bots.map((b) => serializeBot(b, false, costs[b.platform])));
});

router.get("/bots/:id", async (req, res): Promise<void> => {
  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);
  const [bot] = await db.select().from(botsTable).where(eq(botsTable.id, id));
  if (!bot) {
    res.status(404).json({ error: "Bot not found" });
    return;
  }
  const deployCost = await getDeployCostForPlatform(bot.platform);
  res.json(serializeBot(bot, false, deployCost));
});

export { serializeBot };
export default router;
