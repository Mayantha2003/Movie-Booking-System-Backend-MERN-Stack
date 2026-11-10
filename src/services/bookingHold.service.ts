import crypto from "crypto";
import { Types } from "mongoose";
import { Booking } from "../models/booking.model";
import { Showtime } from "../models/showtime.model";
import { Offer } from "../models/offer.model";

const DEFAULT_HOLD_MINUTES = 10;

export const getHoldMinutes = (): number => {
  const raw = process.env.PAYMENT_HOLD_MINUTES?.trim();
  if (!raw) return DEFAULT_HOLD_MINUTES;

  const minutes = Number(raw);
  if (!Number.isInteger(minutes) || minutes < 1 || minutes > 60) {
    throw new Error("PAYMENT_HOLD_MINUTES must be a whole number from 1 to 60");
  }
  return minutes;
};

export const computeHoldExpiry = (from: Date = new Date()): Date =>
  new Date(from.getTime() + getHoldMinutes() * 60 * 1000);

export const isHoldActive = (
  booking: { bookingStatus: string; holdExpiresAt?: Date | null },
  now: Date = new Date()
): boolean =>
  booking.bookingStatus === "Pending" &&
  booking.holdExpiresAt != null &&
  booking.holdExpiresAt.getTime() > now.getTime();

export interface PaymentToken {
  token: string;
  hash: string;
}

export const hashPaymentToken = (token: string): string =>
  crypto.createHash("sha256").update(token).digest("hex");

export const generatePaymentToken = (): PaymentToken => {
  const token = crypto.randomBytes(32).toString("hex");
  return { token, hash: hashPaymentToken(token) };
};

export const verifyPaymentToken = (
  token: unknown,
  storedHash?: string | null
): boolean => {
  if (typeof token !== "string" || !token || !storedHash) return false;

  const given = Buffer.from(hashPaymentToken(token), "hex");
  const stored = Buffer.from(storedHash, "hex");

  return given.length === stored.length && crypto.timingSafeEqual(given, stored);
};

interface ReleaseOptions {
  showtimeId?: Types.ObjectId | string;
  now?: Date;
  limit?: number;
}

export const releaseExpiredHolds = async (
  options: ReleaseOptions = {}
): Promise<number> => {
  const now = options.now ?? new Date();
  const limit = options.limit ?? 200;

  const filter: Record<string, unknown> = {
    bookingStatus: "Pending",
    holdExpiresAt: { $lte: now },
  };
  if (options.showtimeId) filter.showtime = options.showtimeId;

  const expired = await Booking.find(filter).select("_id").limit(limit).lean();
  let released = 0;

  for (const { _id } of expired) {
    const booking = await Booking.findOneAndUpdate(
      { _id, bookingStatus: "Pending", holdExpiresAt: { $lte: now } },
      {
        $set: {
          bookingStatus: "Cancelled",
          paymentStatus: "Cancelled",
          paymentTokenHash: null,
        },
      },
      { new: true }
    );

    if (!booking) continue;

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

    released += 1;
  }

  return released;
};

export const startHoldSweeper = (
  intervalMs: number = 60_000
): NodeJS.Timeout => {
  let running = false;

  const timer = setInterval(async () => {
    if (running) return;
    running = true;
    try {
      const count = await releaseExpiredHolds();
      if (count > 0) console.log(`🕒 Released ${count} expired seat hold(s)`);
    } catch (error) {
      console.error("Hold sweeper error:", error);
    } finally {
      running = false;
    }
  }, intervalMs);

  timer.unref();
  return timer;
};
