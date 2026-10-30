import { Router } from "express";
import { db, teamsTable, teamMembersTable, usersTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { requireAny } from "../middlewares/requireAuth";
import crypto from "crypto";

const router = Router();

function generateInviteCode(): string {
  return crypto.randomBytes(6).toString("hex").toUpperCase();
}

router.get("/teams", requireAny("read"), async (req, res): Promise<void> => {
  const user = (req as any).user;

  const ownedTeams = await db.select().from(teamsTable).where(eq(teamsTable.ownerId, user.id));

  const memberships = await db.select().from(teamMembersTable).where(eq(teamMembersTable.userId, user.id));

  const memberTeamIds = memberships.map((m) => m.teamId).filter((id) => !ownedTeams.some((t) => t.id === id));

  const memberTeams = memberTeamIds.length > 0
    ? await Promise.all(memberTeamIds.map(async (teamId) => {
        const [team] = await db.select().from(teamsTable).where(eq(teamsTable.id, teamId));
        return team;
      }))
    : [];

  const all = [...ownedTeams, ...memberTeams.filter(Boolean)];

  const result = await Promise.all(
    all.map(async (team) => {
      const members = await db.select().from(teamMembersTable).where(eq(teamMembersTable.teamId, team.id));
      const memberDetails = await Promise.all(
        members.map(async (m) => {
          const [u] = await db.select({ id: usersTable.id, email: usersTable.email }).from(usersTable).where(eq(usersTable.id, m.userId));
          return { ...m, email: u?.email };
        })
      );
      return {
        id: team.id,
        name: team.name,
        ownerId: team.ownerId,
        inviteCode: team.ownerId === user.id ? team.inviteCode : undefined,
        isOwner: team.ownerId === user.id,
        members: memberDetails.map((m) => ({
          id: m.id,
          userId: m.userId,
          email: m.email,
          role: m.role,
          canDeploy: m.canDeploy,
          canViewLogs: m.canViewLogs,
          canManageBilling: m.canManageBilling,
          joinedAt: m.joinedAt.toISOString(),
        })),
        createdAt: team.createdAt.toISOString(),
      };
    })
  );

  res.json(result);
});

router.post("/teams", requireAny("write"), async (req, res): Promise<void> => {
  const user = (req as any).user;
  const { name } = req.body;

  if (!name) {
    res.status(400).json({ error: "Team name is required" });
    return;
  }

  const inviteCode = generateInviteCode();
  const [team] = await db
    .insert(teamsTable)
    .values({ name, ownerId: user.id, inviteCode })
    .returning();

  await db.insert(teamMembersTable).values({
    teamId: team.id,
    userId: user.id,
    role: "owner",
    canDeploy: true,
    canViewLogs: true,
    canManageBilling: true,
  });

  res.status(201).json({
    id: team.id,
    name: team.name,
    inviteCode: team.inviteCode,
    message: "Team created successfully",
  });
});

router.post("/teams/join", requireAny("write"), async (req, res): Promise<void> => {
  const user = (req as any).user;
  const { inviteCode } = req.body;

  if (!inviteCode) {
    res.status(400).json({ error: "Invite code is required" });
    return;
  }

  const [team] = await db.select().from(teamsTable).where(eq(teamsTable.inviteCode, inviteCode.toUpperCase()));
  if (!team) {
    res.status(404).json({ error: "Invalid invite code" });
    return;
  }

  const [existing] = await db
    .select()
    .from(teamMembersTable)
    .where(and(eq(teamMembersTable.teamId, team.id), eq(teamMembersTable.userId, user.id)));

  if (existing) {
    res.status(400).json({ error: "Already a member of this team" });
    return;
  }

  await db.insert(teamMembersTable).values({
    teamId: team.id,
    userId: user.id,
    role: "member",
    canDeploy: true,
    canViewLogs: true,
    canManageBilling: false,
  });

  res.json({ message: `Joined team "${team.name}" successfully` });
});

router.delete("/teams/:id/members/:memberId", requireAny("write"), async (req, res): Promise<void> => {
  const user = (req as any).user;
  const teamId = parseInt(String(req.params.id));
  const memberId = parseInt(String(req.params.memberId));

  const [team] = await db.select().from(teamsTable).where(eq(teamsTable.id, teamId));
  if (!team || team.ownerId !== user.id) {
    res.status(403).json({ error: "Only the team owner can remove members" });
    return;
  }

  await db.delete(teamMembersTable).where(and(eq(teamMembersTable.id, memberId), eq(teamMembersTable.teamId, teamId)));
  res.json({ message: "Member removed" });
});

router.post("/teams/:id/regenerate-invite", requireAny("write"), async (req, res): Promise<void> => {
  const user = (req as any).user;
  const teamId = parseInt(String(req.params.id));

  const [team] = await db.select().from(teamsTable).where(eq(teamsTable.id, teamId));
  if (!team || team.ownerId !== user.id) {
    res.status(403).json({ error: "Only the team owner can regenerate the invite code" });
    return;
  }

  const inviteCode = generateInviteCode();
  await db.update(teamsTable).set({ inviteCode }).where(eq(teamsTable.id, teamId));

  res.json({ inviteCode, message: "Invite code regenerated" });
});

export default router;
