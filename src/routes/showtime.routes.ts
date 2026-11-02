import { Router } from "express";
import {
  createShowtime,
  getAllShowtimes,
  getShowtimeById,
  getShowtimesByMovie,
  getBookedSeats,
  updateShowtime,
  deleteShowtime,
} from "../controllers/showtime.controller";

import { authenticate } from "../middleware/auth";
import { restrictTo } from "../middleware/restrictTo";

const router = Router();

// Public routes
router.get("/", getAllShowtimes);
router.get("/movie/:movieId", getShowtimesByMovie);
router.get("/:id/seats", getBookedSeats);
router.get("/:id", getShowtimeById);

// Admin-only routes
router.post("/", authenticate, restrictTo("ADMIN"), createShowtime);
router.put("/:id", authenticate, restrictTo("ADMIN"), updateShowtime);
router.delete("/:id", authenticate, restrictTo("ADMIN"), deleteShowtime);

export default router;