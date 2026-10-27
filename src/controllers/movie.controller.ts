import { Request, Response } from "express";
import { MovieModel } from "../models/movie.model";

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
  } catch (error) {
    console.error("Create Movie Error:", error);
    res.status(500).json({ message: "Failed to create movie!" });
  }
};

// ===================== UPDATE MOVIE (Admin) =====================
export const updateMovie = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const updatedMovie = await MovieModel.findByIdAndUpdate(id, req.body, {
      new: true,
      runValidators: true,
    });

    if (!updatedMovie) {
      return res.status(404).json({ message: "Movie not found!" });
    }

    res.status(200).json({
      message: "Movie updated successfully!",
      data: updatedMovie,
    });
  } catch (error) {
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

    res.status(200).json({
      message: "Movie deleted successfully!",
    });
  } catch (error) {
    console.error("Delete Movie Error:", error);
    res.status(500).json({ message: "Failed to delete movie!" });
  }
};