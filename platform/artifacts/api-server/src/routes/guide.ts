import { Router } from "express";
import { requireAuth } from "../middlewares/requireAuth";
import { db, deploymentsTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const router = Router();

router.post("/guide/chat", requireAuth, async (req, res): Promise<void> => {
  const user = (req as any).user;
  const { messages } = req.body;

  if (!Array.isArray(messages) || messages.length === 0) {
    res.status(400).json({ error: "messages array is required" });
    return;
  }

  const deployments = await db
    .select({
      id: deploymentsTable.id,
      status: deploymentsTable.status,
      customName: deploymentsTable.customName,
    })
    .from(deploymentsTable)
    .where(eq(deploymentsTable.userId, user.id));

  const running = deployments.filter((d) => d.status === "running");
  const crashed = deployments.filter((d) => d.status === "crashed");

  const systemPrompt = `You are BERA — the friendly AI guide built into BERAHOST, a WhatsApp and Telegram bot hosting platform. You are embedded as a floating assistant in the bottom-right corner.

BERAHOST features:
- Deploy WhatsApp/Telegram bots in seconds from the Marketplace
- Real-time logs and terminal console per deployment
- Coins economy: buy coins to pay for deployments
- Team collaboration for shared bot management
- Daily coin claims, referral rewards
- Admin panel for platform operators

Navigation: When a user wants to go somewhere, append [NAVIGATE:/path] at the end of your reply.
Available paths: /dashboard, /bots, /deployments, /coins, /settings, /support, /notifications, /referrals, /leaderboard, /teams, /subscriptions, /payments, /admin (admins only)

Current user context:
- Email: ${user.email}
- Plan: ${user.subscriptionPlan}  
- Coins balance: ${user.coins}
- Running bots: ${running.length} (${running.map((d) => d.customName ?? `#${d.id}`).join(", ") || "none"})
- Crashed bots: ${crashed.length}
- Total deployments: ${deployments.length}
- Admin: ${user.isAdmin}

Keep replies short, friendly and helpful. Use the occasional emoji. Always be proactive — if someone asks about their bots, tell them the real status above.`;

  const payload = {
    model: "gpt-4o-mini",
    messages: [{ role: "system", content: systemPrompt }, ...messages],
  };

  try {
    const upstream = await fetch("https://ch.at/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!upstream.ok) {
      res.status(502).json({ error: "AI service returned an error" });
      return;
    }

    const data = (await upstream.json()) as any;
    const content =
      data?.choices?.[0]?.message?.content ??
      "Sorry, I couldn't get a response right now. Please try again!";

    res.json({ content });
  } catch {
    res.status(502).json({ error: "AI service unavailable" });
  }
});

export default router;
