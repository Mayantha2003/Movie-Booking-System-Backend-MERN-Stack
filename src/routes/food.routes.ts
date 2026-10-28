import { Router } from "express";
import {
  getAllFoods,
  getFoodById,
  createFood,
  updateFood,
  deleteFood,
  toggleFoodAvailability,
} from "../controllers/food.controller";
// import { authenticate } from "../middleware/auth";
// import { isAdmin } from "../middleware/admin";

const router = Router();

// ===================== PUBLIC ROUTES =====================
router.get("/", getAllFoods);
router.get("/:id", getFoodById);

// ===================== ADMIN ROUTES =====================
router.post("/", createFood);
router.put("/:id", updateFood);
router.delete("/:id", deleteFood);
router.patch("/:id/toggle", toggleFoodAvailability);

export default router;