import { NextFunction, Request, Response } from "express";

// Tiny in-memory limiter (per IP). Enough for one server instance; protects the AI quota.
export const rateLimit = (maxRequests: number, windowMs: number) => {
  const hits = new Map<string, { count: number; resetAt: number }>();

  // Drop expired entries so the map can't grow forever.
  setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of hits) if (entry.resetAt <= now) hits.delete(key);
  }, windowMs).unref();

  return (req: Request, res: Response, next: NextFunction) => {
    const key = req.ip || "unknown";
    const now = Date.now();
    const entry = hits.get(key);

    if (!entry || entry.resetAt <= now) {
      hits.set(key, { count: 1, resetAt: now + windowMs });
      return next();
    }

    if (entry.count >= maxRequests) {
      res.setHeader("Retry-After", String(Math.ceil((entry.resetAt - now) / 1000)));
      return res.status(429).json({ message: "Too many requests. Please wait a moment and try again." });
    }

    entry.count += 1;
    next();
  };
};