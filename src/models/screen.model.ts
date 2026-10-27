import { Schema, Document, model , Types } from "mongoose";

export interface IScreen extends Document {
  cinema: Types.ObjectId;       // Reference to Cinema
  name: string;                 // e.g. "Screen 1", "Audi 2", "IMAX"
  screenType: "Standard" | "Premium" | "IMAX" | "4DX" | "Dolby Atmos";
  totalSeats: number;
  rows: number;                 // Number of rows
  seatsPerRow: number;          // Seats in each row
  seatLayout?: {
    row: string;                // e.g. "A", "B", "C"
    seats: number;              // Number of seats in that row
  }[];
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const screenSchema = new Schema<IScreen>(
  {
    cinema: {
      type: Schema.Types.ObjectId,
      ref: "Cinema",
      required: [true, "Cinema is required"],
    },
    name: {
      type: String,
      required: [true, "Screen name is required"],
      trim: true,
    },
    screenType: {
      type: String,
      enum: ["Standard", "Premium", "IMAX", "4DX", "Dolby Atmos"],
      default: "Standard",
    },
    totalSeats: {
      type: Number,
      required: [true, "Total seats is required"],
      min: [1, "Total seats must be at least 1"],
    },
    rows: {
      type: Number,
      required: [true, "Number of rows is required"],
      min: [1, "At least 1 row is required"],
    },
    seatsPerRow: {
      type: Number,
      required: [true, "Seats per row is required"],
      min: [1, "At least 1 seat per row is required"],
    },
    seatLayout: [
      {
        row: {
          type: String,
          required: true,
          uppercase: true,
        },
        seats: {
          type: Number,
          required: true,
          min: 1,
        },
      },
    ],
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  }
);

// Compound index to prevent duplicate screen names in same cinema
screenSchema.index({ cinema: 1, name: 1 }, { unique: true });
screenSchema.index({ cinema: 1, isActive: 1 });

export const Screen = model <IScreen>("Screen", screenSchema);