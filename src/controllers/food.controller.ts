import { Request, Response } from "express";
import { Food } from "../models/food.model";
import {
  adminInputErrorStatus,
  isValidAdminObjectId,
  validateFoodInput,
} from "../utils/adminCrudInput";
import { isValidRequestObjectId, parseOptionalQueryString } from "../utils/requestValidation";

// ===================== GET ALL FOODS =====================
export const getAllFoods = async (req: Request, res: Response) => {
  const parsedCategory = parseOptionalQueryString(req.query.category);
  const allowedCategories = ["Popcorn", "Drinks", "Snacks", "Combos", "Other"];
  if (!parsedCategory.valid ||
      (parsedCategory.value && !allowedCategories.includes(parsedCategory.value))) {
    return res.status(400).json({ message: "Invalid food category." });
  }

  try {
    const filter: any = { isAvailable: true };
    if (parsedCategory.value) {
      filter.category = parsedCategory.value;
    }

    const foods = await Food.find(filter).sort({ category: 1, name: 1 });

    res.status(200).json({
      message: "Foods fetched successfully!",
      count: foods.length,
      data: foods,
    });
  } catch (error) {
    console.error("GetAllFoods Error:", error);
    res.status(500).json({ message: "Failed to fetch foods!" });
  }
};

// ===================== GET FOOD BY ID =====================
export const getFoodById = async (req: Request, res: Response) => {
  if (!isValidRequestObjectId(req.params.id)) {
    return res.status(400).json({ message: "Invalid food id." });
  }

  try {
    const food = await Food.findById(req.params.id);

    if (!food) {
      return res.status(404).json({ message: "Food not found!" });
    }

    res.status(200).json({
      message: "Success!",
      data: food,
    });
  } catch (error) {
    console.error("GetFoodById Error:", error);
    res.status(500).json({ message: "Failed to fetch food!" });
  }
};

// ===================== CREATE FOOD (Admin) =====================
export const createFood = async (req: Request, res: Response) => {
  const input = validateFoodInput(req.body, true);
  if (typeof input === "string") return res.status(400).json({ message: input });

  try {
    const food = await Food.create(input);

    res.status(201).json({
      message: "Food created successfully!",
      data: food,
    });
  } catch (error) {
    const status = adminInputErrorStatus(error);
    res.status(status).json({ message: status === 400 ? "Food data is invalid." : "Failed to create food!" });
  }
};

// ===================== UPDATE FOOD (Admin) =====================
export const updateFood = async (req: Request, res: Response) => {
  if (!isValidAdminObjectId(req.params.id)) {
    return res.status(400).json({ message: "Invalid food id." });
  }
  const input = validateFoodInput(req.body, false);
  if (typeof input === "string") return res.status(400).json({ message: input });

  try {
    const food = await Food.findByIdAndUpdate(req.params.id, { $set: input }, {
      new: true,
      runValidators: true,
    });

    if (!food) {
      return res.status(404).json({ message: "Food not found!" });
    }

    res.status(200).json({
      message: "Food updated successfully!",
      data: food,
    });
  } catch (error) {
    const status = adminInputErrorStatus(error);
    res.status(status).json({ message: status === 400 ? "Food data is invalid." : "Failed to update food!" });
  }
};

// ===================== DELETE FOOD (Admin) =====================
export const deleteFood = async (req: Request, res: Response) => {
  if (!isValidRequestObjectId(req.params.id)) {
    return res.status(400).json({ message: "Invalid food id." });
  }

  try {
    const food = await Food.findByIdAndDelete(req.params.id);

    if (!food) {
      return res.status(404).json({ message: "Food not found!" });
    }

    res.status(200).json({
      message: "Food deleted successfully!",
    });
  } catch (error) {
    console.error("DeleteFood Error:", error);
    res.status(500).json({ message: "Failed to delete food!" });
  }
};

// ===================== TOGGLE AVAILABILITY (Admin) =====================
export const toggleFoodAvailability = async (req: Request, res: Response) => {
  if (!isValidRequestObjectId(req.params.id)) {
    return res.status(400).json({ message: "Invalid food id." });
  }

  try {
    const food = await Food.findById(req.params.id);

    if (!food) {
      return res.status(404).json({ message: "Food not found!" });
    }

    food.isAvailable = !food.isAvailable;
    await food.save();

    res.status(200).json({
      message: `Food is now ${food.isAvailable ? "available" : "unavailable"}!`,
      data: food,
    });
  } catch (error) {
    console.error("ToggleFoodAvailability Error:", error);
    res.status(500).json({ message: "Failed to update food availability!" });
  }
};