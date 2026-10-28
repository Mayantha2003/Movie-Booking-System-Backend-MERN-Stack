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
// =====================================================================

import authRoutes from "./routes/auth.routes";
import movieRoutes from "./routes/movie.routes";
import cinemaRoutes from "./routes/cinema.routes";
import screenRoutes from "./routes/screen.routes";
import showtimeRoutes from "./routes/showtime.routes";
import bookingRoutes from "./routes/booking.routes";
import foodRoutes from "./routes/food.routes";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5001;

// Middleware
app.use(cors({ origin: true, credentials: true }));
app.use(express.json());
app.use(cookieParser());

// MongoDB Connection
mongoose
  .connect(process.env.MONGO_URL as string)
  .then(() => console.log("✅ MongoDB Connected Successfully"))
  .catch((err) => console.log("❌ MongoDB Connection Error:", err));

// Routes
app.use("/api/auth", authRoutes);
app.use("/api/movies", movieRoutes);
app.use("/api/cinemas", cinemaRoutes);
app.use("/api/screens", screenRoutes);
app.use("/api/showtimes", showtimeRoutes);
app.use("/api/bookings", bookingRoutes);
app.use("/api/foods",foodRoutes);

// Test Route
app.get("/", (req, res) => {
  res.send("Movie Booking API is running...");
});

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});