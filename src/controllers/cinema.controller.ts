import { Request, Response } from "express";
import { Cinema } from "../models/cinema.model";
import { Screen } from "../models/screen.model";

// ===================== CREATE CINEMA =====================
export const createCinema = async (req: Request, res: Response) => {
  try {
    const cinema = await Cinema.create(req.body);

    res.status(201).json({
      message: "Cinema created successfully!",
      data: cinema,
    });
  } catch (error) {
    console.error("CreateCinema Error:", error);
    res.status(500).json({ message: "Failed to create cinema!" });
  }
};

// ===================== GET ALL CINEMAS =====================
export const getAllCinemas = async (req: Request, res: Response) => {
  try {
    const { city, isActive } = req.query;

    const filter: any = {};
    if (city) filter.city = { $regex: city as string, $options: "i" };
    if (isActive !== undefined) filter.isActive = isActive === "true";

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
  try {
    const cinema = await Cinema.findByIdAndUpdate(req.params.id, req.body, {
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
    console.error("UpdateCinema Error:", error);
    res.status(500).json({ message: "Failed to update cinema!" });
  }
};

// ===================== DELETE CINEMA =====================
export const deleteCinema = async (req: Request, res: Response) => {
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