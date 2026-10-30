import { Router } from "express";
import {
  createScreen,
  getAllScreens,
  getScreenById,
  updateScreen,
  deleteScreen,
} from "../controllers/screen.controller";

import { authenticate } from "../middleware/auth";
import { restrictTo } from "../middleware/restrictTo";

const router = Router();

// Public routes
router.get("/", getAllScreens);
router.get("/:id", getScreenById);

// Admin-only routes
router.post("/", authenticate, restrictTo("ADMIN"), createScreen);
router.put("/:id", authenticate, restrictTo("ADMIN"), updateScreen);
router.delete("/:id", authenticate, restrictTo("ADMIN"), deleteScreen);

export default router;