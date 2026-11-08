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

const HTTP_URL = /^https?:\/\/\S+$/i;
const YOUTUBE_URL = /^https?:\/\/(www\.|m\.)?(youtube\.com|youtu\.be|youtube-nocookie\.com)\/\S+$/i;

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
    // Full PUBLIC image URL (Supabase Storage), e.g. https://xyz.supabase.co/storage/v1/object/public/movie-posters/posters/abc.jpg
    poster: {
      type: String,
      required: true,
      trim: true,
      match: [HTTP_URL, "Poster must be a full http(s) link"],
    },
    banner: {
      type: String,
      trim: true,
      match: [HTTP_URL, "Banner must be a full http(s) link"],
    },
    // YouTube link, e.g. https://www.youtube.com/watch?v=XXXXXXXXXXX or https://youtu.be/XXXXXXXXXXX
    trailer_url: {
      type: String,
      trim: true,
      match: [YOUTUBE_URL, "Trailer must be a YouTube link"],
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