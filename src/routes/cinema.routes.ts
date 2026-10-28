import { Router } from "express";
import {
  createCinema,
  getAllCinemas,
  getCinemaById,
  updateCinema,
  deleteCinema,
  getScreensByCinema,
} from "../controllers/cinema.controller";
// import { protect, restrictTo } from "../middleware/auth"; // optional - adjust according to your auth middleware

const router = Router();

// Public routes
router.get("/", getAllCinemas);
router.get("/:id", getCinemaById);
router.get("/:id/screens", getScreensByCinema);

// Admin only routes (uncomment protect & restrictTo if you have auth)
// router.post("/", protect, restrictTo("admin"), createCinema);
// router.put("/:id", protect, restrictTo("admin"), updateCinema);
// router.delete("/:id", protect, restrictTo("admin"), deleteCinema);

//Temporary without auth (for testing)
router.post("/", createCinema);
router.put("/:id", updateCinema);
router.delete("/:id", deleteCinema);

export default router;