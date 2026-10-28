import { Request, Response } from "express";
import { Screen } from "../models/screen.model";
import { Cinema } from "../models/cinema.model";

// ===================== CREATE SCREEN =====================
export const createScreen = async (req: Request, res: Response) => {
  try {
    const { cinema } = req.body;

    const cinemaExists = await Cinema.findById(cinema);
    if (!cinemaExists) {
      return res.status(404).json({ message: "Cinema not found!" });
    }

    const screen = await Screen.create(req.body);

    res.status(201).json({
      message: "Screen created successfully!",
      data: screen,
    });
  } catch (error) {
    console.error("CreateScreen Error:", error);
    res.status(500).json({ message: "Failed to create screen!" });
  }
};

// ===================== GET ALL SCREENS =====================
export const getAllScreens = async (req: Request, res: Response) => {
  try {
    const { cinema, isActive } = req.query;

    const filter: any = {};
    if (cinema) filter.cinema = cinema;
    if (isActive !== undefined) filter.isActive = isActive === "true";

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
  try {
    const screen = await Screen.findByIdAndUpdate(req.params.id, req.body, {
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
    console.error("UpdateScreen Error:", error);
    res.status(500).json({ message: "Failed to update screen!" });
  }
};

// ===================== DELETE SCREEN =====================
export const deleteScreen = async (req: Request, res: Response) => {
  try {
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