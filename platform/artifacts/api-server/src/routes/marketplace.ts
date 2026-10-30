import { Router } from "express";
import { db, botSubmissionsTable, botsTable, usersTable, auditLogsTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import { requireAny, requireAuth } from "../middlewares/requireAuth";

const router = Router();

router.get("/marketplace/submissions", requireAny("read"), async (req, res): Promise<void> => {
  const user = (req as any).user;
  const submissions = await db
    .select()
    .from(botSubmissionsTable)
    .where(eq(botSubmissionsTable.submittedBy, user.id))
    .orderBy(desc(botSubmissionsTable.createdAt));

  res.json(
    submissions.map((s) => ({
      id: s.id,
      name: s.name,
      description: s.description,
      repoUrl: s.repoUrl,
      platform: s.platform,
      status: s.status,
      adminNote: s.adminNote,
      createdAt: s.createdAt.toISOString(),
    }))
  );
});

router.post("/marketplace/submit", requireAny("write"), async (req, res): Promise<void> => {
  const user = (req as any).user;
  const { name, description, repoUrl, platform, sessionGuideUrl, sessionPrefix, requiredVars, optionalVars, startCommand } = req.body;

  if (!name || !description || !repoUrl || !platform) {
    res.status(400).json({ error: "name, description, repoUrl, and platform are required" });
    return;
  }

  if (!["whatsapp", "telegram", "discord"].includes(platform)) {
    res.status(400).json({ error: "platform must be whatsapp, telegram, or discord" });
    return;
  }

  const [submission] = await db
    .insert(botSubmissionsTable)
    .values({
      submittedBy: user.id,
      name,
      description,
      repoUrl,
      platform,
      sessionGuideUrl: sessionGuideUrl || null,
      sessionPrefix: sessionPrefix || null,
      requiredVars: requiredVars || null,
      optionalVars: optionalVars || null,
      startCommand: startCommand || null,
      status: "pending",
    })
    .returning();

  res.status(201).json({
    id: submission.id,
    name: submission.name,
    status: submission.status,
    message: "Bot submitted for review. Our team will review it within 24-48 hours.",
  });
});

router.get("/admin/marketplace/submissions", requireAny("read"), async (req, res): Promise<void> => {
  const user = (req as any).user;
  if (!user.isAdmin) {
    res.status(403).json({ error: "Admin only" });
    return;
  }

  const status = req.query.status as string | undefined;
  const validStatuses = ["pending", "approved", "rejected"];

  const submissions = await db
    .select()
    .from(botSubmissionsTable)
    .where(status && validStatuses.includes(status) ? eq(botSubmissionsTable.status, status) : undefined)
    .orderBy(desc(botSubmissionsTable.createdAt));

  const result = await Promise.all(
    submissions.map(async (s) => {
      const [submitter] = await db.select({ email: usersTable.email }).from(usersTable).where(eq(usersTable.id, s.submittedBy));
      return {
        id: s.id,
        name: s.name,
        description: s.description,
        repoUrl: s.repoUrl,
        platform: s.platform,
        sessionGuideUrl: s.sessionGuideUrl,
        sessionPrefix: s.sessionPrefix,
        requiredVars: s.requiredVars,
        optionalVars: s.optionalVars,
        startCommand: s.startCommand,
        status: s.status,
        adminNote: s.adminNote,
        submittedByEmail: submitter?.email ?? "unknown",
        createdAt: s.createdAt.toISOString(),
      };
    })
  );

  res.json(result);
});

router.post("/admin/marketplace/submissions/:id/approve", requireAny("write"), async (req, res): Promise<void> => {
  const user = (req as any).user;
  if (!user.isAdmin) {
    res.status(403).json({ error: "Admin only" });
    return;
  }

  const subId = parseInt(String(req.params.id));
  const [sub] = await db.select().from(botSubmissionsTable).where(eq(botSubmissionsTable.id, subId));
  if (!sub) {
    res.status(404).json({ error: "Submission not found" });
    return;
  }

  const [bot] = await db
    .insert(botsTable)
    .values({
      name: sub.name,
      description: sub.description,
      repoUrl: sub.repoUrl,
      platform: sub.platform,
      sessionGuideUrl: sub.sessionGuideUrl,
      sessionPrefix: sub.sessionPrefix,
      requiredVars: sub.requiredVars as any,
      optionalVars: sub.optionalVars as any,
      startCommand: sub.startCommand,
      isFeatured: false,
    })
    .returning();

  await db
    .update(botSubmissionsTable)
    .set({ status: "approved", reviewedBy: user.id, reviewedAt: new Date() })
    .where(eq(botSubmissionsTable.id, subId));

  await db.insert(auditLogsTable).values({
    adminId: user.id,
    action: "approve_bot_submission",
    details: { submissionId: subId, botName: bot.name, botId: bot.id },
    ipAddress: req.ip || null,
  });

  res.json({ message: "Bot approved and added to marketplace", botId: bot.id });
});

router.post("/admin/marketplace/submissions/:id/reject", requireAny("write"), async (req, res): Promise<void> => {
  const user = (req as any).user;
  if (!user.isAdmin) {
    res.status(403).json({ error: "Admin only" });
    return;
  }

  const subId = parseInt(String(req.params.id));
  const { note } = req.body;

  await db
    .update(botSubmissionsTable)
    .set({ status: "rejected", adminNote: note || null, reviewedBy: user.id, reviewedAt: new Date() })
    .where(eq(botSubmissionsTable.id, subId));

  res.json({ message: "Submission rejected" });
});

export default router;
