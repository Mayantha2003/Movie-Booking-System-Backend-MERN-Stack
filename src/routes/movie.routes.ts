import { Router } from "express";
import {
  getNowShowing,
  getComingSoon,
  getMovieById,
  createMovie,
  updateMovie,
  deleteMovie,
} from "../controllers/movie.controller";
// import { authenticate } from "../middleware/auth";
// import { isAdmin } from "../middleware/admin"; // later

const router = Router();

// ===================== PUBLIC ROUTES =====================
router.get("/now-showing", getNowShowing);
router.get("/coming-soon", getComingSoon);
router.get("/:id", getMovieById);

// ===================== ADMIN ROUTES =====================
// late authenticate + isAdmin middleware take
router.post("/", createMovie);
router.put("/:id", updateMovie);
router.delete("/:id", deleteMovie);

export default router;