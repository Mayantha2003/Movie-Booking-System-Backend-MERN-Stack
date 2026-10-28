import { Schema, model, Document } from "mongoose";

export interface IFood extends Document {
  name: string;
  description?: string;
  category: "Popcorn" | "Drinks" | "Snacks" | "Combos" | "Other";
  price: number;
  image?: string;
  isAvailable: boolean;
  isVegetarian?: boolean;
}

const foodSchema = new Schema<IFood>(
  {
    name: {
      type: String,
      required: [true, "Food name is required"],
      trim: true,
    },
    description: {
      type: String,
      trim: true,
    },
    category: {
      type: String,
      enum: ["Popcorn", "Drinks", "Snacks", "Combos", "Other"],
      required: true,
    },
    price: {
      type: Number,
      required: [true, "Price is required"],
      min: 0,
    },
    image: {
      type: String,
    },
    isAvailable: {
      type: Boolean,
      default: true,
    },
    isVegetarian: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  }
);

export const Food = model<IFood>("Food", foodSchema);