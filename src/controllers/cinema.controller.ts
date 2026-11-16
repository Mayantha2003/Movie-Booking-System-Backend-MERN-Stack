import { Request, Response } from "express";
import { Cinema } from "../models/cinema.model";
import { Screen } from "../models/screen.model";
import {
  adminInputErrorStatus,
  isValidAdminObjectId,
  validateCinemaInput,
} from "../utils/adminCrudInput";
import {
  isValidRequestObjectId,
  parseOptionalQueryBoolean,
  parseOptionalQueryString,
} from "../utils/requestValidation";

// ===================== CREATE CINEMA =====================
export const createCinema = async (req: Request, res: Response) => {
  const input = validateCinemaInput(req.body, true);
  if (typeof input === "string") return res.status(400).json({ message: input });

  try {
    const cinema = await Cinema.create(input);

    res.status(201).json({
      message: "Cinema created successfully!",
      data: cinema,
    });
  } catch (error) {
    const status = adminInputErrorStatus(error);
    res.status(status).json({
      message: status === 409 ? "A cinema with these unique details already exists."
        : status === 400 ? "Cinema data is invalid."
          : "Failed to create cinema!",
    });
  }
};

// ===================== GET ALL CINEMAS =====================
export const getAllCinemas = async (req: Request, res: Response) => {
  const parsedCity = parseOptionalQueryString(req.query.city);
  const parsedIsActive = parseOptionalQueryBoolean(req.query.isActive);
  if (!parsedCity.valid || !parsedIsActive.valid) {
    return res.status(400).json({ message: "Invalid cinema query parameters." });
  }

  try {
    const filter: any = {};
    if (parsedCity.value) filter.city = { $regex: parsedCity.value, $options: "i" };
    if (parsedIsActive.value !== undefined) filter.isActive = parsedIsActive.value;

    const cinemas = await Cinema.find(filter).sort({ name: 1 });

    res.status(200).json({
      message: "Success!",
      count: cinemas.length,
      data: cinemas,
    });
  } catch (error) {
    console.error("GetAllCinemas Error:", error);
    res.status(500).json({ message: "Failed to get cinemas!" });
  }
};

// ===================== GET SINGLE CINEMA =====================
export const getCinemaById = async (req: Request, res: Response) => {
  if (!isValidRequestObjectId(req.params.id)) {
    return res.status(400).json({ message: "Invalid cinema id." });
  }

  try {
    const cinema = await Cinema.findById(req.params.id);

    if (!cinema) {
      return res.status(404).json({ message: "Cinema not found!" });
    }

    res.status(200).json({
      message: "Success!",
      data: cinema,
    });
  } catch (error) {
    console.error("GetCinemaById Error:", error);
    res.status(500).json({ message: "Failed to get cinema!" });
  }
};

// ===================== UPDATE CINEMA =====================
export const updateCinema = async (req: Request, res: Response) => {
  if (!isValidAdminObjectId(req.params.id)) {
    return res.status(400).json({ message: "Invalid cinema id." });
  }
  const input = validateCinemaInput(req.body, false);
  if (typeof input === "string") return res.status(400).json({ message: input });

  try {
    const cinema = await Cinema.findByIdAndUpdate(req.params.id, { $set: input }, {
      new: true,
      runValidators: true,
    });

    if (!cinema) {
      return res.status(404).json({ message: "Cinema not found!" });
    }

    res.status(200).json({
      message: "Cinema updated successfully!",
      data: cinema,
    });
  } catch (error) {
    const status = adminInputErrorStatus(error);
    res.status(status).json({
      message: status === 409 ? "A cinema with these unique details already exists."
        : status === 400 ? "Cinema data is invalid."
          : "Failed to update cinema!",
    });
  }
};

// ===================== DELETE CINEMA =====================
export const deleteCinema = async (req: Request, res: Response) => {
  if (!isValidRequestObjectId(req.params.id)) {
    return res.status(400).json({ message: "Invalid cinema id." });
  }

  try {
    const cinema = await Cinema.findByIdAndDelete(req.params.id);

    if (!cinema) {
      return res.status(404).json({ message: "Cinema not found!" });
    }

    await Screen.deleteMany({ cinema: req.params.id });

    res.status(200).json({
      message: "Cinema and related screens deleted successfully!",
    });
  } catch (error) {
    console.error("DeleteCinema Error:", error);
    res.status(500).json({ message: "Failed to delete cinema!" });
  }
};

// ===================== GET SCREENS BY CINEMA =====================
export const getScreensByCinema = async (req: Request, res: Response) => {
  if (!isValidRequestObjectId(req.params.id)) {
    return res.status(400).json({ message: "Invalid cinema id." });
  }

  try {
    const screens = await Screen.find({
      cinema: req.params.id,
      isActive: true,
    }).sort({ name: 1 });

    res.status(200).json({
      message: "Success!",
      count: screens.length,
      data: screens,
    });
  } catch (error) {
    console.error("GetScreensByCinema Error:", error);
    res.status(500).json({ message: "Failed to get screens!" });
  }
};