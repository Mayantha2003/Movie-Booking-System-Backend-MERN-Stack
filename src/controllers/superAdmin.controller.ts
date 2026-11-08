import { Response } from "express";
import mongoose from "mongoose";
import { AuthRequest } from "../middleware/auth";
import { UserModel, UserRole, UserStatus } from "../models/user.model";
import { MovieModel } from "../models/movie.model";
import { Booking } from "../models/booking.model";

const isValidId = (id: string) => mongoose.Types.ObjectId.isValid(id);

// ===================== DASHBOARD STATS =====================
export const getStats = async (_req: AuthRequest, res: Response) => {
  try {
    const [admins, users, movies, bookings, revenue] = await Promise.all([
      UserModel.countDocuments({ user_role: UserRole.ADMIN }),
      UserModel.countDocuments({
        user_role: { $in: [UserRole.USER, UserRole.CUSTOMER] },
      }),
      MovieModel.countDocuments(),
      Booking.countDocuments(),
      Booking.aggregate([
        { $match: { paymentStatus: "Paid" } },
        { $group: { _id: null, total: { $sum: "$finalAmount" } } },
      ]),
    ]);

    res.status(200).json({
      message: "Success!",
      data: { admins, users, movies, bookings, revenue: revenue[0]?.total ?? 0 },
    });
  } catch (error) {
    console.error("Get Stats Error:", error);
    res.status(500).json({ message: "Failed to load statistics!" });
  }
};

// ===================== LIST ADMINS =====================
export const getAdmins = async (_req: AuthRequest, res: Response) => {
  try {
    const admins = await UserModel.find({ user_role: UserRole.ADMIN })
      .select("-password -verification_token")
      .sort({ createdAt: -1 });

    res.status(200).json({ message: "Success!", data: admins });
  } catch (error) {
    console.error("Get Admins Error:", error);
    res.status(500).json({ message: "Failed to load admins!" });
  }
};

// ===================== BLOCK / UNBLOCK ADMIN =====================
export const updateAdminStatus = async (req: AuthRequest, res: Response) => {
  try {
    const id = String(req.params.id);
    const { status } = req.body;

    if (!isValidId(id)) {
      return res.status(400).json({ message: "Invalid admin id!" });
    }
    if (![UserStatus.ACTIVE, UserStatus.BLOCKED].includes(status)) {
      return res.status(400).json({ message: "Status must be ACTIVE or BLOCKED!" });
    }

    // Only ADMIN accounts can be changed here (never SUPER_ADMIN or customers).
    const admin = await UserModel.findOneAndUpdate(
      { _id: id, user_role: UserRole.ADMIN },
      { user_status: status },
      { new: true }
    ).select("-password -verification_token");

    if (!admin) {
      return res.status(404).json({ message: "Admin not found!" });
    }

    res.status(200).json({
      message:
        status === UserStatus.BLOCKED
          ? "Admin blocked successfully!"
          : "Admin unblocked successfully!",
      data: admin,
    });
  } catch (error) {
    console.error("Update Admin Status Error:", error);
    res.status(500).json({ message: "Failed to update admin status!" });
  }
};

// ===================== DELETE ADMIN =====================
export const deleteAdmin = async (req: AuthRequest, res: Response) => {
  try {
    const id = String(req.params.id);

    if (!isValidId(id)) {
      return res.status(400).json({ message: "Invalid admin id!" });
    }

    const admin = await UserModel.findOneAndDelete({
      _id: id,
      user_role: UserRole.ADMIN,
    });

    if (!admin) {
      return res.status(404).json({ message: "Admin not found!" });
    }

    res.status(200).json({ message: "Admin deleted successfully!" });
  } catch (error) {
    console.error("Delete Admin Error:", error);
    res.status(500).json({ message: "Failed to delete admin!" });
  }
};