import { MovieModel } from "../models/movie.model";
import { Booking } from "../models/booking.model";
import { Food } from "../models/food.model";
import { Offer } from "../models/offer.model";
import { Request, Response } from "express";
import bcrypt from "bcryptjs";
import { UserModel, UserRole, UserStatus } from "../models/user.model";
import {
  emailDuplicateFilter,
  validateAccountInput,
} from "../utils/accountInput";
import { isValidRequestObjectId } from "../utils/requestValidation";

// ===================== DASHBOARD STATS =====================
export const getStats = async (_req: Request, res: Response) => {
  try {
    const [movies, bookings, users, revenue, recentBookings] = await Promise.all([
      MovieModel.countDocuments(),
      Booking.countDocuments(),
      UserModel.countDocuments({
        user_role: { $in: [UserRole.USER, UserRole.CUSTOMER] },
      }),
      Booking.aggregate([
        { $match: { paymentStatus: "Paid" } },
        { $group: { _id: null, total: { $sum: "$finalAmount" } } },
      ]),
      Booking.find()
        .populate("user", "first_name last_name")
        .populate("movie", "title")
        .populate("cinema", "name")
        .sort({ createdAt: -1 })
        .limit(6),
    ]);

    res.status(200).json({
      message: "Success!",
      data: { movies, bookings, users, revenue: revenue[0]?.total ?? 0, recentBookings },
    });
  } catch (error) {
    console.error("Admin Stats Error:", error);
    res.status(500).json({ message: "Failed to load statistics!" });
  }
};

// The public endpoints hide inactive items. The admin console needs all of them.

// ===================== ALL MOVIES =====================
export const getAllMovies = async (_req: Request, res: Response) => {
  try {
    const movies = await MovieModel.find().sort({ createdAt: -1 });
    res.status(200).json({ message: "Success!", count: movies.length, data: movies });
  } catch (error) {
    console.error("Admin Movies Error:", error);
    res.status(500).json({ message: "Failed to fetch movies!" });
  }
};

// ===================== ALL FOODS =====================
export const getAllFoods = async (_req: Request, res: Response) => {
  try {
    const foods = await Food.find().sort({ category: 1, name: 1 });
    res.status(200).json({ message: "Success!", count: foods.length, data: foods });
  } catch (error) {
    console.error("Admin Foods Error:", error);
    res.status(500).json({ message: "Failed to fetch foods!" });
  }
};

// ===================== ALL OFFERS =====================
export const getAllOffers = async (_req: Request, res: Response) => {
  try {
    const offers = await Offer.find().sort({ createdAt: -1 });
    res.status(200).json({ message: "Success!", count: offers.length, data: offers });
  } catch (error) {
    console.error("Admin Offers Error:", error);
    res.status(500).json({ message: "Failed to fetch offers!" });
  }
};

// ===================== USER MANAGEMENT (customers only) =====================
// Admins manage customer accounts here. ADMIN and SUPER_ADMIN accounts are never touched.

const CUSTOMER_ROLES = [UserRole.USER, UserRole.CUSTOMER];
const SAFE_FIELDS = "-password -verification_token";
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// ----- LIST USERS (with booking count and total paid) -----
export const getUsers = async (_req: Request, res: Response) => {
  try {
    const users: any[] = await UserModel.find({ user_role: { $in: CUSTOMER_ROLES } })
      .select(SAFE_FIELDS)
      .sort({ createdAt: -1 })
      .lean();

    const totals = await Booking.aggregate([
      { $match: { user: { $in: users.map((u) => u._id) } } },
      {
        $group: {
          _id: "$user",
          bookingCount: { $sum: 1 },
          totalSpent: {
            $sum: { $cond: [{ $eq: ["$paymentStatus", "Paid"] }, "$finalAmount", 0] },
          },
        },
      },
    ]);
    const byUser = new Map(totals.map((t) => [String(t._id), t]));

    const data = users.map((u) => ({
      ...u,
      bookingCount: byUser.get(String(u._id))?.bookingCount ?? 0,
      totalSpent: byUser.get(String(u._id))?.totalSpent ?? 0,
    }));

    res.status(200).json({ message: "Success!", count: data.length, data });
  } catch (error) {
    console.error("Admin Users Error:", error);
    res.status(500).json({ message: "Failed to fetch users!" });
  }
};

// ----- CREATE USER -----
export const createUser = async (req: Request, res: Response) => {
  const input = validateAccountInput(req.body);
  if (typeof input === "string") {
    return res.status(400).json({ message: input });
  }

  try {
    const existing = await UserModel.findOne({
      $or: [{ username: input.username }, emailDuplicateFilter(input.email)],
    });
    if (existing) {
      return res.status(409).json({ message: "Username or email is already in use." });
    }

    const user = await UserModel.create({
      first_name: input.first_name,
      last_name: input.last_name,
      username: input.username,
      email: input.email,
      phone: input.phone,
      password: await bcrypt.hash(input.password, 10),
      user_role: UserRole.USER,
    });

    res.status(201).json({
      message: "User created successfully!",
      data: await UserModel.findById(user._id).select(SAFE_FIELDS),
    });
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === 11000
    ) {
      return res.status(409).json({ message: "Username or email is already in use." });
    }
    console.error("Admin customer account creation failed.");
    res.status(500).json({ message: "Failed to create user!" });
  }
};

// ----- UPDATE USER (name, email, phone) -----
export const updateUser = async (req: Request, res: Response) => {
  try {
    const id = String(req.params.id);
    if (!isValidRequestObjectId(id)) return res.status(400).json({ message: "Invalid user id!" });

    const { first_name, last_name, email, phone } = req.body;
    const set: Record<string, string> = {};
    const unset: Record<string, 1> = {};

    if (first_name !== undefined) {
      if (!String(first_name).trim()) return res.status(400).json({ message: "First name is required!" });
      set.first_name = String(first_name).trim();
    }
    if (last_name !== undefined) {
      if (!String(last_name).trim()) return res.status(400).json({ message: "Last name is required!" });
      set.last_name = String(last_name).trim();
    }
    // An empty value is removed, not stored: the unique email index would reject two "" values.
    if (email !== undefined) {
      if (!String(email).trim()) unset.email = 1;
      else {
        if (!EMAIL_RE.test(email)) return res.status(400).json({ message: "Enter a valid email address!" });
        const taken = await UserModel.findOne({ email, _id: { $ne: id } });
        if (taken) return res.status(409).json({ message: "Email already exists!" });
        set.email = String(email).trim();
      }
    }
    if (phone !== undefined) {
      if (!String(phone).trim()) unset.phone = 1;
      else set.phone = String(phone).trim();
    }

    const user = await UserModel.findOneAndUpdate(
      { _id: id, user_role: { $in: CUSTOMER_ROLES } },
      { ...(Object.keys(set).length ? { $set: set } : {}), ...(Object.keys(unset).length ? { $unset: unset } : {}) },
      { new: true }
    ).select(SAFE_FIELDS);

    if (!user) return res.status(404).json({ message: "User not found!" });

    res.status(200).json({ message: "User updated successfully!", data: user });
  } catch (error) {
    console.error("Admin Update User Error:", error);
    res.status(500).json({ message: "Failed to update user!" });
  }
};

// ----- BLOCK / UNBLOCK USER -----
export const updateUserStatus = async (req: Request, res: Response) => {
  try {
    const id = String(req.params.id);
    const { status } = req.body;

    if (!isValidRequestObjectId(id)) return res.status(400).json({ message: "Invalid user id!" });
    if (![UserStatus.ACTIVE, UserStatus.BLOCKED].includes(status)) {
      return res.status(400).json({ message: "Status must be ACTIVE or BLOCKED!" });
    }

    const user = await UserModel.findOneAndUpdate(
      { _id: id, user_role: { $in: CUSTOMER_ROLES } },
      { user_status: status },
      { new: true }
    ).select(SAFE_FIELDS);

    if (!user) return res.status(404).json({ message: "User not found!" });

    res.status(200).json({
      message: status === UserStatus.BLOCKED ? "User blocked successfully!" : "User unblocked successfully!",
      data: user,
    });
  } catch (error) {
    console.error("Admin User Status Error:", error);
    res.status(500).json({ message: "Failed to update user status!" });
  }
};

// ----- DELETE USER -----
export const deleteUser = async (req: Request, res: Response) => {
  try {
    const id = String(req.params.id);
    if (!isValidRequestObjectId(id)) return res.status(400).json({ message: "Invalid user id!" });

    const user = await UserModel.findOneAndDelete({ _id: id, user_role: { $in: CUSTOMER_ROLES } });
    if (!user) return res.status(404).json({ message: "User not found!" });

    res.status(200).json({ message: "User deleted successfully!" });
  } catch (error) {
    console.error("Admin Delete User Error:", error);
    res.status(500).json({ message: "Failed to delete user!" });
  }
};


// ===================== ADVANCED ANALYTICS =====================

export const getAnalytics = async (req: Request, res: Response) => {
  try {
    const getDate = (value: unknown): Date | null => {
      if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
        return null;
      }

      const date = new Date(`${value}T00:00:00.000Z`);

      if (
        Number.isNaN(date.getTime()) ||
        date.toISOString().slice(0, 10) !== value
      ) {
        return null;
      }

      return date;
    };

    const now = new Date();
    const defaultTo = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
    );

    const defaultFrom = new Date(defaultTo);
    defaultFrom.setUTCDate(defaultFrom.getUTCDate() - 29);

    const fromInput = req.query.from;
    const toInput = req.query.to;

    const from = fromInput === undefined
      ? defaultFrom
      : getDate(fromInput);

    const to = toInput === undefined
      ? defaultTo
      : getDate(toInput);

    if (!from || !to) {
      return res.status(400).json({
        message: "Invalid date. Use YYYY-MM-DD format.",
      });
    }

    if (from > to) {
      return res.status(400).json({
        message: "Start date cannot be after end date.",
      });
    }

    const days =
      (to.getTime() - from.getTime()) / (1000 * 60 * 60 * 24);

    if (days > 365) {
      return res.status(400).json({
        message: "Date range cannot exceed 366 days.",
      });
    }

    const endExclusive = new Date(to);
    endExclusive.setUTCDate(endExclusive.getUTCDate() + 1);

    const match = {
      createdAt: {
        $gte: from,
        $lt: endExclusive,
      },
    };

    const [
      summaryResult,
      revenueTrend,
      popularMovies,
      bookingStatuses,
      paymentStatuses,
    ] = await Promise.all([
      Booking.aggregate([
        { $match: match },
        {
          $group: {
            _id: null,
            totalBookings: { $sum: 1 },
            paidBookings: {
              $sum: {
                $cond: [{ $eq: ["$paymentStatus", "Paid"] }, 1, 0],
              },
            },
            pendingBookings: {
              $sum: {
                $cond: [{ $eq: ["$bookingStatus", "Pending"] }, 1, 0],
              },
            },
            cancelledBookings: {
              $sum: {
                $cond: [{ $eq: ["$bookingStatus", "Cancelled"] }, 1, 0],
              },
            },
            failedPayments: {
              $sum: {
                $cond: [{ $eq: ["$paymentStatus", "Failed"] }, 1, 0],
              },
            },
            ticketsSold: {
              $sum: {
                $cond: [
                  { $eq: ["$paymentStatus", "Paid"] },
                  "$totalSeats",
                  0,
                ],
              },
            },
            revenue: {
              $sum: {
                $cond: [
                  { $eq: ["$paymentStatus", "Paid"] },
                  "$finalAmount",
                  0,
                ],
              },
            },
          },
        },
      ]),

      Booking.aggregate([
        { $match: match },
        {
          $group: {
            _id: {
              $dateToString: {
                format: "%Y-%m-%d",
                date: "$createdAt",
                timezone: "Asia/Colombo",
              },
            },
            bookings: { $sum: 1 },
            revenue: {
              $sum: {
                $cond: [
                  { $eq: ["$paymentStatus", "Paid"] },
                  "$finalAmount",
                  0,
                ],
              },
            },
          },
        },
        { $sort: { _id: 1 } },
        {
          $project: {
            _id: 0,
            date: "$_id",
            bookings: 1,
            revenue: 1,
          },
        },
      ]),

      Booking.aggregate([
        { $match: match },
        {
          $group: {
            _id: "$movie",
            bookings: { $sum: 1 },
            ticketsSold: {
              $sum: {
                $cond: [
                  { $eq: ["$paymentStatus", "Paid"] },
                  "$totalSeats",
                  0,
                ],
              },
            },
            revenue: {
              $sum: {
                $cond: [
                  { $eq: ["$paymentStatus", "Paid"] },
                  "$finalAmount",
                  0,
                ],
              },
            },
          },
        },
        { $sort: { bookings: -1, revenue: -1 } },
        { $limit: 5 },
        {
          $lookup: {
            from: MovieModel.collection.name,
            localField: "_id",
            foreignField: "_id",
            as: "movie",
          },
        },
        {
          $unwind: {
            path: "$movie",
            preserveNullAndEmptyArrays: true,
          },
        },
        {
          $project: {
            _id: 0,
            movieId: "$_id",
            title: { $ifNull: ["$movie.title", "Deleted movie"] },
            bookings: 1,
            ticketsSold: 1,
            revenue: 1,
          },
        },
      ]),

      Booking.aggregate([
        { $match: match },
        {
          $group: {
            _id: "$bookingStatus",
            count: { $sum: 1 },
          },
        },
        { $sort: { count: -1 } },
        {
          $project: {
            _id: 0,
            status: "$_id",
            count: 1,
          },
        },
      ]),

      Booking.aggregate([
        { $match: match },
        {
          $group: {
            _id: "$paymentStatus",
            count: { $sum: 1 },
          },
        },
        { $sort: { count: -1 } },
        {
          $project: {
            _id: 0,
            status: "$_id",
            count: 1,
          },
        },
      ]),
    ]);

    const summary = summaryResult[0] ?? {
      totalBookings: 0,
      paidBookings: 0,
      pendingBookings: 0,
      cancelledBookings: 0,
      failedPayments: 0,
      ticketsSold: 0,
      revenue: 0,
    };

    return res.status(200).json({
      message: "Analytics loaded successfully!",
      data: {
        period: {
          from: from.toISOString().slice(0, 10),
          to: to.toISOString().slice(0, 10),
        },
        summary,
        revenueTrend,
        popularMovies,
        bookingStatuses,
        paymentStatuses,
      },
    });
  } catch (error) {
    console.error("Admin Analytics Error:", error);

    return res.status(500).json({
      message: "Failed to load analytics!",
    });
  }
};
