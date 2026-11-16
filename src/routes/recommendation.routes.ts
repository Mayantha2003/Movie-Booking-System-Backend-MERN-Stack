import { Router } from "express";
import { getTrendingPicks } from "../controllers/recommendation.controller";
import { rateLimit } from "../middleware/rateLimit";

const router = Router();

// Public (guests too). Result is cached server-side; the limiter just stops abuse.
router.get("/trending", rateLimit(30, 60_000), getTrendingPicks);

export default router;