import { NextFunction, Response } from "express";
import jwt from "jsonwebtoken";
import dotenv from "dotenv";
import { AuthRequest } from "./auth";

dotenv.config();

const JWT_SECRET = process.env.JWT_SECRET as string;

// Optional authentication, for routes that work for guests AND logged-in users (e.g. POST /bookings).
//
//  - No Authorization header      -> continue as a guest (req.user stays undefined)
//  - Valid "Bearer <token>"       -> attach the payload to req.user, then continue
//  - Present but invalid/expired  -> 401, same message as `authenticate`
//
// A bad token is rejected instead of being silently treated as a guest. Otherwise a logged-in user
// whose token just expired would unknowingly create a guest booking that is not linked to their
// account, and the client would never get the 401 it needs to refresh the token.
export const optionalAuthenticate = (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  const authHeader = req.headers.authorization;

  // Guest: no credentials were sent
  if (!authHeader) {
    return next();
  }

  // Expected format: "Bearer <token>"
  const [scheme, token] = authHeader.split(" ");

  if (scheme !== "Bearer" || !token) {
    return res.status(401).json({ message: "Invalid or Expired Token!" });
  }

  try {
    const payload = jwt.verify(token, JWT_SECRET, { algorithms: ["HS256"] });

    // Our tokens always carry an object payload (sub, role, username)
    if (typeof payload === "string") {
      return res.status(401).json({ message: "Invalid or Expired Token!" });
    }

    req.user = payload;
    next();
  } catch (error) {
    return res.status(401).json({ message: "Invalid or Expired Token!" });
  }
};