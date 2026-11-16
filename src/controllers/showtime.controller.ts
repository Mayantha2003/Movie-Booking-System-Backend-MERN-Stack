import { Request, Response } from "express";
import { Showtime } from "../models/showtime.model";
import { Booking } from "../models/booking.model";
import { MovieModel } from "../models/movie.model";
import { Cinema } from "../models/cinema.model";
import { Screen } from "../models/screen.model";
import {
  adminInputErrorStatus,
  isValidAdminObjectId,
  validateShowtimeInput,
} from "../utils/adminCrudInput";
import {
  isValidRequestObjectId,
  parseOptionalDateQuery,
  parseOptionalObjectIdQuery,
  parseOptionalQueryBoolean,
} from "../utils/requestValidation";

// ===================== CREATE SHOWTIME =====================
export const createShowtime = async (req: Request, res: Response) => {
  const input = validateShowtimeInput(req.body, true);
  if (typeof input === "string") return res.status(400).json({ message: input });

  try {
    const movieExists = await MovieModel.findById(input.movie);
    if (!movieExists) {
      return res.status(404).json({ message: "Movie not found!" });
    }

    const cinemaExists = await Cinema.findById(input.cinema);
    if (!cinemaExists) {
      return res.status(404).json({ message: "Cinema not found!" });
    }

    const screenExists = await Screen.findById(input.screen);
    if (!screenExists) {
      return res.status(404).json({ message: "Screen not found!" });
    }
    if (String(screenExists.cinema) !== String(input.cinema)) {
      return res.status(400).json({ message: "The selected screen does not belong to the selected cinema." });
    }

    const totalSeats = screenExists.totalSeats;

    const showtime = await Showtime.create({
      ...input,
      totalSeats,
      availableSeats: totalSeats,
    });

    res.status(201).json({
      message: "Showtime created successfully!",
      data: showtime,
    });
  } catch (error) {
    const status = adminInputErrorStatus(error);
    res.status(status).json({
      message: status === 400 ? "Showtime data is invalid." : "Failed to create showtime!",
    });
  }
};

// ===================== GET ALL SHOWTIMES =====================
export const getAllShowtimes = async (req: Request, res: Response) => {
  const parsedMovie = parseOptionalObjectIdQuery(req.query.movie);
  const parsedCinema = parseOptionalObjectIdQuery(req.query.cinema);
  const parsedScreen = parseOptionalObjectIdQuery(req.query.screen);
  const parsedDate = parseOptionalDateQuery(req.query.showDate);
  const parsedIsActive = parseOptionalQueryBoolean(req.query.isActive);
  if (
    !parsedMovie.valid ||
    !parsedCinema.valid ||
    !parsedScreen.valid ||
    !parsedDate.valid ||
    !parsedIsActive.valid
  ) {
    return res.status(400).json({ message: "Invalid showtime query parameters." });
  }

  try {
    const filter: any = {};
    if (parsedMovie.value) filter.movie = parsedMovie.value;
    if (parsedCinema.value) filter.cinema = parsedCinema.value;
    if (parsedScreen.value) filter.screen = parsedScreen.value;
    if (parsedDate.value) filter.showDate = parsedDate.value;
    if (parsedIsActive.value !== undefined) filter.isActive = parsedIsActive.value;

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
  if (!isValidRequestObjectId(req.params.id)) {
    return res.status(400).json({ message: "Invalid showtime id." });
  }

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
  if (!isValidRequestObjectId(req.params.movieId)) {
    return res.status(400).json({ message: "Invalid movie id." });
  }
  const parsedDate = parseOptionalDateQuery(req.query.date);
  if (!parsedDate.valid) {
    return res.status(400).json({ message: "Invalid date parameter." });
  }

  try {
    const filter: any = {
      movie: req.params.movieId,
      isActive: true,
    };

    if (parsedDate.value) {
      const startOfDay = new Date(parsedDate.value);
      startOfDay.setHours(0, 0, 0, 0);

      const endOfDay = new Date(parsedDate.value);
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
  if (!isValidAdminObjectId(req.params.id)) {
    return res.status(400).json({ message: "Invalid showtime id." });
  }
  const input = validateShowtimeInput(req.body, false);
  if (typeof input === "string") return res.status(400).json({ message: input });

  try {
    const current = await Showtime.findById(req.params.id);
    if (!current) return res.status(404).json({ message: "Showtime not found!" });

    const currentLinks = {
      movie: String(current.movie),
      cinema: String(current.cinema),
      screen: String(current.screen),
    };
    for (const key of ["movie", "cinema", "screen"] as const) {
      if (input[key] !== undefined && String(input[key]) !== currentLinks[key]) {
        return res.status(400).json({ message: "Showtime movie, cinema and screen assignments cannot be changed after creation." });
      }
    }

    const merged = validateShowtimeInput({
      movie: currentLinks.movie,
      cinema: currentLinks.cinema,
      screen: currentLinks.screen,
      showDate: input.showDate ?? current.showDate,
      startTime: input.startTime ?? current.startTime,
      endTime: input.endTime ?? current.endTime,
      ticketPrice: input.ticketPrice ?? current.ticketPrice,
      ...("isActive" in input ? { isActive: input.isActive } : {}),
    }, true);
    if (typeof merged === "string") return res.status(400).json({ message: merged });

    const movieExists = await MovieModel.findById(current.movie);
    const cinemaExists = await Cinema.findById(current.cinema);
    const screenExists = await Screen.findById(current.screen);
    if (!movieExists || !cinemaExists || !screenExists) {
      return res.status(400).json({ message: "Showtime references must point to existing records." });
    }
    if (String(screenExists.cinema) !== currentLinks.cinema) {
      return res.status(400).json({ message: "The selected screen does not belong to the selected cinema." });
    }

    const showtime = await Showtime.findByIdAndUpdate(req.params.id, { $set: input }, {
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
    const status = adminInputErrorStatus(error);
    res.status(status).json({
      message: status === 400 ? "Showtime data is invalid." : "Failed to update showtime!",
    });
  }
};

// ===================== DELETE SHOWTIME =====================
export const deleteShowtime = async (req: Request, res: Response) => {
  if (!isValidRequestObjectId(req.params.id)) {
    return res.status(400).json({ message: "Invalid showtime id." });
  }

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

// ===================== GET BOOKED SEATS FOR A SHOWTIME =====================
export const getBookedSeats = async (req: Request, res: Response) => {
  if (!isValidRequestObjectId(req.params.id)) {
    return res.status(400).json({ message: "Invalid showtime id!" });
  }

  try {
    const id = req.params.id as string;

    const showtime = await Showtime.findById(id).select(
      "totalSeats availableSeats"
    );

    if (!showtime) {
      return res.status(404).json({ message: "Showtime not found!" });
    }

    // Cancelled bookings release their seats, so they are excluded
    const bookings = await Booking.find({
      showtime: showtime._id,
      bookingStatus: { $ne: "Cancelled" },
    })
      .select("seats")
      .lean();

    // De-duplicate by seatId (defensive) and keep a stable A1, A2, B1... order
    const seatMap = new Map<
      string,
      { row: string; seatNumber: number; seatId: string }
    >();

    for (const booking of bookings) {
      for (const seat of booking.seats) {
        seatMap.set(seat.seatId, {
          row: seat.row,
          seatNumber: seat.seatNumber,
          seatId: seat.seatId,
        });
      }
    }

    const bookedSeats = [...seatMap.values()].sort(
      (a, b) => a.row.localeCompare(b.row) || a.seatNumber - b.seatNumber
    );

    res.status(200).json({
      message: "Success!",
      count: bookedSeats.length,
      data: {
        showtimeId: showtime._id,
        totalSeats: showtime.totalSeats,
        availableSeats: showtime.availableSeats,
        bookedSeats,
        bookedSeatIds: bookedSeats.map((s) => s.seatId),
      },
    });
  } catch (error) {
    console.error("GetBookedSeats Error:", error);
    res.status(500).json({ message: "Failed to get booked seats!" });
  }
};