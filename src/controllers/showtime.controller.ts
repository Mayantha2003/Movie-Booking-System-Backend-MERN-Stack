import { Request, Response } from "express";
import { Showtime } from "../models/showtime.model";
import { MovieModel } from "../models/movie.model";
import { Cinema } from "../models/cinema.model";
import { Screen } from "../models/screen.model";

// ===================== CREATE SHOWTIME =====================
export const createShowtime = async (req: Request, res: Response) => {
  try {
    const { movie, cinema, screen, showDate, startTime, endTime, ticketPrice } = req.body;

    // Check Movie exists
    const movieExists = await MovieModel.findById(movie);
    if (!movieExists) {
      return res.status(404).json({ message: "Movie not found!" });
    }

    // Check Cinema exists
    const cinemaExists = await Cinema.findById(cinema);
    if (!cinemaExists) {
      return res.status(404).json({ message: "Cinema not found!" });
    }

    // Check Screen exists
    const screenExists = await Screen.findById(screen);
    if (!screenExists) {
      return res.status(404).json({ message: "Screen not found!" });
    }

    // Screen totalSeats 
    const totalSeats = screenExists.totalSeats;

    const showtime = await Showtime.create({
      movie,
      cinema,
      screen,
      showDate,
      startTime,
      endTime,
      ticketPrice,
      totalSeats,
      availableSeats: totalSeats, // seats available
    });

    res.status(201).json({
      message: "Showtime created successfully!",
      data: showtime,
    });
  } catch (error) {
    console.error("CreateShowtime Error:", error);
    res.status(500).json({ message: "Failed to create showtime!" });
  }
};

// ===================== GET ALL SHOWTIMES =====================
export const getAllShowtimes = async (req: Request, res: Response) => {
  try {
    const { movie, cinema, screen, showDate, isActive } = req.query;

    const filter: any = {};
    if (movie) filter.movie = movie;
    if (cinema) filter.cinema = cinema;
    if (screen) filter.screen = screen;
    if (showDate) filter.showDate = new Date(showDate as string);
    if (isActive !== undefined) filter.isActive = isActive === "true";

    const showtimes = await Showtime.find(filter)
      .populate("movie", "title poster duration")
      .populate("cinema", "name location city")
      .populate("screen", "name screenType")
      .sort({ showDate: 1, startTime: 1 });

    res.status(200).json({
      message: "Success!",
      count: showtimes.length,
      data: showtimes,
    });
  } catch (error) {
    console.error("GetAllShowtimes Error:", error);
    res.status(500).json({ message: "Failed to get showtimes!" });
  }
};

// ===================== GET SINGLE SHOWTIME =====================
export const getShowtimeById = async (req: Request, res: Response) => {
  try {
    const showtime = await Showtime.findById(req.params.id)
      .populate("movie", "title poster duration genre language")
      .populate("cinema", "name location city address")
      .populate("screen", "name screenType totalSeats");

    if (!showtime) {
      return res.status(404).json({ message: "Showtime not found!" });
    }

    res.status(200).json({
      message: "Success!",
      data: showtime,
    });
  } catch (error) {
    console.error("GetShowtimeById Error:", error);
    res.status(500).json({ message: "Failed to get showtime!" });
  }
};

// ===================== GET SHOWTIMES BY MOVIE =====================
export const getShowtimesByMovie = async (req: Request, res: Response) => {
  try {
    const { date } = req.query;

    const filter: any = {
      movie: req.params.movieId,
      isActive: true,
    };

    if (date) {
      const startOfDay = new Date(date as string);
      startOfDay.setHours(0, 0, 0, 0);

      const endOfDay = new Date(date as string);
      endOfDay.setHours(23, 59, 59, 999);

      filter.showDate = { $gte: startOfDay, $lte: endOfDay };
    }

    const showtimes = await Showtime.find(filter)
      .populate("cinema", "name location city")
      .populate("screen", "name screenType")
      .sort({ showDate: 1, startTime: 1 });

    res.status(200).json({
      message: "Success!",
      count: showtimes.length,
      data: showtimes,
    });
  } catch (error) {
    console.error("GetShowtimesByMovie Error:", error);
    res.status(500).json({ message: "Failed to get showtimes!" });
  }
};

// ===================== UPDATE SHOWTIME =====================
export const updateShowtime = async (req: Request, res: Response) => {
  try {
    const showtime = await Showtime.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true,
    })
      .populate("movie", "title")
      .populate("cinema", "name")
      .populate("screen", "name");

    if (!showtime) {
      return res.status(404).json({ message: "Showtime not found!" });
    }

    res.status(200).json({
      message: "Showtime updated successfully!",
      data: showtime,
    });
  } catch (error) {
    console.error("UpdateShowtime Error:", error);
    res.status(500).json({ message: "Failed to update showtime!" });
  }
};

// ===================== DELETE SHOWTIME =====================
export const deleteShowtime = async (req: Request, res: Response) => {
  try {
    const showtime = await Showtime.findByIdAndDelete(req.params.id);

    if (!showtime) {
      return res.status(404).json({ message: "Showtime not found!" });
    }

    res.status(200).json({
      message: "Showtime deleted successfully!",
    });
  } catch (error) {
    console.error("DeleteShowtime Error:", error);
    res.status(500).json({ message: "Failed to delete showtime!" });
  }
};