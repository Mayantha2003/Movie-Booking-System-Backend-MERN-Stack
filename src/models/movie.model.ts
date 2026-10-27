import { Document, model, Schema } from "mongoose";

export interface IMovie extends Document {
  title: string;
  description: string;
  genre: string[];
  language: string;
  duration: number;
  release_date: Date;
  status: "now_showing" | "coming_soon";
  poster: string;
  banner?: string;
  trailer_url?: string;
  cast: string[];
  director: string;
  rating?: number;
}

const movieSchema = new Schema<IMovie>(
  {
    title: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      required: true,
    },
    genre: {
      type: [String],
      required: true,
    },
    language: {
      type: String,
      required: true,
    },
    duration: {
      type: Number,
      required: true,
    },
    release_date: {
      type: Date,
      required: true,
    },
    status: {
      type: String,
      enum: ["now_showing", "coming_soon"],
      default: "coming_soon",
    },
    poster: {
      type: String,
      required: true,
    },
    banner: {
      type: String,
    },
    trailer_url: {
      type: String,
    },
    cast: {
      type: [String],
      default: [],
    },
    director: {
      type: String,
      required: true,
    },
    rating: {
      type: Number,
      min: 0,
      max: 10,
    },
  },
  {
    timestamps: true,
  }
);

export const MovieModel = model<IMovie>("Movie", movieSchema);