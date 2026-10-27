import { Document, model, Schema } from "mongoose";

export interface ICinema extends Document {
  name: string;                 // e.g. "PVR Colombo"
  location: string;             // e.g. "Colombo"
  address: string;
  city: string;
  state?: string;
  pincode?: string;
  contactNumber?: string;
  email?: string;
  facilities: string[];         // e.g. ["Parking", "Food Court", "Wheelchair Access"]
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const cinemaSchema = new Schema<ICinema>(
  {
    name: {
      type: String,
      required: [true, "Cinema name is required"],
      trim: true,
      unique: true,
    },
    location: {
      type: String,
      required: [true, "Location is required"],
      trim: true,
    },
    address: {
      type: String,
      required: [true, "Address is required"],
      trim: true,
    },
    city: {
      type: String,
      required: [true, "City is required"],
      trim: true,
    },
    state: {
      type: String,
      trim: true,
    },
    pincode: {
      type: String,
      trim: true,
    },
    contactNumber: {
      type: String,
      trim: true,
    },
    email: {
      type: String,
      trim: true,
      lowercase: true,
    },
    facilities: {
      type: [String],
      default: [],
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

// Indexes for better query performance
cinemaSchema.index({ city: 1 });
cinemaSchema.index({ isActive: 1 });

export const Cinema = model<ICinema>("Cinema",cinemaSchema);