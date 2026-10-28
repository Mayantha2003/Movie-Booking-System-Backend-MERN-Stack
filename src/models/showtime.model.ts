import { Schema, model, Document, Types } from "mongoose";

export interface IShowtime extends Document {
  movie: Types.ObjectId;          // Reference to Movie
  cinema: Types.ObjectId;         // Reference to Cinema
  screen: Types.ObjectId;         // Reference to Screen
  showDate: Date;                 // e.g. 2025-11-05
  startTime: string;              // e.g. "10:30 AM" or "14:00"
  endTime: string;                // e.g. "12:45 PM" or "16:30"
  ticketPrice: number;            // Base ticket price
  availableSeats: number;         // Remaining seats
  totalSeats: number;             // Total seats in the screen
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const showtimeSchema = new Schema<IShowtime>(
  {
    movie: {
      type: Schema.Types.ObjectId,
      ref: "Movie",
      required: [true, "Movie is required"],
    },
    cinema: {
      type: Schema.Types.ObjectId,
      ref: "Cinema",
      required: [true, "Cinema is required"],
    },
    screen: {
      type: Schema.Types.ObjectId,
      ref: "Screen",
      required: [true, "Screen is required"],
    },
    showDate: {
      type: Date,
      required: [true, "Show date is required"],
    },
    startTime: {
      type: String,
      required: [true, "Start time is required"],
      trim: true,
    },
    endTime: {
      type: String,
      required: [true, "End time is required"],
      trim: true,
    },
    ticketPrice: {
      type: Number,
      required: [true, "Ticket price is required"],
      min: [0, "Ticket price cannot be negative"],
    },
    availableSeats: {
      type: Number,
      required: true,
      min: [0, "Available seats cannot be negative"],
    },
    totalSeats: {
      type: Number,
      required: true,
      min: [1, "Total seats must be at least 1"],
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  }
);

// Indexes for better performance
showtimeSchema.index({ movie: 1, showDate: 1 });
showtimeSchema.index({ cinema: 1, showDate: 1 });
showtimeSchema.index({ screen: 1, showDate: 1, startTime: 1 });
showtimeSchema.index({ showDate: 1, isActive: 1 });

export const Showtime = model<IShowtime>("Showtime", showtimeSchema);