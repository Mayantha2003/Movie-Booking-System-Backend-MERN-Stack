import { Router } from "express";
import {
  createCinema,
  getAllCinemas,
  getCinemaById,
  updateCinema,
  deleteCinema,
  getScreensByCinema,
} from "../controllers/cinema.controller";

import { authenticate } from "../middleware/auth";
import { restrictTo } from "../middleware/restrictTo";

const router = Router();

// Public routes
router.get("/", getAllCinemas);
router.get("/:id/screens", getScreensByCinema);
router.get("/:id", getCinemaById);

// Admin-only routes
router.post("/", authenticate, restrictTo("ADMIN"), createCinema);
router.put("/:id", authenticate, restrictTo("ADMIN"), updateCinema);
router.delete("/:id", authenticate, restrictTo("ADMIN"), deleteCinema);

export default router;