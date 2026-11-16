import { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import dotenv from "dotenv";
import { Types } from "mongoose";
import { UserModel, UserStatus } from "../models/user.model";
import { isTokenRevoked } from "../services/tokenRevocation.service";

dotenv.config();

const JWT_SECRET = process.env.JWT_SECRET as string;
const INVALID_TOKEN_MESSAGE = "Invalid or Expired Token!";

export interface AuthRequest extends Request {
  user?: any;
}

export const getBearerToken = (authorization?: string): string | null => {
  if (!authorization) return null;
  const [scheme, token, ...extra] = authorization.trim().split(/\s+/);
  if (scheme?.toLowerCase() !== "bearer" || !token || extra.length > 0) {
    return null;
  }
  return token;
};

export const authenticateToken = async (
  req: AuthRequest,
  res: Response,
  token: string
): Promise<boolean> => {
  let payload: string | jwt.JwtPayload;
  try {
    payload = jwt.verify(token, JWT_SECRET, { algorithms: ["HS256"] });
  } catch (error) {
    res.status(401).json({ message: INVALID_TOKEN_MESSAGE });
    return false;
  }

  if (
    typeof payload === "string" ||
    typeof payload.sub !== "string" ||
    !Types.ObjectId.isValid(payload.sub) ||
    typeof payload.role !== "string"
  ) {
    res.status(401).json({ message: INVALID_TOKEN_MESSAGE });
    return false;
  }

  const [user, tokenRevoked] = await Promise.all([
    UserModel.findById(payload.sub)
      .select("_id username user_role user_status")
      .lean(),
    isTokenRevoked(token),
  ]);

  if (
    !user ||
    tokenRevoked ||
    user.user_status === UserStatus.BLOCKED ||
    user.user_role !== payload.role
  ) {
    res.status(401).json({ message: INVALID_TOKEN_MESSAGE });
    return false;
  }

  req.user = {
    ...payload,
    sub: String(user._id),
    role: user.user_role,
    username: user.username,
  };
  return true;
};

export const authenticate = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  const authorization = req.headers.authorization;
  if (!authorization) {
    return res.status(401).json({ message: "Token Not Found!" });
  }

  const token = getBearerToken(authorization);
  if (!token) {
    return res.status(401).json({ message: INVALID_TOKEN_MESSAGE });
  }

  if (await authenticateToken(req, res, token)) next();
};
