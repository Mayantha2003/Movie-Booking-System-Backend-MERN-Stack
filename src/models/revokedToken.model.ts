import { Document, model, Schema } from "mongoose";

export interface IRevokedToken extends Document {
  tokenHash: string;
  expiresAt: Date;
}

const revokedTokenSchema = new Schema<IRevokedToken>(
  {
    tokenHash: { type: String, required: true, unique: true },
    expiresAt: { type: Date, required: true, expires: 0 },
  },
  { versionKey: false }
);

export const RevokedToken = model<IRevokedToken>(
  "RevokedToken",
  revokedTokenSchema
);
