import { Router } from "express";
import {
  register,
  login,
  getMyDetails,
  getRefreshToken,
} from "../controllers/auth.controller";
import { authenticate } from "../middleware/auth";

const router = Router();

// Public routes
router.post("/register", register);
router.post("/login", login);
router.post("/refresh", getRefreshToken);

// Protected route
router.get("/me", authenticate, getMyDetails);

export default router;