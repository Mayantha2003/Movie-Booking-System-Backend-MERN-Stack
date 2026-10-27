import { Request, Response } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { UserModel, UserRole } from "../models/user.model";
import { signAccessToken, signRefreshToken } from "../utils/token";
import { AuthRequest } from "../middleware/auth";

// ===================== REGISTER =====================
export const register = async (req: Request, res: Response) => {
  try {
    const { first_name, last_name, username, email, phone, password } = req.body;

    // Check if username already exists
    const existingUser = await UserModel.findOne({ username });
    if (existingUser) {
      return res.status(400).json({ message: "Username already exists!" });
    }

    // Hash password
    const salt = bcrypt.genSaltSync(10);
    const hashedPassword = bcrypt.hashSync(password, salt);

    const newUser = new UserModel({
      first_name,
      last_name,
      username,
      email,
      phone,
      password: hashedPassword,
      user_role: UserRole.USER,
    });

    await newUser.save();

    res.status(201).json({ message: "User registered successfully!" });
  } catch (error) {
    console.error("Register Error:", error);
    res.status(500).json({ message: "Registration failed!" });
  }
};

// ===================== LOGIN =====================
export const login = async (req: Request, res: Response) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ message: "Username or Password missing!" });
    }

    const user = await UserModel.findOne({ username });
    if (!user) {
      return res.status(401).json({ message: "User not found!" });
    }

    const isValid = await bcrypt.compare(password, user.password);
    if (!isValid) {
      return res.status(401).json({ message: "Invalid credentials!" });
    }

    const accessToken = signAccessToken(user);
    const refreshToken = signRefreshToken(user);

    res.status(200).json({
      message: "Login successful!",
      data: {
        id: user._id,
        first_name: user.first_name,
        last_name: user.last_name,
        username: user.username,
        role: user.user_role,
        access_token: accessToken,
        refresh_token: refreshToken,
      },
    });
  } catch (error) {
    console.error("Login Error:", error);
    res.status(500).json({ message: "Login failed!" });
  }
};

// ===================== GET MY DETAILS =====================
export const getMyDetails = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: "Unauthorized!" });
    }

    const userId = req.user.sub;
    const user = await UserModel.findById(userId).select("-password");

    if (!user) {
      return res.status(404).json({ message: "User not found!" });
    }

    res.status(200).json({
      message: "Success!",
      data: user,
    });
  } catch (error) {
    console.error("GetMyDetails Error:", error);
    res.status(500).json({ message: "Failed to get user details!" });
  }
};

// ===================== REFRESH TOKEN =====================
export const getRefreshToken = async (req: Request, res: Response) => {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      return res.status(400).json({ message: "Refresh token not found!" });
    }

    const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET as string;
    const payload: any = jwt.verify(refreshToken, JWT_REFRESH_SECRET);

    const user = await UserModel.findById(payload.sub);
    if (!user) {
      return res.status(403).json({ message: "Invalid or expired token!" });
    }

    const newAccessToken = signAccessToken(user);

    res.status(200).json({
      message: "Token refreshed!",
      data: {
        access_token: newAccessToken,
      },
    });
  } catch (error) {
    res.status(403).json({ message: "Invalid or expired token!" });
  }
};