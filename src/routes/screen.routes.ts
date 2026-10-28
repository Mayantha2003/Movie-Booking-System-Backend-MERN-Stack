import { Router } from "express";
import {
  createScreen,
  getAllScreens,
  getScreenById,
  updateScreen,
  deleteScreen,
} from "../controllers/screen.controller";
//import { protect, restrictTo } from "../middleware/auth";

const router = Router();

// Public
router.get("/", getAllScreens);
router.get("/:id", getScreenById);

// Admin only
// router.post("/", protect, restrictTo("admin"), createScreen);
// router.put("/:id", protect, restrictTo("admin"), updateScreen);
// router.delete("/:id", protect, restrictTo("admin"), deleteScreen);

// Temporary without auth (testing)
router.post("/", createScreen);
router.put("/:id", updateScreen);
router.delete("/:id", deleteScreen);

export default router;