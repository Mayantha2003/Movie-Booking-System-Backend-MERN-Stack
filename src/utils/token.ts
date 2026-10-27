import jwt from "jsonwebtoken";
import dotenv from "dotenv";
import { IUser } from "../models/user.model";

dotenv.config();

const JWT_SECRET = process.env.JWT_SECRET as string;
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET as string;

// Access Token (30 minutes)
export const signAccessToken = (user: IUser): string => {
  return jwt.sign(
    {
      sub: user._id.toString(),
      role: user.user_role,
      username: user.username,
    },
    JWT_SECRET,
    { expiresIn: "30m" }
  );
};

// Refresh Token (7 days)
export const signRefreshToken = (user: IUser): string => {
  return jwt.sign(
    {
      sub: user._id.toString(),
    },
    JWT_REFRESH_SECRET,
    { expiresIn: "7d" }
  );
};