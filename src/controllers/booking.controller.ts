import { Request, Response } from "express";
import { Booking, IBookedSeat } from "../models/booking.model";
import { Showtime } from "../models/showtime.model";
import { Food } from "../models/food.model";
import { Offer } from "../models/offer.model";
import { UserModel } from "../models/user.model";
import { generateBookingCode } from "../utils/bookingCode";
import { AuthRequest } from "../middleware/auth";
import mongoose, { Types } from "mongoose";
import { MovieModel } from "../models/movie.model";
import { Cinema } from "../models/cinema.model";
import { Screen } from "../models/screen.model";
import {
  computeHoldExpiry,
  generatePaymentToken,
  releaseExpiredHolds,
} from "../services/bookingHold.service";

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

class BookingFlowError extends Error {
  constructor(
    message: string,
    readonly statusCode: number,
    readonly responseData?: Record<string, unknown>
  ) {
    super(message);
    this.name = "BookingFlowError";
  }
}

const rowNumber = (row: string): number =>
  [...row].reduce((value, character) => value * 26 + character.charCodeAt(0) - 64, 0);

const validateSeatsAgainstScreen = (
  seats: IBookedSeat[],
  screen: {
    rows: number;
    seatsPerRow: number;
    seatLayout?: { row: string; seats: number }[];
  }
): string | null => {
  for (const seat of seats) {
    if (screen.seatLayout?.length) {
      const row = screen.seatLayout.find(
        (layout) => layout.row.toUpperCase() === seat.row
      );
      if (!row || seat.seatNumber > row.seats) return seat.seatId;
    } else if (
      rowNumber(seat.row) > screen.rows ||
      seat.seatNumber > screen.seatsPerRow
    ) {
      return seat.seatId;
    }
  }
  return null;
};

const isTransactionUnsupported = (error: unknown): boolean => {
  if (typeof error !== "object" || error === null) return false;
  const transactionError = error as {
    code?: number;
    message?: string;
  };
  return (
    transactionError.code === 20 &&
    /Transaction numbers are only allowed|replica set member or mongos/i.test(
      transactionError.message ?? ""
    )
  );
};

const isDuplicateSeatError = (error: unknown): boolean => {
  if (typeof error !== "object" || error === null || !("keyPattern" in error)) {
    return false;
  }
  const keyPattern = error.keyPattern;
  return (
    typeof keyPattern === "object" &&
    keyPattern !== null &&
    "seats.seatId" in keyPattern
  );
};

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

    if (typeof showtimeId !== "string" || !Types.ObjectId.isValid(showtimeId)) {
      return res.status(400).json({ message: "Invalid showtime id!" });
    }

    await releaseExpiredHolds({ showtimeId });

    // Validate the full showtime relationship rather than trusting request-supplied IDs.
    const showtime = await Showtime.findById(showtimeId);
    if (!showtime) {
      return res.status(404).json({ message: "Showtime not found!" });
    }

    if (!showtime.isActive) {
      return res.status(400).json({ message: "This showtime is not available!" });
    }

    const [movie, cinema, screen] = await Promise.all([
      MovieModel.findById(showtime.movie).select("_id"),
      Cinema.findById(showtime.cinema).select("_id isActive"),
      Screen.findById(showtime.screen).select(
        "_id cinema isActive totalSeats rows seatsPerRow seatLayout"
      ),
    ]);

    if (!movie || !cinema || !screen) {
      return res.status(409).json({
        message: "This showtime has invalid movie, cinema, or screen details.",
      });
    }
    if (!cinema.isActive || !screen.isActive) {
      return res.status(400).json({
        message: "This cinema or screen is not available!",
      });
    }
    if (
      screen.cinema.toString() !== showtime.cinema.toString() ||
      screen.totalSeats !== showtime.totalSeats ||
      !Number.isFinite(showtime.ticketPrice) ||
      showtime.ticketPrice < 0 ||
      showtime.availableSeats < 0 ||
      showtime.availableSeats > showtime.totalSeats
    ) {
      return res.status(409).json({
        message: "This showtime has inconsistent screen or pricing details.",
      });
    }

    // Validate seat syntax and that each seat exists in the configured screen layout.
    const seats = normalizeSeats(rawSeats);
    if (typeof seats === "string") {
      return res.status(400).json({ message: seats });
    }

    const invalidSeat = validateSeatsAgainstScreen(seats, screen);
    if (invalidSeat) {
      return res.status(400).json({
        message: `Seat ${invalidSeat} does not exist on this screen.`,
      });
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
      if (
        !guestInfo ||
        typeof guestInfo.name !== "string" ||
        !guestInfo.name.trim() ||
        typeof guestInfo.email !== "string" ||
        !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(guestInfo.email.trim()) ||
        typeof guestInfo.phone !== "string" ||
        !guestInfo.phone.trim()
      ) {
        return res.status(400).json({
          message: "Guest name, valid email and phone are required!",
        });
      }
    }

    // 4. Calculate ticket amount
    const totalSeats = seats.length;
    const ticketPrice = showtime.ticketPrice;
    const ticketTotal = Math.round(totalSeats * ticketPrice * 100) / 100;

    // 5. Process Food Items
    if (foodItems !== undefined && !Array.isArray(foodItems)) {
      return res.status(400).json({ message: "Food items must be a list!" });
    }

    let processedFoodItems: {
      food: Types.ObjectId;
      quantity: number;
      price: number;
    }[] = [];
    let foodTotal = 0;

    if (foodItems?.length > 0) {
      for (const item of foodItems) {
        if (
          !item ||
          typeof item.foodId !== "string" ||
          !Types.ObjectId.isValid(item.foodId) ||
          !Number.isSafeInteger(item.quantity ?? 1) ||
          (item.quantity ?? 1) < 1
        ) {
          return res.status(400).json({
            message: "Each food item needs a valid id and positive quantity!",
          });
        }

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

        const quantity = item.quantity ?? 1;
        const itemTotal = food.price * quantity;
        if (
          !Number.isFinite(food.price) ||
          food.price < 0 ||
          !Number.isFinite(itemTotal)
        ) {
          return res.status(400).json({ message: "Invalid food item total!" });
        }

        processedFoodItems.push({
          food: food._id,
          quantity,
          price: food.price,
        });

        foodTotal += itemTotal;
      }
    }
    foodTotal = Math.round(foodTotal * 100) / 100;

    // 6. Calculate subtotal (before discount)
    const subTotal = Math.round((ticketTotal + foodTotal) * 100) / 100;
    if (!Number.isFinite(subTotal)) {
      return res.status(400).json({ message: "Invalid booking total!" });
    }

    // 7. Process Offer / Promo Code
    let discountAmount = 0;
    let appliedOffer: Types.ObjectId | undefined;
    let offerSnapshot:
      | {
          discountType: "percentage" | "fixed";
          discountValue: number;
          minAmount?: number;
          maxDiscount?: number;
          validFrom: Date;
          validTo: Date;
          usageLimit?: number;
        }
      | undefined;

    if (offerCode) {
      if (typeof offerCode !== "string" || !offerCode.trim()) {
        return res.status(400).json({ message: "Invalid offer code!" });
      }
      const offer = await Offer.findOne({
        code: offerCode.trim().toUpperCase(),
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

      if (!Number.isFinite(offer.discountValue) || offer.discountValue < 0) {
        return res.status(409).json({ message: "This offer has invalid discount details!" });
      }
      if (
        (offer.minAmount !== undefined &&
          (!Number.isFinite(offer.minAmount) || offer.minAmount < 0)) ||
        (offer.maxDiscount !== undefined &&
          (!Number.isFinite(offer.maxDiscount) || offer.maxDiscount < 0))
      ) {
        return res.status(409).json({ message: "This offer has invalid discount details!" });
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
        discountAmount = Math.round((subTotal * offer.discountValue) / 100 * 100) / 100;

        if (offer.maxDiscount && discountAmount > offer.maxDiscount) {
          discountAmount = offer.maxDiscount;
        }
      } else {
        discountAmount = offer.discountValue;
      }

      if (discountAmount > subTotal) {
        discountAmount = subTotal;
      }
      discountAmount = Math.round(discountAmount * 100) / 100;

      appliedOffer = offer._id;
      offerSnapshot = {
        discountType: offer.discountType,
        discountValue: offer.discountValue,
        minAmount: offer.minAmount,
        maxDiscount: offer.maxDiscount,
        validFrom: offer.validFrom,
        validTo: offer.validTo,
        usageLimit: offer.usageLimit,
      };
    }

    // 8. Final amount
    const finalAmount = Math.round((subTotal - discountAmount) * 100) / 100;
    if (!Number.isFinite(finalAmount) || finalAmount <= 0) {
      return res.status(400).json({
        message: "The booking total must be greater than zero to use online payment.",
      });
    }

    // 9. Generate unique booking code
    let bookingCode = generateBookingCode();
    let existing = await Booking.findOne({ bookingCode });
    while (existing) {
      bookingCode = generateBookingCode();
      existing = await Booking.findOne({ bookingCode });
    }

    const paymentToken = generatePaymentToken();
    const holdExpiresAt = computeHoldExpiry();
    const bookingData = {
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
      paymentStatus: "Pending" as const,
      bookingStatus: "Pending" as const,
      holdExpiresAt,
      paymentTokenHash: paymentToken.hash,
    };

    const persistBooking = async (
      session?: mongoose.ClientSession
    ): Promise<InstanceType<typeof Booking>> => {
      let seatsReserved = false;
      let offerReserved = false;
      const options = session ? { session } : {};

      try {
        const seatReservation = await Showtime.updateOne(
          {
            _id: showtime._id,
            movie: showtime.movie,
            cinema: showtime.cinema,
            screen: showtime.screen,
            totalSeats: screen.totalSeats,
            ticketPrice,
            isActive: true,
            availableSeats: { $gte: totalSeats },
          },
          { $inc: { availableSeats: -totalSeats } },
          options
        );
        if (seatReservation.modifiedCount !== 1) {
          throw new BookingFlowError(
            "The selected seats are no longer available. Please choose again.",
            409
          );
        }
        seatsReserved = true;

        if (appliedOffer && offerSnapshot) {
          const offerFilter: Record<string, unknown> = {
            _id: appliedOffer,
            isActive: true,
            validFrom: { $lte: new Date() },
            validTo: { $gte: new Date() },
            discountType: offerSnapshot.discountType,
            discountValue: offerSnapshot.discountValue,
            usedCount: offerSnapshot.usageLimit
              ? { $lt: offerSnapshot.usageLimit }
              : { $gte: 0 },
          };
          if (offerSnapshot.minAmount !== undefined) {
            offerFilter.minAmount = offerSnapshot.minAmount;
          }
          if (offerSnapshot.maxDiscount !== undefined) {
            offerFilter.maxDiscount = offerSnapshot.maxDiscount;
          }
          const offerReservation = await Offer.updateOne(
            offerFilter,
            { $inc: { usedCount: 1 } },
            options
          );
          if (offerReservation.modifiedCount !== 1) {
            throw new BookingFlowError(
              "This offer is no longer available. Please try again.",
              409
            );
          }
          offerReserved = true;
        }

        const booking = new Booking(bookingData);
        if (session) await booking.save({ session });
        else await booking.save();
        return booking;
      } catch (error) {
        if (!session) {
          const compensation: Promise<unknown>[] = [];
          if (offerReserved && appliedOffer) {
            compensation.push(
              Offer.updateOne(
                { _id: appliedOffer, usedCount: { $gt: 0 } },
                { $inc: { usedCount: -1 } }
              )
            );
          }
          if (seatsReserved) {
            compensation.push(
              Showtime.updateOne(
                { _id: showtime._id },
                { $inc: { availableSeats: totalSeats } }
              )
            );
          }
          const results = await Promise.allSettled(compensation);
          const compensationErrors = results
            .filter(
              (result): result is PromiseRejectedResult =>
                result.status === "rejected"
            )
            .map((result) => result.reason);
          if (compensationErrors.length) {
            console.error("Booking reservation rollback failed:", compensationErrors);
          }
        }
        throw error;
      }
    };

    let booking: InstanceType<typeof Booking> | undefined;
    const session = await mongoose.startSession();
    try {
      try {
        await session.withTransaction(async () => {
          booking = await persistBooking(session);
        });
      } catch (error) {
        if (!isTransactionUnsupported(error)) throw error;
        booking = await persistBooking();
      }
    } finally {
      await session.endSession();
    }

    if (!booking) {
      throw new Error("Booking transaction completed without creating a booking");
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
      paymentToken: paymentToken.token,
    });
  } catch (error) {
    if (error instanceof BookingFlowError) {
      return res.status(error.statusCode).json({
        message: error.message,
        ...error.responseData,
      });
    }
    if (isDuplicateSeatError(error)) {
      const seats = Array.isArray(req.body?.seats)
        ? normalizeSeats(req.body.seats)
        : [];
      const seatIds =
        typeof seats === "string" ? [] : seats.map((seat) => seat.seatId);
      if (seatIds.length && Types.ObjectId.isValid(req.body?.showtimeId)) {
        const nowTaken = await findUnavailableSeatIds(
          new Types.ObjectId(req.body.showtimeId),
          seatIds
        );
        const ids = nowTaken.length > 0 ? nowTaken : seatIds;
        return res.status(409).json({
          message: seatConflictMessage(ids),
          unavailableSeats: ids,
        });
      }
    }
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

    const previousStatus = booking.bookingStatus;
    const cancelledBooking = await Booking.findOneAndUpdate(
      { _id: booking._id, bookingStatus: previousStatus },
      {
        $set: {
          bookingStatus: "Cancelled",
          paymentStatus: previousStatus === "Pending" ? "Cancelled" : "Refunded",
          holdExpiresAt: null,
          paymentTokenHash: null,
        },
      },
      { new: true }
    );
    if (!cancelledBooking) {
      return res.status(409).json({
        message: "Booking status changed. Please refresh and try again.",
      });
    }

    await Showtime.updateOne(
      { _id: booking.showtime },
      { $inc: { availableSeats: booking.totalSeats } }
    );
    if (booking.offer) {
      await Offer.updateOne(
        { _id: booking.offer, usedCount: { $gt: 0 } },
        { $inc: { usedCount: -1 } }
      );
    }

    res.status(200).json({
      message: "Booking cancelled successfully!",
      data: cancelledBooking,
    });
  } catch (error) {
    console.error("CancelBooking Error:", error);
    res.status(500).json({ message: "Failed to cancel booking!" });
  }
};