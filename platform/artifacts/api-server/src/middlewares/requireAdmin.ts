import type { Request, Response, NextFunction } from "express";
import { getUserById } from "../lib/auth";

export async function requireAdmin(req: Request, res: Response, next: NextFunction): Promise<void> {
  if (!req.session.userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const user = await getUserById(req.session.userId);
  if (!user || user.isBanned) {
    req.session.destroy(() => {});
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  if (!user.isAdmin) {
    res.status(403).json({ error: "Admin access required" });
    return;
  }
  (req as any).user = user;
  next();
}
