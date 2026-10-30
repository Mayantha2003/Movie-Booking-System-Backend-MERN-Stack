import { Router } from "express";
import {
  getNowShowing,
  getComingSoon,
  getMovieById,
  createMovie,
  updateMovie,
  deleteMovie,
} from "../controllers/movie.controller";

import { authenticate } from "../middleware/auth";
import { restrictTo } from "../middleware/restrictTo";

const router = Router();

// Public routes
router.get("/now-showing", getNowShowing);
router.get("/coming-soon", getComingSoon);
router.get("/:id", getMovieById);

// Admin-only routes
router.post("/", authenticate, restrictTo("ADMIN"), createMovie);
router.put("/:id", authenticate, restrictTo("ADMIN"), updateMovie);
router.delete("/:id", authenticate, restrictTo("ADMIN"), deleteMovie);

export default router;