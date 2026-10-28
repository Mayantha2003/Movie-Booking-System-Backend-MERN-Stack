import { Router } from "express";
import {
  createShowtime,
  getAllShowtimes,
  getShowtimeById,
  getShowtimesByMovie,
  updateShowtime,
  deleteShowtime,
} from "../controllers/showtime.controller";

const router = Router();

// Public routes
router.get("/", getAllShowtimes);
router.get("/:id", getShowtimeById);
router.get("/movie/:movieId", getShowtimesByMovie);

// Temporary without auth (for testing)
router.post("/", createShowtime);
router.put("/:id", updateShowtime);
router.delete("/:id", deleteShowtime);

export default router;