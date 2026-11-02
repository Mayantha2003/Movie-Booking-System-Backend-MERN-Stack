import { Request, Response } from "express";
import { Booking, IBookedSeat } from "../models/booking.model";
import { Showtime } from "../models/showtime.model";
import { Food } from "../models/food.model";
import { Offer } from "../models/offer.model";
import { UserModel } from "../models/user.model";
import { generateBookingCode } from "../utils/bookingCode";
import { AuthRequest } from "../middleware/auth";
import { Types } from "mongoose";

// ===================== SEAT HELPERS =====================

// Cleans the seats sent by the client. The seatId is rebuilt from row + seatNumber on the server
// so a client cannot dodge the double-booking check by sending a different seatId for the same seat.
// Returns an error message (string) when the input is invalid.
const normalizeSeats = (input: any): IBookedSeat[] | string => {
  if (!Array.isArray(input) || input.length === 0) {
    return "Please select at least one seat!";
  }

  const seen = new Set<string>();
  const seats: IBookedSeat[] = [];

  for (const item of input) {
    const row = typeof item?.row === "string" ? item.row.trim().toUpperCase() : "";
    const seatNumber = Number(item?.seatNumber);

    if (!/^[A-Z]{1,2}$/.test(row) || !Number.isInteger(seatNumber) || seatNumber < 1) {
      return "Each seat needs a valid row (e.g. 'B') and seatNumber (e.g. 8)!";
    }

    const seatId = `${row}-${seatNumber}`;
    if (seen.has(seatId)) {
      return `Seat ${seatId} was selected more than once!`;
    }

    seen.add(seatId);
    seats.push({ row, seatNumber, seatId });
  }

  return seats;
};

// Returns the requested seatIds that already belong to an active (non-cancelled) booking
const findUnavailableSeatIds = async (
  showtimeId: Types.ObjectId,
  seatIds: string[]
): Promise<string[]> => {
  const taken = await Booking.find({
    showtime: showtimeId,
    bookingStatus: { $ne: "Cancelled" },
    "seats.seatId": { $in: seatIds },
  })
    .select("seats")
    .lean();

  const takenIds = new Set<string>();
  for (const booking of taken) {
    for (const seat of booking.seats) takenIds.add(seat.seatId);
  }

  return seatIds.filter((id) => takenIds.has(id));
};

const seatConflictMessage = (seatIds: string[]) =>
  `${seatIds.length === 1 ? "Seat" : "Seats"} ${seatIds.join(", ")} ${
    seatIds.length === 1 ? "is" : "are"
  } already booked. Please choose different seats.`;

// ===================== CREATE BOOKING (Guest + Logged-in + Food + Offer) =====================
export const createBooking = async (req: Request, res: Response) => {
  try {
    const {
      showtimeId,
      seats: rawSeats, // [{ row: "A", seatNumber: 5, seatId: "A-5" }]
      foodItems, // [{ foodId: "...", quantity: 2 }]
      offerCode, // "SAVE20"
      guestInfo, // { name, email, phone }
    } = req.body;

    // 1. Check showtime
    const showtime = await Showtime.findById(showtimeId);
    if (!showtime) {
      return res.status(404).json({ message: "Showtime not found!" });
    }

    if (!showtime.isActive) {
      return res.status(400).json({ message: "This showtime is not available!" });
    }

    // 2. Validate seats
    const seats = normalizeSeats(rawSeats);
    if (typeof seats === "string") {
      return res.status(400).json({ message: seats });
    }

    if (seats.length > showtime.availableSeats) {
      return res.status(400).json({
        message: `Only ${showtime.availableSeats} seats available!`,
      });
    }

    // 2b. Reject seats that are already booked for this showtime
    const unavailable = await findUnavailableSeatIds(
      showtime._id,
      seats.map((s) => s.seatId)
    );
    if (unavailable.length > 0) {
      return res.status(409).json({
        message: seatConflictMessage(unavailable),
        unavailableSeats: unavailable,
      });
    }

    // 3. Check logged-in or guest
    const userId = (req as AuthRequest).user?.sub || undefined;

    // A logged-in booking must point to a real account (token may outlive a deleted user)
    if (userId) {
      const userExists = Types.ObjectId.isValid(userId)
        ? await UserModel.exists({ _id: userId })
        : null;
      if (!userExists) {
        return res.status(401).json({
          message: "User account not found. Please log in again!",
        });
      }
    }

    if (!userId) {
      if (!guestInfo || !guestInfo.name || !guestInfo.email || !guestInfo.phone) {
        return res.status(400).json({
          message: "Guest name, email and phone are required!",
        });
      }
    }

    // 4. Calculate ticket amount
    const totalSeats = seats.length;
    const ticketPrice = showtime.ticketPrice;
    const ticketTotal = totalSeats * ticketPrice;

    // 5. Process Food Items
    let processedFoodItems: any[] = [];
    let foodTotal = 0;

    if (foodItems && foodItems.length > 0) {
      for (const item of foodItems) {
        const food = await Food.findById(item.foodId);

        if (!food) {
          return res.status(404).json({
            message: `Food not found: ${item.foodId}`,
          });
        }

        if (!food.isAvailable) {
          return res.status(400).json({
            message: `${food.name} is currently unavailable!`,
          });
        }

        const quantity = item.quantity || 1;
        const itemTotal = food.price * quantity;

        processedFoodItems.push({
          food: food._id,
          name: food.name,
          quantity,
          price: food.price,
        });

        foodTotal += itemTotal;
      }
    }

    // 6. Calculate subtotal (before discount)
    const subTotal = ticketTotal + foodTotal;

    // 7. Process Offer / Promo Code
    let discountAmount = 0;
    let appliedOffer: Types.ObjectId | undefined;
    let offerToCount: Types.ObjectId | undefined; // usedCount is increased only after the booking is saved

    if (offerCode) {
      const offer = await Offer.findOne({
        code: offerCode.toUpperCase(),
        isActive: true,
      });

      if (!offer) {
        return res.status(400).json({ message: "Invalid offer code!" });
      }

      const now = new Date();
      if (now < offer.validFrom || now > offer.validTo) {
        return res.status(400).json({
          message: "This offer is not valid at the moment!",
        });
      }

      if (offer.usageLimit && offer.usedCount >= offer.usageLimit) {
        return res.status(400).json({
          message: "This offer has reached its usage limit!",
        });
      }

      if (offer.minAmount && subTotal < offer.minAmount) {
        return res.status(400).json({
          message: `Minimum amount of Rs.${offer.minAmount} required for this offer!`,
        });
      }

      // Calculate discount
      if (offer.discountType === "percentage") {
        discountAmount = (subTotal * offer.discountValue) / 100;

        if (offer.maxDiscount && discountAmount > offer.maxDiscount) {
          discountAmount = offer.maxDiscount;
        }
      } else {
        discountAmount = offer.discountValue;
      }

      if (discountAmount > subTotal) {
        discountAmount = subTotal;
      }

      appliedOffer = offer._id;
      offerToCount = offer._id;
    }

    // 8. Final amount
    const finalAmount = subTotal - discountAmount;

    // 9. Generate unique booking code
    let bookingCode = generateBookingCode();
    let existing = await Booking.findOne({ bookingCode });
    while (existing) {
      bookingCode = generateBookingCode();
      existing = await Booking.findOne({ bookingCode });
    }

    // 10. Create booking
    // The unique index (showtime + seats.seatId) makes this insert atomic: if another request
    // booked the same seat a moment ago, MongoDB throws E11000 and nothing is saved.
    let booking;
    try {
      booking = await Booking.create({
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
        totalAmount: subTotal,
        foodItems: processedFoodItems,
        foodTotal,
        offer: appliedOffer,
        discountAmount,
        finalAmount,
        paymentStatus: "Pending",
        bookingStatus: "Confirmed",
      });
    } catch (err: any) {
      if (err?.code === 11000 && err?.keyPattern?.["seats.seatId"]) {
        const nowTaken = await findUnavailableSeatIds(
          showtime._id,
          seats.map((s) => s.seatId)
        );
        const ids = nowTaken.length > 0 ? nowTaken : seats.map((s) => s.seatId);
        return res.status(409).json({
          message: seatConflictMessage(ids),
          unavailableSeats: ids,
        });
      }
      throw err; // handled by the outer catch (500)
    }

    // 11. Side effects, only after the booking is safely saved
    // Atomic decrement (instead of read-modify-write) so concurrent bookings cannot overwrite each other
    await Showtime.updateOne(
      { _id: showtime._id },
      { $inc: { availableSeats: -totalSeats } }
    );

    if (offerToCount) {
      await Offer.updateOne({ _id: offerToCount }, { $inc: { usedCount: 1 } });
    }

    // 12. Return populated booking
    const populatedBooking = await Booking.findById(booking._id)
      .populate("movie", "title poster")
      .populate("cinema", "name location")
      .populate("screen", "name")
      .populate("showtime", "showDate startTime endTime")
      .populate("offer", "code description discountType discountValue");

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
      return res.status(401).json({
        message: "Please login to view your bookings!",
      });
    }

    if (!Types.ObjectId.isValid(req.user.sub)) {
      return res.status(401).json({ message: "Invalid user session!" });
    }

    const bookings = await Booking.find({ user: req.user.sub })
      .populate("movie", "title poster")
      .populate("cinema", "name location city")
      .populate("screen", "name")
      .populate("showtime", "showDate startTime endTime")
      .populate("offer", "code description")
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
      .populate("showtime", "showDate startTime endTime ticketPrice")
      .populate("offer", "code description discountType discountValue");

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
      .populate("offer", "code")
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
      return res.status(403).json({
        message: "You can only cancel your own bookings!",
      });
    }

    if (booking.bookingStatus === "Cancelled") {
      return res.status(400).json({
        message: "Booking is already cancelled!",
      });
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