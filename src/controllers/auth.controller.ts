import { Request, Response } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { Types } from "mongoose";
import { UserModel, UserRole, UserStatus } from "../models/user.model";
import { signAccessToken, signRefreshToken } from "../utils/token";
import {
  emailDuplicateFilter,
  validateAccountInput,
  type AccountInput,
} from "../utils/accountInput";
import { AuthRequest, getBearerToken } from "../middleware/auth";
import {
  getRevocableToken,
  isTokenRevoked,
  revokeToken,
} from "../services/tokenRevocation.service";

const findExistingAccount = (input: Pick<AccountInput, "username" | "email">) =>
  UserModel.findOne({
    $or: [
      { username: input.username },
      emailDuplicateFilter(input.email),
    ],
  });

const isDuplicateKeyError = (error: unknown): boolean =>
  typeof error === "object" &&
  error !== null &&
  "code" in error &&
  error.code === 11000;

const duplicateAccountResponse = (res: Response) =>
  res.status(409).json({ message: "Username or email is already in use." });

// ===================== REGISTER =====================
export const register = async (req: Request, res: Response) => {
  const input = validateAccountInput(req.body);
  if (typeof input === "string") {
    return res.status(400).json({ message: input });
  }

  try {
    const existingUser = await findExistingAccount(input);
    if (existingUser) {
      return duplicateAccountResponse(res);
    }

    const hashedPassword = await bcrypt.hash(input.password, 10);

    const newUser = new UserModel({
      first_name: input.first_name,
      last_name: input.last_name,
      username: input.username,
      email: input.email,
      phone: input.phone,
      password: hashedPassword,
      user_role: UserRole.USER,
    });

    await newUser.save();

    return res.status(201).json({ message: "User registered successfully!" });
  } catch (error) {
    if (isDuplicateKeyError(error)) return duplicateAccountResponse(res);
    console.error("Registration failed.");
    return res.status(500).json({ message: "Registration failed!" });
  }
};

// ===================== CREATE ADMIN =====================
export const createAdmin = async (req: AuthRequest, res: Response) => {
  const input = validateAccountInput(req.body);
  if (typeof input === "string") {
    return res.status(400).json({ message: input });
  }

  try {
    const existingUser = await findExistingAccount(input);
    if (existingUser) {
      return duplicateAccountResponse(res);
    }

    const hashedPassword = await bcrypt.hash(input.password, 10);

    const newAdmin = await UserModel.create({
      first_name: input.first_name,
      last_name: input.last_name,
      username: input.username,
      email: input.email,
      phone: input.phone,
      password: hashedPassword,
      user_role: UserRole.ADMIN
    });

    return res.status(201).json({
      message: "Admin created successfully!",
      data: {
        id: newAdmin._id,
        username: newAdmin.username,
        email: newAdmin.email,
        role: newAdmin.user_role
      }
    });

  } catch (error) {
    if (isDuplicateKeyError(error)) return duplicateAccountResponse(res);
    console.error("Admin account creation failed.");
    return res.status(500).json({
      message: "Admin creation failed!"
    });
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

    // Blocked accounts cannot sign in
    if (user.user_status === UserStatus.BLOCKED) {
      return res
        .status(403)
        .json({ message: "Your account has been blocked. Contact the system administrator." });
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
  const { refreshToken } = req.body ?? {};
  if (typeof refreshToken !== "string" || !refreshToken.trim()) {
    return res.status(400).json({ message: "Refresh token not found!" });
  }

  let payload: string | jwt.JwtPayload;
  try {
    const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET as string;
    payload = jwt.verify(refreshToken.trim(), JWT_REFRESH_SECRET, {
      algorithms: ["HS256"],
    });
  } catch (error) {
    res.status(403).json({ message: "Invalid or expired token!" });
    return;
  }

  if (
    typeof payload === "string" ||
    typeof payload.sub !== "string" ||
    !Types.ObjectId.isValid(payload.sub)
  ) {
    return res.status(403).json({ message: "Invalid or expired token!" });
  }

  try {
    if (await isTokenRevoked(refreshToken.trim())) {
      return res.status(403).json({ message: "Invalid or expired token!" });
    }

    const user = await UserModel.findById(payload.sub).select(
      "_id username user_role user_status"
    );

    // A deleted or blocked account cannot renew its session.
    if (!user || user.user_status === UserStatus.BLOCKED) {
      return res.status(403).json({ message: "Invalid or expired token!" });
    }

    const newAccessToken = signAccessToken(user);
    return res.status(200).json({
      message: "Token refreshed!",
      data: {
        access_token: newAccessToken,
      },
    });
  } catch (error) {
    console.error("Refresh Token Error:", error);
    return res.status(500).json({ message: "Failed to refresh token!" });
  }
};

export const logout = async (req: Request, res: Response) => {
  const accessToken = getBearerToken(req.headers.authorization);
  const refreshToken =
    typeof req.body?.refreshToken === "string"
      ? req.body.refreshToken.trim()
      : "";
  const accessSecret = process.env.JWT_SECRET as string;
  const refreshSecret = process.env.JWT_REFRESH_SECRET as string;
  const tokens = [
    ...(accessToken
      ? [getRevocableToken(accessToken, accessSecret)]
      : []),
    ...(refreshToken
      ? [getRevocableToken(refreshToken, refreshSecret)]
      : []),
  ].filter((token) => token !== null);

  if (
    tokens.length === 2 &&
    tokens[0].subject !== tokens[1].subject
  ) {
    return res.status(400).json({ message: "Invalid logout token pair." });
  }

  try {
    await Promise.all(tokens.map(revokeToken));
    return res.status(204).json({});
  } catch (error) {
    console.error("Logout token revocation failed.");
    return res.status(500).json({ message: "Logout failed!" });
  }
};