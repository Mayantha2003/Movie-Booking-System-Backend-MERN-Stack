import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import cookieParser from "cookie-parser";
import mongoose from "mongoose";

// ===================== MODELS IMPORT =====================
import "./models/user.model";
import "./models/movie.model";
import "./models/cinema.model";
import "./models/screen.model";
import "./models/showtime.model";
import "./models/booking.model";
import "./models/food.model";
import "./models/offer.model";

// =====================================================================

import authRoutes from "./routes/auth.routes";
import movieRoutes from "./routes/movie.routes";
import cinemaRoutes from "./routes/cinema.routes";
import screenRoutes from "./routes/screen.routes";
import showtimeRoutes from "./routes/showtime.routes";
import bookingRoutes from "./routes/booking.routes";
import foodRoutes from "./routes/food.routes";
import offerRoutes from "./routes/offer.routes";
import adminRoutes from "./routes/admin.routes";
import superAdminRoutes from "./routes/superAdmin.routes";
import paymentRoutes from "./routes/payment.routes";
import { startHoldSweeper } from "./services/bookingHold.service";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5001;

// Middleware
app.use(cors({ origin: true, credentials: true }));
app.use(express.json());
app.use(cookieParser());

// MongoDB Connection
let holdSweeper: NodeJS.Timeout | undefined;
let isShuttingDown = false;

mongoose
  .connect(process.env.MONGO_URL as string)
  .then(() => {
    console.log("✅ MongoDB Connected Successfully");
    if (!isShuttingDown && !holdSweeper) holdSweeper = startHoldSweeper();
  })
  .catch((err) => console.error("❌ MongoDB Connection Error:", err));

// Routes
app.use("/api/auth", authRoutes);
app.use("/api/movies", movieRoutes);
app.use("/api/cinemas", cinemaRoutes);
app.use("/api/screens", screenRoutes);
app.use("/api/showtimes", showtimeRoutes);
app.use("/api/bookings", bookingRoutes);
app.use("/api/payments", paymentRoutes);
app.use("/api/foods",foodRoutes);
app.use("/api/offers", offerRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/super-admin", superAdminRoutes);

// Test Route
app.get("/", (req, res) => {
  res.send("Movie Booking API is running...");
});

const server = app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});

const shutdown = (signal: NodeJS.Signals): void => {
  if (isShuttingDown) return;
  isShuttingDown = true;
  console.log(`Received ${signal}; shutting down gracefully`);

  if (holdSweeper) {
    clearInterval(holdSweeper);
    holdSweeper = undefined;
  }

  server.close((serverError) => {
    if (serverError) {
      console.error("HTTP server shutdown error:", serverError);
      process.exitCode = 1;
    }

    void mongoose
      .disconnect()
      .then(() => {
        console.log("MongoDB disconnected");
      })
      .catch((error: unknown) => {
        console.error("MongoDB shutdown error:", error);
        process.exitCode = 1;
      });
  });
};

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));