import { Router } from "express";
import {
  createBooking,
  getMyBookings,
  getBookingByCode,
  getAllBookings,
  cancelBooking,
} from "../controllers/booking.controller";

import { authenticate } from "../middleware/auth";
import { restrictTo } from "../middleware/restrictTo.ts";

const router = Router();

// Public / Guest routes
router.post("/", createBooking);
router.get("/code/:code", getBookingByCode);

// Authenticated customer routes
router.get("/my-bookings", authenticate, getMyBookings);
router.put("/cancel/:id", authenticate, cancelBooking);

// Admin-only route
router.get("/", authenticate, restrictTo("ADMIN"), getAllBookings);

export default router;