
import type { Request, Response } from "express";
import { Types } from "mongoose";

import { Booking } from "../models/booking.model";
import { Payment, type PaymentStatus } from "../models/payment.model";
import { UserModel } from "../models/user.model";

import {
  releaseExpiredHolds,
  verifyPaymentToken,
} from "../services/bookingHold.service";
import {
  generateTicketPdf,
  type TicketData,
} from "../services/ticketPdf.service";
import { sendBookingConfirmationEmail } from "../services/email.service";

const INVALID_LINK_MESSAGE =
  "This payment link is not valid. Please start your booking again.";

const DEMO_MAX_ATTEMPTS = 3;

const isDemoPaymentsEnabled = (): boolean =>
  process.env.DEMO_PAYMENTS_ENABLED?.trim().toLowerCase() === "true";

const normalizeDemoOrderId = (
  bookingCode: string,
  attempt: number
): string => `DEMO-${bookingCode}-${attempt}`;

const auditEvent = (
  status: PaymentStatus,
  statusCode: number | undefined,
  note: string
) => ({
  at: new Date(),
  status,
  statusCode,
  note,
});

const sendConfirmationEmailIfNeeded = async (
  paymentId: Types.ObjectId,
  bookingId: Types.ObjectId
): Promise<void> => {
  if (Booking.db.readyState !== 1) return;

  const claimedPayment = await Payment.findOneAndUpdate(
    {
      _id: paymentId,
      status: "SUCCESS",
      chargedBack: false,
      refundRequired: false,
      $or: [
        { emailSent: false },
        { emailSent: { $exists: false } },
      ],
    },
    { $set: { emailSent: true } },
    { new: true }
  );

  if (!claimedPayment) return;

  try {
    const paymentOwner = await Payment.findOne({
      booking: bookingId,
      status: "SUCCESS",
      chargedBack: false,
      refundRequired: false,
    })
      .sort({ paidAt: 1, _id: 1 })
      .select("_id")
      .lean();

    if (
      !paymentOwner ||
      paymentOwner._id.toString() !== paymentId.toString()
    ) {
      await Payment.updateOne(
        { _id: paymentId },
        {
          $set: { emailSent: false },
          $unset: { emailSentAt: 1 },
        }
      );
      return;
    }

    const booking = await Booking.findById(bookingId)
      .populate("movie", "title")
      .populate("cinema", "name")
      .populate("screen", "name")
      .populate("showtime", "showDate startTime");

    if (!booking) throw new Error("Booking not found.");

    if (
      booking.paymentStatus !== "Paid" ||
      !["Confirmed", "Completed"].includes(booking.bookingStatus)
    ) {
      throw new Error("Booking is not eligible for an e-ticket.");
    }

    const movie = booking.movie as unknown as { title: string } | null;
    const cinema = booking.cinema as unknown as { name: string } | null;
    const screen = booking.screen as unknown as { name: string } | null;
    const showtime = booking.showtime as unknown as {
      showDate: Date;
      startTime: string;
    } | null;

    if (!movie || !cinema || !screen || !showtime) {
      throw new Error("Booking information is incomplete.");
    }

    let customerEmail = booking.guestInfo?.email;
    let customerName = booking.guestInfo?.name || "Customer";

    if (booking.user) {
      const user = await UserModel.findById(booking.user)
        .select("first_name last_name email")
        .lean();

      if (user) {
        customerEmail =
          customerEmail || (user.email as string | undefined);

        customerName =
          `${user.first_name || ""} ${user.last_name || ""}`.trim() ||
          customerName;
      }
    }

    if (!customerEmail) {
      throw new Error("Customer email not found.");
    }

    const ticketData: TicketData = {
      bookingCode: booking.bookingCode,
      movieName: movie.title,
      cinemaName: cinema.name,
      screenName: screen.name,
      showDate: showtime.showDate,
      startTime: showtime.startTime,
      seats: booking.seats.map((seat) => seat.seatId),
      totalSeats: booking.totalSeats,
      finalAmount: booking.finalAmount,
      paymentStatus: "Paid",
      bookingStatus: "Confirmed",
    };

    const pdfBuffer = await generateTicketPdf(ticketData);

    await sendBookingConfirmationEmail({
      email: customerEmail,
      customerName,
      bookingCode: booking.bookingCode,
      pdfBuffer,
    });

    await Payment.updateOne(
      { _id: paymentId, emailSent: true },
      { $set: { emailSentAt: new Date() } }
    );
  } catch (error) {
    await Payment.updateOne(
      { _id: paymentId },
      {
        $set: { emailSent: false },
        $unset: { emailSentAt: 1 },
      }
    );

    console.error("E-ticket email failed:", error);
  }
};

/**
 * Confirms the booking first.
 * Only after confirmation succeeds is the demo payment marked SUCCESS.
 * Cancelled and expired bookings are never resurrected.
 */
const confirmBookingAfterPayment = async (
  paymentId: Types.ObjectId,
  bookingId: Types.ObjectId
): Promise<boolean> => {
  const confirmedBooking = await Booking.findOneAndUpdate(
    {
      _id: bookingId,
      bookingStatus: "Pending",
      paymentStatus: "Pending",
      holdExpiresAt: { $gt: new Date() },
    },
    {
      $set: {
        bookingStatus: "Confirmed",
        paymentStatus: "Paid",
        holdExpiresAt: null,
        paymentTokenHash: null,
      },
    },
    { new: true }
  );

  if (!confirmedBooking) {
    await Payment.updateOne(
      { _id: paymentId, status: "PENDING" },
      {
        $set: {
          status: "FAILED",
          statusCode: 3,
          statusMessage: "Booking could not be confirmed.",
        },
        $push: {
          events: auditEvent(
            "FAILED",
            3,
            "Booking was expired, cancelled, or no longer pending."
          ),
        },
      }
    );

    return false;
  }

  const successfulPayment = await Payment.findOneAndUpdate(
    {
      _id: paymentId,
      booking: bookingId,
      status: "PENDING",
    },
    {
      $set: {
        status: "SUCCESS",
        statusCode: 2,
        statusMessage: "Demo card payment approved.",
        method: "Demo Card",
        paidAt: new Date(),
      },
      $push: {
        events: auditEvent(
          "SUCCESS",
          2,
          "Demo card payment approved."
        ),
      },
    },
    { new: true }
  );

  if (!successfulPayment) {
    // Do not silently claim payment succeeded if its record was not updated.
    await Booking.updateOne(
      {
        _id: bookingId,
        bookingStatus: "Confirmed",
        paymentStatus: "Paid",
      },
      {
        $set: {
          bookingStatus: "Cancelled",
          paymentStatus: "Cancelled",
        },
      }
    );

    return false;
  }

  await sendConfirmationEmailIfNeeded(paymentId, bookingId);

  return true;
};

export const getDemoBookingSummary = async (
  req: Request,
  res: Response
) => {
  try {
    if (!isDemoPaymentsEnabled()) {
      return res.status(403).json({
        message: "Demo payments are currently disabled.",
        code: "DEMO_DISABLED",
      });
    }

    const bookingCode =
      typeof req.body?.bookingCode === "string"
        ? req.body.bookingCode.trim().toUpperCase()
        : "";

    const paymentToken =
      typeof req.body?.paymentToken === "string"
        ? req.body.paymentToken
        : "";

    if (!bookingCode || !paymentToken) {
      return res.status(400).json({
        message: "Booking code and payment token are required.",
      });
    }

    const booking = await Booking.findOne({ bookingCode })
      .select(
        "+paymentTokenHash bookingStatus paymentStatus holdExpiresAt finalAmount totalSeats seats movie cinema screen showtime"
      )
      .populate("movie", "title")
      .populate("cinema", "name")
      .populate("screen", "name")
      .populate("showtime", "showDate startTime endTime")
      .lean();

    if (
      !booking ||
      !verifyPaymentToken(paymentToken, booking.paymentTokenHash)
    ) {
      return res.status(403).json({
        message: INVALID_LINK_MESSAGE,
      });
    }

    if (booking.bookingStatus !== "Pending") {
      return res.status(410).json({
        message: "This booking is no longer active.",
        code: "BOOKING_NOT_ACTIVE",
      });
    }

    if (
      !booking.holdExpiresAt ||
      booking.holdExpiresAt.getTime() <= Date.now()
    ) {
      await releaseExpiredHolds({
        showtimeId: booking.showtime as Types.ObjectId,
      });

      return res.status(410).json({
        message: "Your seat hold has expired.",
        code: "HOLD_EXPIRED",
      });
    }

    const movie = booking.movie as unknown as { title?: string } | null;
    const cinema = booking.cinema as unknown as { name?: string } | null;
    const screen = booking.screen as unknown as { name?: string } | null;

    const showtime = booking.showtime as unknown as {
      showDate?: string | Date;
      startTime?: string;
      endTime?: string;
    } | null;

    if (
      !movie?.title ||
      !cinema?.name ||
      !screen?.name ||
      !showtime?.showDate ||
      !showtime?.startTime
    ) {
      return res.status(404).json({
        message: "Booking details are incomplete.",
      });
    }

    return res.status(200).json({
      message: "Booking verified.",
      data: {
        bookingCode: booking.bookingCode,
        movieTitle: movie.title,
        cinemaName: cinema.name,
        screenName: screen.name,
        showDate: showtime.showDate,
        startTime: showtime.startTime,
        endTime: showtime.endTime ?? null,
        seats: booking.seats.map((seat) => seat.seatId),
        totalSeats: booking.totalSeats,
        amount: Number(booking.finalAmount),
        currency: "LKR",
        paymentStatus: booking.paymentStatus,
        bookingStatus: booking.bookingStatus,
        holdExpiresAt: booking.holdExpiresAt,
      },
    });
  } catch (error) {
    console.error("GetDemoBookingSummary Error:", error);

    return res.status(500).json({
      message: "Failed to load booking details.",
    });
  }
};

export const processDemoPayment = async (
  req: Request,
  res: Response
) => {
  try {
    if (!isDemoPaymentsEnabled()) {
      return res.status(403).json({
        message: "Demo payments are disabled.",
        code: "DEMO_DISABLED",
      });
    }

    const bookingCode =
      typeof req.body?.bookingCode === "string"
        ? req.body.bookingCode.trim().toUpperCase()
        : "";

    const paymentToken =
      typeof req.body?.paymentToken === "string"
        ? req.body.paymentToken
        : "";

    if (!bookingCode || !paymentToken) {
      return res.status(400).json({
        message: "Booking code and payment token are required.",
      });
    }

    const booking = await Booking.findOne({ bookingCode })
      .select(
        "+paymentTokenHash bookingStatus paymentStatus holdExpiresAt finalAmount user showtime _id"
      )
      .lean();

    if (!booking) {
      return res.status(403).json({
        message: INVALID_LINK_MESSAGE,
      });
    }

    // A successful retry can be acknowledged even though confirmation
    // has already cleared the one-time payment token.
    if (
      booking.bookingStatus === "Confirmed" ||
      booking.bookingStatus === "Completed"
    ) {
      const existing = await Payment.findOne({
        booking: booking._id,
        status: "SUCCESS",
        chargedBack: false,
        refundRequired: false,
      })
        .sort({ paidAt: 1, _id: 1 })
        .select("orderId amount currency")
        .lean();

      if (existing) {
        return res.status(200).json({
          message: "This booking has already been paid.",
          data: {
            orderId: existing.orderId,
            status: "SUCCESS",
            bookingStatus: booking.bookingStatus,
            paymentStatus: "Paid",
            amount: Number(existing.amount),
            currency: existing.currency ?? "LKR",
          },
        });
      }

      return res.status(409).json({
        message: "This booking is already confirmed.",
        code: "BOOKING_ALREADY_CONFIRMED",
      });
    }

    if (!verifyPaymentToken(paymentToken, booking.paymentTokenHash)) {
      return res.status(403).json({
        message: INVALID_LINK_MESSAGE,
      });
    }

    if (booking.bookingStatus !== "Pending") {
      return res.status(410).json({
        message: "This booking is no longer active.",
        code: "BOOKING_NOT_ACTIVE",
      });
    }

    if (
      !booking.holdExpiresAt ||
      booking.holdExpiresAt.getTime() <= Date.now()
    ) {
      await releaseExpiredHolds({
        showtimeId: booking.showtime as Types.ObjectId,
      });

      return res.status(410).json({
        message: "Your seat hold has expired.",
        code: "HOLD_EXPIRED",
      });
    }

    const amount = Number(booking.finalAmount);

    if (!Number.isFinite(amount) || amount <= 0) {
      return res.status(400).json({
        message: "Invalid booking amount.",
      });
    }

    const existingSuccess = await Payment.findOne({
      booking: booking._id,
      status: "SUCCESS",
      chargedBack: false,
      refundRequired: false,
    })
      .select("orderId amount currency")
      .lean();

    if (existingSuccess) {
      return res.status(200).json({
        message: "Payment already processed.",
        data: {
          orderId: existingSuccess.orderId,
          status: "SUCCESS",
          bookingStatus: "Confirmed",
          paymentStatus: "Paid",
          amount: Number(existingSuccess.amount),
          currency: existingSuccess.currency ?? "LKR",
        },
      });
    }

    const attemptsUsed = await Payment.countDocuments({
      booking: booking._id,
    });

    if (attemptsUsed >= DEMO_MAX_ATTEMPTS) {
      return res.status(409).json({
        message: "You have used all available demo payment attempts.",
        code: "MAX_ATTEMPTS",
      });
    }

    const attempt = attemptsUsed + 1;
    const orderId = normalizeDemoOrderId(bookingCode, attempt);

    const paymentRecord = await Payment.create({
      orderId,
      booking: booking._id,
      user: booking.user ?? null,
      amount,
      currency: "LKR",
      status: "PENDING",
      attempt,
      method: "Demo Card",
      statusMessage: "Demo card payment started.",
      emailSent: false,
      events: [
        auditEvent(
          "PENDING",
          0,
          `Demo payment started (attempt ${attempt}).`
        ),
      ],
    });

    const confirmed = await confirmBookingAfterPayment(
      paymentRecord._id,
      booking._id
    );

    if (!confirmed) {
      return res.status(409).json({
        message: "Booking confirmation failed. Please start again.",
        code: "BOOKING_CONFIRMATION_FAILED",
      });
    }

    const successfulPayment = await Payment.findById(
      paymentRecord._id
    ).select("orderId amount currency status");

    if (!successfulPayment || successfulPayment.status !== "SUCCESS") {
      return res.status(500).json({
        message: "Payment confirmation could not be completed.",
      });
    }

    return res.status(200).json({
      message: "Demo payment processed successfully.",
      data: {
        orderId: successfulPayment.orderId,
        status: "SUCCESS",
        bookingStatus: "Confirmed",
        paymentStatus: "Paid",
        amount: Number(successfulPayment.amount),
        currency: successfulPayment.currency ?? "LKR",
      },
    });
  } catch (error: unknown) {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === 11000
    ) {
      return res.status(409).json({
        message: "A payment attempt is already being processed.",
        code: "ATTEMPT_IN_PROGRESS",
      });
    }

    console.error("Demo payment error:", error);

    return res.status(500).json({
      message: "Failed to process the demo payment.",
    });
  }
};
