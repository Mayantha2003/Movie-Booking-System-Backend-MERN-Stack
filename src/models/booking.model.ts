import { Schema , model , Document, Types } from "mongoose";

export interface IGuestInfo {
  name: string;
  email: string;
  phone: string;
}

export interface IBookedSeat {
  row: string;
  seatNumber: number;
  seatId: string; // e.g. "A-5"
}

export interface IBooking extends Document {
  bookingCode: string;                    // e.g. "BK-8F3A2C"
  user?: Types.ObjectId;                  // Logged-in user (optional)
  guestInfo?: IGuestInfo;                 // Guest details (optional)
  showtime: Types.ObjectId;
  movie: Types.ObjectId;
  cinema: Types.ObjectId;
  screen: Types.ObjectId;
  seats: IBookedSeat[];
  totalSeats: number;
  ticketPrice: number;
  totalAmount: number;
  foodItems?: {
    food: Types.ObjectId;
    quantity: number;
    price: number;
  }[];
  foodTotal?: number;
  offer?: Types.ObjectId;
  discountAmount?: number;
  finalAmount: number;
  paymentStatus: "Pending" | "Paid" | "Failed" | "Refunded";
  bookingStatus: "Confirmed" | "Cancelled" | "Completed";
  bookedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const bookingSchema = new Schema<IBooking>(
  {
    bookingCode: {
      type: String,
      required: true,
      unique: true,
      uppercase: true,
    },
    user: {
        type: Schema.Types.ObjectId,
        ref: "User",        
        default: null,
},
    guestInfo: {
      name: { type: String, trim: true },
      email: { type: String, trim: true, lowercase: true },
      phone: { type: String, trim: true },
    },
    showtime: {
      type: Schema.Types.ObjectId,
      ref: "Showtime",
      required: [true, "Showtime is required"],
    },
    movie: {
      type: Schema.Types.ObjectId,
      ref: "Movie",
      required: true,
    },
    cinema: {
      type: Schema.Types.ObjectId,
      ref: "Cinema",
      required: true,
    },
    screen: {
      type: Schema.Types.ObjectId,
      ref: "Screen",
      required: true,
    },
    seats: [
      {
        row: { type: String, required: true },
        seatNumber: { type: Number, required: true },
        seatId: { type: String, required: true },
      },
    ],
    totalSeats: {
      type: Number,
      required: true,
      min: 1,
    },
    ticketPrice: {
      type: Number,
      required: true,
    },
    totalAmount: {
      type: Number,
      required: true,
    },
    foodItems: [
      {
        food: { type: Schema.Types.ObjectId, ref: "Food" },
        quantity: { type: Number, default: 1 },
        price: { type: Number },
      },
    ],
    foodTotal: {
      type: Number,
      default: 0,
    },
    offer: {
      type: Schema.Types.ObjectId,
      ref: "Offer",
      default: null,
    },
    discountAmount: {
      type: Number,
      default: 0,
    },
    finalAmount: {
      type: Number,
      required: true,
    },
    paymentStatus: {
      type: String,
      enum: ["Pending", "Paid", "Failed", "Refunded"],
      default: "Pending",
    },
    bookingStatus: {
      type: String,
      enum: ["Confirmed", "Cancelled", "Completed"],
      default: "Confirmed",
    },
    bookedAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
  }
);

// Indexes
bookingSchema.index({ user: 1 });
bookingSchema.index({ "guestInfo.email": 1 });
bookingSchema.index({ showtime: 1 });
bookingSchema.index({ bookingStatus: 1 });

export const Booking = model<IBooking>("Booking", bookingSchema);