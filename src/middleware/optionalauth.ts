import { NextFunction, Response } from "express";
import { AuthRequest, authenticateToken, getBearerToken } from "./auth";

// Optional authentication permits guest requests but validates any supplied token.
export const optionalAuthenticate = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  const authorization = req.headers.authorization;

  if (!authorization) {
    return next();
  }

  const token = getBearerToken(authorization);
  if (!token) {
    return res.status(401).json({ message: "Invalid or Expired Token!" });
  }

  if (await authenticateToken(req, res, token)) next();
};
