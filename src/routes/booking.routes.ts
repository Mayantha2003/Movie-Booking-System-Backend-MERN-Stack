import { Router } from "express";
import {
  createBooking,
  getMyBookings,
  getBookingByCode,
  getAllBookings,
  cancelBooking,
} from "../controllers/booking.controller";

import { authenticate } from "../middleware/auth";
import { optionalAuthenticate } from "../middleware/Optionalauth";
import { restrictTo } from "../middleware/restrictTo";

const router = Router();

// Public / Guest routes
// optionalAuthenticate: guests may book, and a valid token links the booking to the logged-in user
router.post("/", optionalAuthenticate, createBooking);
router.get("/code/:code", getBookingByCode);

// Authenticated customer routes
router.get("/my-bookings", authenticate, getMyBookings);
router.put("/cancel/:id", authenticate, cancelBooking);

// Admin-only route
router.get("/", authenticate, restrictTo("ADMIN"), getAllBookings);

export default router;