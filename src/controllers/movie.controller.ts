import { Request, Response } from "express";
import { MovieModel } from "../models/movie.model";
import { detectImageType, uploadImage, deleteImageByUrl } from "../utils/storage";

const YOUTUBE_URL = /^https?:\/\/(www\.|m\.)?(youtube\.com|youtu\.be|youtube-nocookie\.com)\/\S+$/i;
const isBlankOrYouTube = (v: unknown) => v === undefined || v === null || v === "" || (typeof v === "string" && YOUTUBE_URL.test(v.trim()));

const validationMessage = (error: any, fallback: string) =>
  Object.values(error.errors as Record<string, any>)[0]?.message || fallback;

// ===================== GET NOW SHOWING =====================
export const getNowShowing = async (req: Request, res: Response) => {
  try {
    const movies = await MovieModel.find({ status: "now_showing" }).sort({
      createdAt: -1,
    });

    res.status(200).json({
      message: "Now showing movies fetched successfully!",
      data: movies,
    });
  } catch (error) {
    console.error("Get Now Showing Error:", error);
    res.status(500).json({ message: "Failed to fetch now showing movies!" });
  }
};

// ===================== GET COMING SOON =====================
export const getComingSoon = async (req: Request, res: Response) => {
  try {
    const movies = await MovieModel.find({ status: "coming_soon" }).sort({
      release_date: 1,
    });

    res.status(200).json({
      message: "Coming soon movies fetched successfully!",
      data: movies,
    });
  } catch (error) {
    console.error("Get Coming Soon Error:", error);
    res.status(500).json({ message: "Failed to fetch coming soon movies!" });
  }
};

// ===================== GET SINGLE MOVIE =====================
export const getMovieById = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const movie = await MovieModel.findById(id);

    if (!movie) {
      return res.status(404).json({ message: "Movie not found!" });
    }

    res.status(200).json({
      message: "Movie fetched successfully!",
      data: movie,
    });
  } catch (error) {
    console.error("Get Movie By Id Error:", error);
    res.status(500).json({ message: "Failed to fetch movie!" });
  }
};

// ===================== CREATE MOVIE (Admin) =====================
export const createMovie = async (req: Request, res: Response) => {
  try {
    const {
      title,
      description,
      genre,
      language,
      duration,
      release_date,
      status,
      poster,
      banner,
      trailer_url,
      cast,
      director,
      rating,
    } = req.body;

    // Simple validation
    if (!title || !description || !genre || !language || !duration || !release_date || !poster || !director) {
      return res.status(400).json({ message: "Required fields are missing!" });
    }

    if (!isBlankOrYouTube(trailer_url)) {
      return res.status(400).json({ message: "Trailer must be a YouTube link!" });
    }

    const newMovie = await MovieModel.create({
      title,
      description,
      genre,
      language,
      duration,
      release_date,
      status: status || "coming_soon",
      poster,
      banner,
      trailer_url,
      cast,
      director,
      rating,
    });

    res.status(201).json({
      message: "Movie created successfully!",
      data: newMovie,
    });
  } catch (error: any) {
    if (error?.name === "ValidationError") {
      return res.status(400).json({ message: validationMessage(error, "Invalid movie data!") });
    }
    console.error("Create Movie Error:", error);
    res.status(500).json({ message: "Failed to create movie!" });
  }
};

// ===================== UPDATE MOVIE (Admin) =====================
export const updateMovie = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    if (!isBlankOrYouTube(req.body.trailer_url)) {
      return res.status(400).json({ message: "Trailer must be a YouTube link!" });
    }

    const existing = await MovieModel.findById(id);
    if (!existing) {
      return res.status(404).json({ message: "Movie not found!" });
    }

    const updatedMovie = await MovieModel.findByIdAndUpdate(id, req.body, {
      new: true,
      runValidators: true,
    });

    if (!updatedMovie) {
      return res.status(404).json({ message: "Movie not found!" });
    }

    // The image was replaced: remove the old file from storage (ignored if it is not ours).
    if (typeof req.body.poster === "string" && req.body.poster !== existing.poster) {
      void deleteImageByUrl(existing.poster);
    }
    if (typeof req.body.banner === "string" && req.body.banner !== existing.banner) {
      void deleteImageByUrl(existing.banner);
    }

    res.status(200).json({
      message: "Movie updated successfully!",
      data: updatedMovie,
    });
  } catch (error: any) {
    if (error?.name === "ValidationError") {
      return res.status(400).json({ message: validationMessage(error, "Invalid movie data!") });
    }
    console.error("Update Movie Error:", error);
    res.status(500).json({ message: "Failed to update movie!" });
  }
};

// ===================== DELETE MOVIE (Admin) =====================
export const deleteMovie = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const deletedMovie = await MovieModel.findByIdAndDelete(id);

    if (!deletedMovie) {
      return res.status(404).json({ message: "Movie not found!" });
    }

    void deleteImageByUrl(deletedMovie.poster);
    void deleteImageByUrl(deletedMovie.banner);

    res.status(200).json({
      message: "Movie deleted successfully!",
    });
  } catch (error) {
    console.error("Delete Movie Error:", error);
    res.status(500).json({ message: "Failed to delete movie!" });
  }
};

// ===================== UPLOAD MOVIE IMAGE (Admin) =====================
// POST /api/movies/upload-image?kind=poster|banner   (multipart, field name "image")
// Returns the full public URL. The admin form puts it into the movie's poster / banner field.
export const uploadMovieImage = async (req: Request, res: Response) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: "No image uploaded! Send it in the 'image' field." });
    }

    const type = detectImageType(req.file.buffer);
    if (!type) {
      return res.status(400).json({ message: "The file is not a valid JPG, PNG or WebP image!" });
    }

    const folder = req.query.kind === "banner" ? "banners" : "posters";
    const { url, path } = await uploadImage(req.file.buffer, type, folder);

    res.status(201).json({
      message: "Image uploaded successfully!",
      data: { url, path },
    });
  } catch (error: any) {
    console.error("Upload Movie Image Error:", error);
    const notConfigured = String(error?.message).includes("not configured");
    res.status(notConfigured ? 500 : 502).json({
      message: notConfigured ? "Image storage is not configured on the server!" : "Failed to upload the image. Please try again.",
    });
  }
};