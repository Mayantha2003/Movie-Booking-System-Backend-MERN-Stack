
import { Router } from "express";

import {
  register,
  login,
  getMyDetails,
  getRefreshToken,
  createAdmin,
} from "../controllers/auth.controller";

import { authenticate } from "../middleware/auth";
import { restrictTo } from "../middleware/restrictTo";
import { UserRole } from "../models/user.model";

const router = Router();

// Public routes
router.post("/register", register);
router.post("/login", login);
router.post("/refresh", getRefreshToken);

// Super Admin only
router.post(
  "/create-admin",
  authenticate,
  restrictTo(UserRole.SUPER_ADMIN),
  createAdmin
);

// Protected route
router.get("/me", authenticate, getMyDetails);

export default router;
