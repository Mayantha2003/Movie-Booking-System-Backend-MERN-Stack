import { Router } from "express";
import {
  getAllFoods,
  getFoodById,
  createFood,
  updateFood,
  deleteFood,
  toggleFoodAvailability,
} from "../controllers/food.controller";

import { authenticate } from "../middleware/auth";
import { restrictTo } from "../middleware/restrictTo.ts";

const router = Router();

// Public routes
router.get("/", getAllFoods);
router.get("/:id", getFoodById);

// Admin-only routes
router.post("/", authenticate, restrictTo("ADMIN"), createFood);
router.put("/:id", authenticate, restrictTo("ADMIN"), updateFood);
router.delete("/:id", authenticate, restrictTo("ADMIN"), deleteFood);
router.patch(
  "/:id/toggle",
  authenticate,
  restrictTo("ADMIN"),
  toggleFoodAvailability
);

export default router;