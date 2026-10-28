import { Request, Response } from "express";
import { Booking } from "../models/booking.model";
import { Showtime } from "../models/showtime.model";
import { generateBookingCode } from "../utils/bookingCode";
import { AuthRequest } from "../middleware/auth";
import { UserModel } from "../models/user.model"; 

// ===================== CREATE BOOKING (Guest + Logged-in) =====================
export const createBooking = async (req: Request, res: Response) => {
  try {
    const {
      showtimeId,
      seats, // [{ row: "A", seatNumber: 5, seatId: "A-5" }, ...]
      guestInfo, // { name, email, phone } - required for guests
    } = req.body;

    // 1. Check if showtime exists
    const showtime = await Showtime.findById(showtimeId);
    if (!showtime) {
      return res.status(404).json({ message: "Showtime not found!" });
    }

    if (!showtime.isActive) {
      return res.status(400).json({ message: "This showtime is not available!" });
    }

    // 2. Validate seats
    if (!seats || seats.length === 0) {
      return res.status(400).json({ message: "Please select at least one seat!" });
    }

    if (seats.length > showtime.availableSeats) {
      return res.status(400).json({
        message: `Only ${showtime.availableSeats} seats available!`,
      });
    }

    // 3. Check if user is logged in
    const userId = (req as AuthRequest).user?.sub || null;

    // Guest must provide guestInfo
    if (!userId) {
      if (!guestInfo || !guestInfo.name || !guestInfo.email || !guestInfo.phone) {
        return res.status(400).json({
          message: "Guest name, email and phone are required!",
        });
      }
    }

    // 4. Calculate total amount
    const totalSeats = seats.length;
    const ticketPrice = showtime.ticketPrice;
    const totalAmount = totalSeats * ticketPrice;
    const finalAmount = totalAmount; // No discount for now

    // 5. Generate unique booking code
    let bookingCode = generateBookingCode();
    let existing = await Booking.findOne({ bookingCode });
    while (existing) {
      bookingCode = generateBookingCode();
      existing = await Booking.findOne({ bookingCode });
    }

    // 6. Create booking
    const booking = await Booking.create({
      bookingCode,
      user: userId,
      guestInfo: userId ? undefined : guestInfo,
      showtime: showtime._id,
      movie: showtime.movie,
      cinema: showtime.cinema,
      screen: showtime.screen,
      seats,
      totalSeats,
      ticketPrice,
      totalAmount,
      finalAmount,
      paymentStatus: "Pending",
      bookingStatus: "Confirmed",
    });

    // 7. Reduce available seats in showtime
    showtime.availableSeats -= totalSeats;
    await showtime.save();

    // 8. Return populated booking
    const populatedBooking = await Booking.findById(booking._id)
      .populate("movie", "title poster")
      .populate("cinema", "name location")
      .populate("screen", "name")
      .populate("showtime", "showDate startTime endTime");

    res.status(201).json({
      message: "Booking created successfully!",
      data: populatedBooking,
    });
  } catch (error) {
    console.error("CreateBooking Error:", error);
    res.status(500).json({ message: "Failed to create booking!" });
  }
};

// ===================== GET MY BOOKINGS (Logged-in only) =====================
export const getMyBookings = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: "Please login to view your bookings!" });
    }

    const bookings = await Booking.find({ user: req.user.sub })
      .populate("movie", "title poster")
      .populate("cinema", "name location city")
      .populate("screen", "name")
      .populate("showtime", "showDate startTime endTime")
      .sort({ createdAt: -1 });

    res.status(200).json({
      message: "Success!",
      count: bookings.length,
      data: bookings,
    });
  } catch (error) {
    console.error("GetMyBookings Error:", error);
    res.status(500).json({ message: "Failed to get bookings!" });
  }
};

// ===================== GET BOOKING BY CODE =====================
export const getBookingByCode = async (req: Request, res: Response) => {
  try {
    const booking = await Booking.findOne({
      bookingCode: (req.params.code as string).toUpperCase(),
    })
      .populate("movie", "title poster duration")
      .populate("cinema", "name location city address")
      .populate("screen", "name screenType")
      .populate("showtime", "showDate startTime endTime ticketPrice");

    if (!booking) {
      return res.status(404).json({ message: "Booking not found!" });
    }

    res.status(200).json({
      message: "Success!",
      data: booking,
    });
  } catch (error) {
    console.error("GetBookingByCode Error:", error);
    res.status(500).json({ message: "Failed to get booking!" });
  }
};

// ===================== GET ALL BOOKINGS (Admin) =====================
export const getAllBookings = async (req: Request, res: Response) => {
  try {
    const { status, paymentStatus } = req.query;

    const filter: any = {};
    if (status) filter.bookingStatus = status;
    if (paymentStatus) filter.paymentStatus = paymentStatus;

    const bookings = await Booking.find(filter)
      .populate("user", "first_name last_name email")
      .populate("movie", "title")
      .populate("cinema", "name")
      .populate("showtime", "showDate startTime")
      .sort({ createdAt: -1 });

    res.status(200).json({
      message: "Success!",
      count: bookings.length,
      data: bookings,
    });
  } catch (error) {
    console.error("GetAllBookings Error:", error);
    res.status(500).json({ message: "Failed to get bookings!" });
  }
};

// ===================== CANCEL BOOKING =====================
export const cancelBooking = async (req: AuthRequest, res: Response) => {
  try {
    const booking = await Booking.findById(req.params.id);

    if (!booking) {
      return res.status(404).json({ message: "Booking not found!" });
    }

    // Only the owner can cancel (for logged-in users)
    if (req.user && booking.user?.toString() !== req.user.sub) {
      return res.status(403).json({ message: "You can only cancel your own bookings!" });
    }

    if (booking.bookingStatus === "Cancelled") {
      return res.status(400).json({ message: "Booking is already cancelled!" });
    }

    // Release seats back to showtime
    const showtime = await Showtime.findById(booking.showtime);
    if (showtime) {
      showtime.availableSeats += booking.totalSeats;
      await showtime.save();
    }

    booking.bookingStatus = "Cancelled";
    booking.paymentStatus = "Refunded";
    await booking.save();

    res.status(200).json({
      message: "Booking cancelled successfully!",
      data: booking,
    });
  } catch (error) {
    console.error("CancelBooking Error:", error);
    res.status(500).json({ message: "Failed to cancel booking!" });
  }
};