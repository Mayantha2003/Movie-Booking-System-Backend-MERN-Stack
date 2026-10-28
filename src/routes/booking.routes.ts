import { Router } from "express";
import {
  createBooking,
  getMyBookings,
  getBookingByCode,
  getAllBookings,
  cancelBooking,
} from "../controllers/booking.controller";
// import { protect } from "../middleware/auth"; // enable later

const router = Router();

// Public / Guest + Logged-in
router.post("/", createBooking);
router.get("/code/:code", getBookingByCode);

// Logged-in only
router.get("/my-bookings", getMyBookings);
router.put("/cancel/:id", cancelBooking);

// Admin
router.get("/", getAllBookings);

export default router;