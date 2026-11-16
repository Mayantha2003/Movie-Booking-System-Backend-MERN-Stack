
import type { Request, Response } from "express";
import { Types } from "mongoose";

import { Booking } from "../models/booking.model";
import {
  Payment,
  type IPayment,
  type PaymentStatus,
} from "../models/payment.model";
import { Showtime } from "../models/showtime.model";
import { Offer } from "../models/offer.model";
import { UserModel } from "../models/user.model";

import {
  getPayHereConfig,
  PAYHERE_MAX_ATTEMPTS,
} from "../config/payhere";

import {
  amountsMatch,
  buildCheckoutForm,
  buildOrderId,
  type CheckoutCustomer,
  mapStatusCode,
  parseNotification,
  type PayHereNotification,
  splitName,
  verifyNotificationSignature,
} from "../services/payhere.service";

import {
  releaseExpiredHolds,
  verifyPaymentToken,
} from "../services/bookingHold.service";

import {
  generateTicketPdf,
  type TicketData,
} from "../services/ticketPdf.service";

import {
  sendBookingConfirmationEmail,
} from "../services/email.service";

// --------------------------------------------------
// CONSTANTS & HELPERS
// --------------------------------------------------

const INVALID_LINK_MESSAGE =
  "This payment link is not valid. Please start your booking again.";

const FALLBACK_EMAIL = "customer@example.com";
const FALLBACK_PHONE = "0770000000";

const isDuplicateKeyError = (error: unknown): boolean =>
  typeof error === "object" &&
  error !== null &&
  "code" in error &&
  error.code === 11000;

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

// --------------------------------------------------
// CHECKOUT CUSTOMER
// --------------------------------------------------

const getCheckoutCustomer = async (booking: {
  user?: Types.ObjectId | null;
  guestInfo?: {
    name?: string;
    email?: string;
    phone?: string;
  };
}): Promise<CheckoutCustomer> => {
  if (booking.user) {
    const user = await UserModel.findById(booking.user)
      .select("first_name last_name email phone")
      .lean();

    if (user) {
      return {
        firstName: user.first_name || "Customer",
        lastName: user.last_name || "Customer",
        email: user.email || FALLBACK_EMAIL,
        phone: user.phone || FALLBACK_PHONE,
      };
    }
  }

  const guest = booking.guestInfo;
  const { firstName, lastName } = splitName(
    guest?.name ?? ""
  );

  return {
    firstName,
    lastName,
    email: guest?.email || FALLBACK_EMAIL,
    phone: guest?.phone || FALLBACK_PHONE,
  };
};

// --------------------------------------------------
// RESTORE BOOKING CAPACITY
// --------------------------------------------------

const restoreBookingCapacity = async (booking: {
  showtime: Types.ObjectId;
  totalSeats: number;
  offer?: Types.ObjectId | null;
}): Promise<void> => {
  await Showtime.updateOne(
    { _id: booking.showtime },
    {
      $inc: {
        availableSeats: booking.totalSeats,
      },
    }
  );

  if (booking.offer) {
    await Offer.updateOne(
      {
        _id: booking.offer,
        usedCount: { $gt: 0 },
      },
      {
        $inc: {
          usedCount: -1,
        },
      }
    );
  }
};

// --------------------------------------------------
// SEND BOOKING CONFIRMATION EMAIL
// --------------------------------------------------

const sendConfirmationEmailIfNeeded = async (
  paymentId: Types.ObjectId,
  bookingId: Types.ObjectId
): Promise<void> => {
  /*
   * Claim the email notification atomically.
   *
   * Only SUCCESS payments which are not charged back
   * and do not require a refund are eligible.
   */

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
    {
      $set: {
        emailSent: true,
      },
    },
    {
      new: true,
    }
  );

  // Already sent or another request is processing it.
  if (!claimedPayment) return;

  try {
    // Verify that this payment owns the booking.
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
      !paymentOwner._id.equals(paymentId)
    ) {
      await Payment.updateOne(
        { _id: paymentId },
        {
          $set: {
            emailSent: false,
          },
          $unset: {
            emailSentAt: 1,
          },
        }
      );

      return;
    }

    // Load complete booking information.
    const booking = await Booking.findById(bookingId)
      .populate("movie", "title")
      .populate("cinema", "name")
      .populate("screen", "name")
      .populate("showtime", "showDate startTime");

    if (!booking) {
      throw new Error("Booking not found.");
    }

    // Only paid and confirmed bookings can receive tickets.
    if (
      booking.paymentStatus !== "Paid" ||
      !["Confirmed", "Completed"].includes(
        booking.bookingStatus
      )
    ) {
      throw new Error(
        "Booking is not eligible for an e-ticket."
      );
    }

    const movie = booking.movie as unknown as {
      title: string;
    } | null;

    const cinema = booking.cinema as unknown as {
      name: string;
    } | null;

    const screen = booking.screen as unknown as {
      name: string;
    } | null;

    const showtime = booking.showtime as unknown as {
      showDate: Date;
      startTime: string;
    } | null;

    if (!movie || !cinema || !screen || !showtime) {
      throw new Error(
        "Movie, cinema, screen or showtime information is missing."
      );
    }

    // Resolve customer email.
    let customerEmail = booking.guestInfo?.email;
    let customerName =
      booking.guestInfo?.name || "Customer";

    if (booking.user) {
      const user = await UserModel.findById(booking.user)
        .select("first_name last_name email")
        .lean();

      if (user) {
        customerEmail =
          customerEmail || user.email;

        customerName =
          `${user.first_name || ""} ${user.last_name || ""}`.trim() ||
          customerName;
      }
    }

    if (!customerEmail) {
      throw new Error(
        `Customer email not found for booking ${booking.bookingCode}.`
      );
    }

    // Prepare ticket details.
    const ticketData: TicketData = {
      bookingCode: booking.bookingCode,
      movieName: movie.title,
      cinemaName: cinema.name,
      screenName: screen.name,
      showDate: showtime.showDate,
      startTime: showtime.startTime,
      seats: booking.seats.map(
        (seat) => seat.seatId
      ),
      totalSeats: booking.totalSeats,
      finalAmount: booking.finalAmount,
      paymentStatus: "Paid",
      bookingStatus: "Confirmed",
    };

    // Generate PDF ticket with QR code.
    const pdfBuffer = await generateTicketPdf(
      ticketData
    );

    // Send PDF ticket to customer.
    await sendBookingConfirmationEmail({
      email: customerEmail,
      customerName,
      bookingCode: booking.bookingCode,
      pdfBuffer,
    });

    // Mark email delivery as completed.
    await Payment.updateOne(
      {
        _id: paymentId,
        emailSent: true,
      },
      {
        $set: {
          emailSentAt: new Date(),
        },
      }
    );

    console.log(
      `E-ticket email sent successfully: ${booking.bookingCode}`
    );
  } catch (error) {
    /*
     * Do not undo a successful payment if email fails.
     * Reset the flag so an explicit retry can be made.
     */

    await Payment.updateOne(
      { _id: paymentId },
      {
        $set: {
          emailSent: false,
        },
        $unset: {
          emailSentAt: 1,
        },
      }
    );

    console.error(
      `E-ticket email failed for booking ${bookingId}:`,
      error
    );
  }
};

// --------------------------------------------------
// CREATE CHECKOUT
// --------------------------------------------------

export const createCheckout = async (
  req: Request,
  res: Response
) => {
  try {
    const bookingCode =
      typeof req.body?.bookingCode === "string"
        ? req.body.bookingCode.trim().toUpperCase()
        : "";

    const paymentToken = req.body?.paymentToken;

    if (
      !bookingCode ||
      typeof paymentToken !== "string" ||
      !paymentToken
    ) {
      return res.status(400).json({
        message:
          "Booking code and payment token are required!",
      });
    }

    const booking = await Booking.findOne({
      bookingCode,
    })
      .select("+paymentTokenHash")
      .populate("movie", "title");

    if (
      !booking ||
      !verifyPaymentToken(
        paymentToken,
        booking.paymentTokenHash
      )
    ) {
      return res.status(403).json({
        message: INVALID_LINK_MESSAGE,
      });
    }

    if (
      booking.bookingStatus === "Confirmed" ||
      booking.bookingStatus === "Completed"
    ) {
      return res.status(409).json({
        message: "This booking is already paid.",
        code: "ALREADY_PAID",
      });
    }

    if (booking.bookingStatus !== "Pending") {
      return res.status(410).json({
        message:
          "This booking is no longer active. Please start again.",
        code: "BOOKING_NOT_ACTIVE",
      });
    }

    const now = new Date();

    if (
      !booking.holdExpiresAt ||
      booking.holdExpiresAt.getTime() <= now.getTime()
    ) {
      await releaseExpiredHolds({
        showtimeId: booking.showtime,
      });

      return res.status(410).json({
        message:
          "Your seat hold has expired. Please select your seats again.",
        code: "HOLD_EXPIRED",
      });
    }

    if (
      !Number.isFinite(booking.finalAmount) ||
      booking.finalAmount <= 0
    ) {
      return res.status(400).json({
        message:
          "There is nothing to pay for this booking.",
      });
    }

    const attemptsUsed = await Payment.countDocuments({
      booking: booking._id,
    });

    if (attemptsUsed >= PAYHERE_MAX_ATTEMPTS) {
      return res.status(409).json({
        message:
          "You have used all payment attempts for this booking.",
        code: "MAX_ATTEMPTS",
      });
    }

    const attempt = attemptsUsed + 1;

    const orderId = buildOrderId(
      booking.bookingCode,
      attempt
    );

    const movieTitle =
      (
        booking.movie as unknown as {
          title?: string;
        } | null
      )?.title;

    const customer = await getCheckoutCustomer(
      booking
    );

    let checkout;

    try {
      checkout = buildCheckoutForm({
        orderId,
        amount: booking.finalAmount,
        items: `${movieTitle ?? "Movie tickets"} (${booking.bookingCode})`,
        customer,
      });
    } catch (error) {
      console.error(
        "PayHere configuration error:",
        error
      );

      return res.status(503).json({
        message:
          "Online payment is not available right now. Please try again later.",
      });
    }

    try {
      await Payment.create({
        orderId,
        booking: booking._id,
        user: booking.user ?? null,
        amount: booking.finalAmount,
        currency: "LKR",
        status: "PENDING",
        attempt,
        emailSent: false,
        events: [
          auditEvent(
            "PENDING",
            undefined,
            `Checkout started (attempt ${attempt})`
          ),
        ],
      });
    } catch (error) {
      if (isDuplicateKeyError(error)) {
        return res.status(409).json({
          message:
            "A payment is already being started. Please try again.",
          code: "ATTEMPT_IN_PROGRESS",
        });
      }

      throw error;
    }

    await Booking.updateOne(
      {
        _id: booking._id,
        bookingStatus: "Pending",
      },
      {
        $set: {
          paymentStatus: "Pending",
        },
      }
    );

    return res.status(200).json({
      message: "Checkout ready.",
      data: {
        orderId,
        attempt,
        attemptsLeft:
          PAYHERE_MAX_ATTEMPTS - attempt,
        holdExpiresAt: booking.holdExpiresAt,
        checkout,
      },
    });
  } catch (error) {
    console.error("CreateCheckout Error:", error);

    return res.status(500).json({
      message: "Failed to start the payment!",
    });
  }
};

// --------------------------------------------------
// PAYHERE NOTIFY
// --------------------------------------------------

export const handleNotify = async (
  req: Request,
  res: Response
) => {
  const notification = parseNotification(req.body);

  if (!notification) {
    return res.status(400).send("Invalid notification");
  }

  let config;

  try {
    config = getPayHereConfig();
  } catch (error) {
    console.error(
      "PayHere notify configuration error:",
      error
    );

    return res
      .status(500)
      .send("Payments are not configured");
  }

  if (
    !verifyNotificationSignature(
      notification,
      config.merchantSecret
    )
  ) {
    console.warn(
      `Invalid PayHere signature: ${notification.order_id}`
    );

    return res.status(400).send("Invalid signature");
  }

  try {
    await applyNotification(
      notification,
      config.merchantId
    );

    return res.status(200).send("OK");
  } catch (error) {
    console.error(
      "PayHere notification processing error:",
      error
    );

    return res.status(500).send("Error");
  }
};

// --------------------------------------------------
// APPLY PAYHERE NOTIFICATION
// --------------------------------------------------

const applyNotification = async (
  notification: PayHereNotification,
  merchantId: string
): Promise<void> => {
  const orderId = notification.order_id
    .trim()
    .toUpperCase();

  const mapped = mapStatusCode(
    notification.status_code
  );

  if (!mapped) {
    console.warn(
      `Unknown PayHere status code: ${notification.status_code}`
    );
    return;
  }

  if (notification.merchant_id !== merchantId) {
    console.warn(
      `PayHere merchant mismatch: ${orderId}`
    );
    return;
  }

  const payment = await Payment.findOne({
    orderId,
  });

  if (!payment) {
    console.warn(
      `Unknown PayHere order: ${orderId}`
    );
    return;
  }

  const statusCode = Number(
    notification.status_code
  );

  // Verify amount and currency.
  if (
    notification.payhere_currency !== payment.currency ||
    !amountsMatch(
      notification.payhere_amount,
      payment.amount
    )
  ) {
    console.warn(
      `PayHere amount/currency mismatch: ${orderId}`
    );

    await Payment.updateOne(
      { _id: payment._id },
      {
        $push: {
          events: auditEvent(
            payment.status,
            statusCode,
            `Ignored: amount/currency mismatch (${notification.payhere_amount} ${notification.payhere_currency})`
          ),
        },
      }
    );

    return;
  }

  const details: Partial<IPayment> = {
    statusCode,
  };

  if (notification.status_message) {
    details.statusMessage =
      notification.status_message;
  }

  if (notification.method) {
    details.method = notification.method;
  }

  if (notification.payment_id) {
    details.payherePaymentId =
      notification.payment_id;
  }

  try {
    if (mapped.chargeback) {
      await applyChargeback(
        payment,
        details,
        statusCode
      );
    } else if (mapped.status === "SUCCESS") {
      await applySuccess(
        payment,
        details,
        statusCode
      );
    } else if (mapped.status === "PENDING") {
      await Payment.updateOne(
        {
          _id: payment._id,
          status: "PENDING",
          chargedBack: false,
        },
        {
          $set: details,
          $push: {
            events: auditEvent(
              "PENDING",
              statusCode,
              "PayHere reports the payment is pending"
            ),
          },
        }
      );
    } else {
      await applyFailureOrCancel(
        payment,
        mapped.status,
        details,
        statusCode
      );
    }
  } catch (error) {
    const keyPattern =
      typeof error === "object" &&
      error !== null &&
      "keyPattern" in error
        ? error.keyPattern
        : undefined;

    if (
      isDuplicateKeyError(error) &&
      typeof keyPattern === "object" &&
      keyPattern !== null &&
      "payherePaymentId" in keyPattern
    ) {
      console.warn(
        `PayHere payment ID already used: ${orderId}`
      );
      return;
    }

    throw error;
  }
};

// --------------------------------------------------
// APPLY PAYMENT SUCCESS
// --------------------------------------------------

const applySuccess = async (
  payment: IPayment,
  details: Partial<IPayment>,
  statusCode: number
): Promise<void> => {
  /*
   * Never restore a payment to SUCCESS if it was
   * charged back or marked for refund.
   */

  const updated = await Payment.findOneAndUpdate(
    {
      _id: payment._id,
      chargedBack: false,
      refundRequired: false,
      status: { $ne: "SUCCESS" },
    },
    {
      $set: {
        ...details,
        status: "SUCCESS",
        paidAt: new Date(),
      },
      $push: {
        events: auditEvent(
          "SUCCESS",
          statusCode,
          "Payment received"
        ),
      },
    },
    {
      new: true,
    }
  );

  if (!updated) {
    // Repeated SUCCESS notification: allow email retry
    // only if the payment is still eligible.
    const existing = await Payment.findById(
      payment._id
    );

    if (
      !existing ||
      existing.status !== "SUCCESS" ||
      existing.chargedBack ||
      existing.refundRequired
    ) {
      return;
    }
  }

  await confirmBookingAfterPayment(
    payment._id,
    payment.booking
  );
};

// --------------------------------------------------
// CONFIRM BOOKING AFTER PAYMENT
// --------------------------------------------------

const confirmBookingAfterPayment = async (
  paymentId: Types.ObjectId,
  bookingId: Types.ObjectId
): Promise<void> => {
  // Only the earliest valid successful payment owns booking.
  const paymentOwner = await Payment.findOne({
    booking: bookingId,
    status: "SUCCESS",
    chargedBack: false,
    refundRequired: false,
  })
    .sort({ paidAt: 1, _id: 1 })
    .select("_id")
    .lean();

  if (!paymentOwner) return;

  if (!paymentOwner._id.equals(paymentId)) {
    await flagRefund(
      paymentId,
      bookingId,
      "Duplicate successful payment for this booking"
    );
    return;
  }

  // Check if booking is still pending and its hold is valid.
  const confirmed = await Booking.findOneAndUpdate(
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
    {
      new: true,
    }
  );

  if (confirmed) {
    await sendConfirmationEmailIfNeeded(
      paymentId,
      bookingId
    );
    return;
  }

  const booking = await Booking.findById(
    bookingId
  );

  if (!booking) return;

  // Already confirmed or completed.
  if (
    booking.bookingStatus === "Confirmed" ||
    booking.bookingStatus === "Completed"
  ) {
    if (booking.paymentStatus !== "Paid") {
      await Booking.updateOne(
        { _id: bookingId },
        {
          $set: {
            paymentStatus: "Paid",
          },
        }
      );
    }

    await sendConfirmationEmailIfNeeded(
      paymentId,
      bookingId
    );
    return;
  }

  // Do not resurrect a booking if its hold expired.
  if (
    booking.bookingStatus === "Cancelled" &&
    booking.holdExpiresAt &&
    booking.holdExpiresAt.getTime() > Date.now()
  ) {
    try {
      const resurrected =
        await Booking.findOneAndUpdate(
          {
            _id: bookingId,
            bookingStatus: "Cancelled",
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
          {
            new: true,
          }
        );

      if (resurrected) {
        await Showtime.updateOne(
          { _id: booking.showtime },
          {
            $inc: {
              availableSeats: -booking.totalSeats,
            },
          }
        );

        if (booking.offer) {
          await Offer.updateOne(
            { _id: booking.offer },
            {
              $inc: {
                usedCount: 1,
              },
            }
          );
        }

        await sendConfirmationEmailIfNeeded(
          paymentId,
          bookingId
        );

        return;
      }
    } catch (error) {
      if (!isDuplicateKeyError(error)) {
        throw error;
      }
    }
  }

  // Booking no longer has a valid seat hold.
  await flagRefund(
    paymentId,
    bookingId,
    "Payment received after the seat hold expired or seats were released"
  );
};

// --------------------------------------------------
// FLAG REFUND
// --------------------------------------------------

const flagRefund = async (
  paymentId: Types.ObjectId,
  bookingId: Types.ObjectId,
  reason: string
): Promise<void> => {
  await Payment.updateOne(
    {
      _id: paymentId,
      refundRequired: false,
    },
    {
      $set: {
        refundRequired: true,
        emailSent: false,
      },
      $unset: {
        emailSentAt: 1,
      },
      $push: {
        events: auditEvent(
          "SUCCESS",
          undefined,
          `Refund required: ${reason}`
        ),
      },
    }
  );

  /*
   * Do not set booking.paymentStatus to Paid here.
   * A refund-required payment is not a confirmed ticket.
   * Keep the booking status unchanged for admin review.
   */
};

// --------------------------------------------------
// APPLY PAYMENT FAILURE OR CANCEL
// --------------------------------------------------

const applyFailureOrCancel = async (
  payment: IPayment,
  status: "FAILED" | "CANCELLED",
  details: Partial<IPayment>,
  statusCode: number
): Promise<void> => {
  const updated = await Payment.findOneAndUpdate(
    {
      _id: payment._id,
      status: "PENDING",
      chargedBack: false,
    },
    {
      $set: {
        ...details,
        status,
      },
      $push: {
        events: auditEvent(
          status,
          statusCode,
          `PayHere reports the payment as ${status}`
        ),
      },
    },
    {
      new: true,
    }
  );

  if (!updated) return;

  await mirrorToBooking(updated);
};

// --------------------------------------------------
// MIRROR PAYMENT STATUS TO BOOKING
// --------------------------------------------------

const mirrorToBooking = async (
  payment: Pick<
    IPayment,
    "booking" | "attempt" | "status"
  >
): Promise<void> => {
  const newerAttempt = await Payment.exists({
    booking: payment.booking,
    attempt: { $gt: payment.attempt },
  });

  if (newerAttempt) return;

  const paymentStatus =
    payment.status === "FAILED"
      ? "Failed"
      : payment.status === "CANCELLED"
        ? "Cancelled"
        : "Pending";

  if (
    payment.attempt >= PAYHERE_MAX_ATTEMPTS
  ) {
    const released =
      await Booking.findOneAndUpdate(
        {
          _id: payment.booking,
          bookingStatus: "Pending",
        },
        {
          $set: {
            bookingStatus: "Cancelled",
            paymentStatus,
            holdExpiresAt: null,
            paymentTokenHash: null,
          },
        },
        {
          new: true,
        }
      );

    if (released) {
      await restoreBookingCapacity(released);
    }

    return;
  }

  await Booking.updateOne(
    {
      _id: payment.booking,
      bookingStatus: "Pending",
    },
    {
      $set: {
        paymentStatus,
      },
    }
  );
};

// --------------------------------------------------
// APPLY CHARGEBACK
// --------------------------------------------------

const applyChargeback = async (
  payment: IPayment,
  details: Partial<IPayment>,
  statusCode: number
): Promise<void> => {
  const before = await Payment.findOneAndUpdate(
    {
      _id: payment._id,
      chargedBack: false,
    },
    {
      $set: {
        ...details,
        status: "FAILED",
        chargedBack: true,
        refundRequired: false,
        emailSent: false,
      },
      $unset: {
        emailSentAt: 1,
      },
      $push: {
        events: auditEvent(
          "FAILED",
          statusCode,
          "Chargeback: treated as FAILED"
        ),
      },
    },
    {
      new: false,
    }
  );

  if (!before) return;

  // If payment was not previously successful,
  // mirror its failure status.
  if (before.status !== "SUCCESS") {
    await mirrorToBooking({
      booking: before.booking,
      attempt: before.attempt,
      status: "FAILED",
    });

    return;
  }

  // A previously confirmed booking is cancelled.
  const cancelled = await Booking.findOneAndUpdate(
    {
      _id: payment.booking,
      bookingStatus: {
        $in: ["Confirmed", "Completed"],
      },
    },
    {
      $set: {
        bookingStatus: "Cancelled",
        paymentStatus: "Failed",
        holdExpiresAt: null,
      },
    },
    {
      new: true,
    }
  );

  if (cancelled) {
    await restoreBookingCapacity(cancelled);
  } else {
    await Booking.updateOne(
      { _id: payment.booking },
      {
        $set: {
          paymentStatus: "Failed",
        },
      }
    );
  }
};

// --------------------------------------------------
// GET PAYMENT STATUS
// --------------------------------------------------

export const getPaymentStatus = async (
  req: Request,
  res: Response
) => {
  try {
    const orderId = String(
      req.params.orderId ?? ""
    )
      .trim()
      .toUpperCase();

    if (!/^PH-[A-Z0-9-]{3,40}-\d$/.test(orderId)) {
      return res.status(404).json({
        message: "Payment not found!",
      });
    }

    const payment = await Payment.findOne({
      orderId,
    }).select("status attempt booking");

    if (!payment) {
      return res.status(404).json({
        message: "Payment not found!",
      });
    }

    const booking = await Booking.findById(
      payment.booking
    ).select("bookingStatus holdExpiresAt");

    return res.status(200).json({
      data: {
        orderId,
        status: payment.status,
        bookingStatus:
          booking?.bookingStatus ?? null,
        holdExpiresAt:
          booking?.bookingStatus === "Pending"
            ? booking.holdExpiresAt ?? null
            : null,
        attemptsLeft: Math.max(
          0,
          PAYHERE_MAX_ATTEMPTS - payment.attempt
        ),
      },
    });
  } catch (error) {
    console.error(
      "GetPaymentStatus Error:",
      error
    );

    return res.status(500).json({
      message: "Failed to get the payment status!",
    });
  }
};
