import { Router } from "express";
import { db, supportTicketsTable, ticketMessagesTable } from "@workspace/db";
import { eq, and, desc } from "drizzle-orm";
import { requireAuth } from "../middlewares/requireAuth";

const router = Router();

function serializeTicket(t: typeof supportTicketsTable.$inferSelect) {
  return {
    id: t.id,
    userId: t.userId,
    subject: t.subject,
    status: t.status,
    priority: t.priority,
    adminReply: t.adminReply,
    createdAt: t.createdAt.toISOString(),
    closedAt: t.closedAt?.toISOString() ?? null,
  };
}

router.get("/support/tickets", requireAuth, async (req, res): Promise<void> => {
  const user = (req as any).user;
  const tickets = await db
    .select()
    .from(supportTicketsTable)
    .where(eq(supportTicketsTable.userId, user.id))
    .orderBy(desc(supportTicketsTable.createdAt));

  res.json(tickets.map(serializeTicket));
});

router.post("/support/tickets", requireAuth, async (req, res): Promise<void> => {
  const user = (req as any).user;
  const { subject, message, priority } = req.body;

  if (!subject || !message) {
    res.status(400).json({ error: "Subject and message are required" });
    return;
  }

  const [ticket] = await db
    .insert(supportTicketsTable)
    .values({
      userId: user.id,
      subject,
      priority: priority || "medium",
    })
    .returning();

  await db.insert(ticketMessagesTable).values({
    ticketId: ticket.id,
    userId: user.id,
    message,
    isAdmin: false,
  });

  res.status(201).json(serializeTicket(ticket));
});

router.get("/support/tickets/:id/messages", requireAuth, async (req, res): Promise<void> => {
  const user = (req as any).user;
  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);

  // Admins can view any ticket; regular users only their own
  const whereClause = user.isAdmin
    ? eq(supportTicketsTable.id, id)
    : and(eq(supportTicketsTable.id, id), eq(supportTicketsTable.userId, user.id));

  const [ticket] = await db.select().from(supportTicketsTable).where(whereClause);
  if (!ticket) {
    res.status(404).json({ error: "Ticket not found" });
    return;
  }

  const messages = await db
    .select()
    .from(ticketMessagesTable)
    .where(eq(ticketMessagesTable.ticketId, id))
    .orderBy(ticketMessagesTable.createdAt);

  res.json({
    ticket: serializeTicket(ticket),
    messages: messages.map((m) => ({
      id: m.id,
      ticketId: m.ticketId,
      userId: m.userId,
      message: m.message,
      isAdmin: m.isAdmin,
      createdAt: m.createdAt.toISOString(),
    })),
  });
});

router.post("/support/tickets/:id/messages", requireAuth, async (req, res): Promise<void> => {
  const user = (req as any).user;
  const id = parseInt(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id, 10);
  const { message } = req.body;

  if (!message) {
    res.status(400).json({ error: "Message is required" });
    return;
  }

  const [ticket] = await db.select().from(supportTicketsTable).where(and(eq(supportTicketsTable.id, id), eq(supportTicketsTable.userId, user.id)));
  if (!ticket) {
    res.status(404).json({ error: "Ticket not found" });
    return;
  }

  const [msg] = await db
    .insert(ticketMessagesTable)
    .values({ ticketId: id, userId: user.id, message, isAdmin: false })
    .returning();

  res.status(201).json({
    id: msg.id,
    ticketId: msg.ticketId,
    userId: msg.userId,
    message: msg.message,
    isAdmin: msg.isAdmin,
    createdAt: msg.createdAt.toISOString(),
  });
});

export { serializeTicket };
export default router;
