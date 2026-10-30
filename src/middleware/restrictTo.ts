import { Response, NextFunction } from "express";
import { AuthRequest } from "./auth"; // Import the custom request type from the auth file

// Middleware to restrict access based on user roles
export const restrictTo = (...roles: string[]) => {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    // Check whether the user is authenticated
    if (!req.user) {
      return res.status(401).json({ message: "Unauthorized!" });
    }

    // Get the user's role from the JWT payload
    const userRole = req.user.role || req.user.user_role;

    // Check whether the user's role is allowed to access this resource
    if (!roles.includes(userRole)) {
      return res.status(403).json({
        message: "You do not have permission to perform this action!",
      });
    }

    // Allow the request to proceed to the next middleware or route handler
    next();
  };
};