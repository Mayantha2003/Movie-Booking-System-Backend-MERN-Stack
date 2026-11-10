import { Document, Schema, Types, model } from "mongoose";

export type PaymentStatus = "PENDING" | "SUCCESS" | "FAILED" | "CANCELLED";

export interface IPaymentEvent {
  at: Date;
  status: PaymentStatus;
  statusCode?: number;
  note: string;
}

export interface IPayment extends Document {
  orderId: string;
  booking: Types.ObjectId;
  user?: Types.ObjectId | null;
  amount: number;
  currency: string;
  status: PaymentStatus;
  attempt: number;
  events: IPaymentEvent[];
  statusCode?: number;
  statusMessage?: string;
  method?: string;
  payherePaymentId?: string;
  paidAt?: Date;
  refundRequired: boolean;
  chargedBack: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const paymentEventSchema = new Schema<IPaymentEvent>(
  {
    at: { type: Date, required: true, default: Date.now },
    status: {
      type: String,
      enum: ["PENDING", "SUCCESS", "FAILED", "CANCELLED"],
      required: true,
    },
    statusCode: { type: Number },
    note: { type: String, required: true },
  },
  { _id: false }
);

const paymentSchema = new Schema<IPayment>(
  {
    orderId: {
      type: String,
      required: true,
      unique: true,
      uppercase: true,
      trim: true,
    },
    booking: {
      type: Schema.Types.ObjectId,
      ref: "Booking",
      required: true,
    },
    user: {
      type: Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    amount: {
      type: Number,
      required: true,
      min: 0,
    },
    currency: {
      type: String,
      required: true,
      default: "LKR",
    },
    status: {
      type: String,
      enum: ["PENDING", "SUCCESS", "FAILED", "CANCELLED"],
      default: "PENDING",
      required: true,
    },
    attempt: {
      type: Number,
      required: true,
      min: 1,
    },
    events: {
      type: [paymentEventSchema],
      default: [],
    },
    statusCode: { type: Number },
    statusMessage: { type: String },
    method: { type: String },
    payherePaymentId: { type: String },
    paidAt: { type: Date },
    refundRequired: {
      type: Boolean,
      default: false,
    },
    chargedBack: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true }
);

paymentSchema.index(
  { booking: 1, attempt: 1 },
  { unique: true, name: "unique_payment_attempt_per_booking" }
);
paymentSchema.index(
  { payherePaymentId: 1 },
  { unique: true, sparse: true, name: "unique_payhere_payment_id" }
);
paymentSchema.index({ booking: 1, status: 1 });

export const Payment = model<IPayment>("Payment", paymentSchema);
