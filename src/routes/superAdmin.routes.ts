import { Router } from "express";
import {
  getStats,
  getAdmins,
  updateAdminStatus,
  deleteAdmin,
} from "../controllers/superAdmin.controller";
import { authenticate } from "../middleware/auth";
import { restrictTo } from "../middleware/restrictTo";
import { UserRole } from "../models/user.model";

const router = Router();

// Every route here is Super Admin only.
router.use(authenticate, restrictTo(UserRole.SUPER_ADMIN));

router.get("/stats", getStats);
router.get("/admins", getAdmins);
router.patch("/admins/:id/status", updateAdminStatus);
router.delete("/admins/:id", deleteAdmin);

export default router;