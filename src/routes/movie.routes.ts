import { Router } from "express";
import {
  getNowShowing,
  getComingSoon,
  getMovieById,
  createMovie,
  updateMovie,
  deleteMovie,
  uploadMovieImage,
} from "../controllers/movie.controller";

import { authenticate } from "../middleware/auth";
import { restrictTo } from "../middleware/restrictTo";
import { uploadSingleImage } from "../middleware/upload";

const router = Router();

// Public routes
router.get("/now-showing", getNowShowing);
router.get("/coming-soon", getComingSoon);
router.get("/:id", getMovieById);

// Admin-only routes
router.post("/upload-image", authenticate, restrictTo("ADMIN"), uploadSingleImage, uploadMovieImage);
router.post("/", authenticate, restrictTo("ADMIN"), createMovie);
router.put("/:id", authenticate, restrictTo("ADMIN"), updateMovie);
router.delete("/:id", authenticate, restrictTo("ADMIN"), deleteMovie);

export default router;