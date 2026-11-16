import { Request, Response } from "express";
import { Screen } from "../models/screen.model";
import { Cinema } from "../models/cinema.model";
import { Showtime } from "../models/showtime.model";
import {
  adminInputErrorStatus,
  isValidAdminObjectId,
  normalizeScreenInput,
  validateScreenInput,
} from "../utils/adminCrudInput";
import {
  isValidRequestObjectId,
  parseOptionalObjectIdQuery,
  parseOptionalQueryBoolean,
} from "../utils/requestValidation";

// ===================== CREATE SCREEN =====================
export const createScreen = async (req: Request, res: Response) => {
  const parsed = validateScreenInput(req.body, true);
  if (typeof parsed === "string") return res.status(400).json({ message: parsed });
  const input = normalizeScreenInput(parsed);
  if (typeof input === "string") return res.status(400).json({ message: input });

  try {
    const cinemaExists = await Cinema.findById(input.cinema);
    if (!cinemaExists) {
      return res.status(404).json({ message: "Cinema not found!" });
    }

    const screen = await Screen.create(input);

    res.status(201).json({
      message: "Screen created successfully!",
      data: screen,
    });
  } catch (error) {
    const status = adminInputErrorStatus(error);
    res.status(status).json({
      message: status === 409 ? "A screen with this name already exists in the cinema."
        : status === 400 ? "Screen data is invalid."
          : "Failed to create screen!",
    });
  }
};

// ===================== GET ALL SCREENS =====================
export const getAllScreens = async (req: Request, res: Response) => {
  const parsedCinema = parseOptionalObjectIdQuery(req.query.cinema);
  const parsedIsActive = parseOptionalQueryBoolean(req.query.isActive);
  if (!parsedCinema.valid || !parsedIsActive.valid) {
    return res.status(400).json({ message: "Invalid screen query parameters." });
  }

  try {
    const filter: any = {};
    if (parsedCinema.value) filter.cinema = parsedCinema.value;
    if (parsedIsActive.value !== undefined) filter.isActive = parsedIsActive.value;

    const screens = await Screen.find(filter)
      .populate("cinema", "name location city")
      .sort({ name: 1 });

    res.status(200).json({
      message: "Success!",
      count: screens.length,
      data: screens,
    });
  } catch (error) {
    console.error("GetAllScreens Error:", error);
    res.status(500).json({ message: "Failed to get screens!" });
  }
};

// ===================== GET SINGLE SCREEN =====================
export const getScreenById = async (req: Request, res: Response) => {
  if (!isValidRequestObjectId(req.params.id)) {
    return res.status(400).json({ message: "Invalid screen id." });
  }

  try {
    const screen = await Screen.findById(req.params.id).populate(
      "cinema",
      "name location city"
    );

    if (!screen) {
      return res.status(404).json({ message: "Screen not found!" });
    }

    res.status(200).json({
      message: "Success!",
      data: screen,
    });
  } catch (error) {
    console.error("GetScreenById Error:", error);
    res.status(500).json({ message: "Failed to get screen!" });
  }
};

// ===================== UPDATE SCREEN =====================
export const updateScreen = async (req: Request, res: Response) => {
  if (!isValidAdminObjectId(req.params.id)) {
    return res.status(400).json({ message: "Invalid screen id." });
  }
  const parsed = validateScreenInput(req.body, false);
  if (typeof parsed === "string") return res.status(400).json({ message: parsed });

  try {
    const current = await Screen.findById(req.params.id);
    if (!current) return res.status(404).json({ message: "Screen not found!" });
    const input = normalizeScreenInput(parsed, { ...current.toObject() });
    if (typeof input === "string") return res.status(400).json({ message: input });

    const cinemaChanged =
      input.cinema !== undefined &&
      String(input.cinema) !== String(current.cinema);
    const currentSeatLayout = current.seatLayout?.map(({ row, seats }) => ({
      row,
      seats,
    })) ?? [];
    const seatingChanged =
      input.totalSeats !== current.totalSeats ||
      (input.rows !== undefined && input.rows !== current.rows) ||
      (input.seatsPerRow !== undefined &&
        input.seatsPerRow !== current.seatsPerRow) ||
      (input.seatLayout !== undefined &&
        JSON.stringify(input.seatLayout) !==
          JSON.stringify(currentSeatLayout));
    if (
      (cinemaChanged || seatingChanged) &&
      (await Showtime.exists({ screen: current._id }))
    ) {
      return res.status(409).json({
        message: "Screen cinema or seating cannot change while showtimes use it.",
      });
    }

    if (input.cinema !== undefined || current.cinema) {
      const cinemaId = input.cinema ?? String(current.cinema);
      if (!await Cinema.findById(cinemaId)) {
        return res.status(404).json({ message: "Cinema not found!" });
      }
    }

    const screen = await Screen.findByIdAndUpdate(req.params.id, { $set: input }, {
      new: true,
      runValidators: true,
    }).populate("cinema", "name location city");

    if (!screen) {
      return res.status(404).json({ message: "Screen not found!" });
    }

    res.status(200).json({
      message: "Screen updated successfully!",
      data: screen,
    });
  } catch (error) {
    const status = adminInputErrorStatus(error);
    res.status(status).json({
      message: status === 409 ? "A screen with this name already exists in the cinema."
        : status === 400 ? "Screen data is invalid."
          : "Failed to update screen!",
    });
  }
};

// ===================== DELETE SCREEN =====================
export const deleteScreen = async (req: Request, res: Response) => {
  if (!isValidRequestObjectId(req.params.id)) {
    return res.status(400).json({ message: "Invalid screen id." });
  }

  try {
    if (await Showtime.exists({ screen: req.params.id })) {
      return res.status(409).json({
        message: "Screen cannot be deleted while showtimes use it.",
      });
    }

    const screen = await Screen.findByIdAndDelete(req.params.id);

    if (!screen) {
      return res.status(404).json({ message: "Screen not found!" });
    }

    res.status(200).json({
      message: "Screen deleted successfully!",
    });
  } catch (error) {
    console.error("DeleteScreen Error:", error);
    res.status(500).json({ message: "Failed to delete screen!" });
  }
};