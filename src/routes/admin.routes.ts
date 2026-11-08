import { Router } from "express";
import {
  getStats,
  getAllMovies,
  getAllFoods,
  getAllOffers,
  getUsers,
  createUser,
  updateUser,
  updateUserStatus,
  deleteUser,
} from "../controllers/admin.controller";
import { authenticate } from "../middleware/auth";
import { restrictTo } from "../middleware/restrictTo";
import { UserRole } from "../models/user.model";

const router = Router();

// Admin console only.
router.use(authenticate, restrictTo(UserRole.ADMIN));

router.get("/stats", getStats);
router.get("/movies", getAllMovies);
router.get("/foods", getAllFoods);
router.get("/offers", getAllOffers);

router.get("/users", getUsers);
router.post("/users", createUser);
router.put("/users/:id", updateUser);
router.patch("/users/:id/status", updateUserStatus);
router.delete("/users/:id", deleteUser);

export default router;