import { Request, Response } from "express";
import { Offer } from "../models/offer.model";
import {
  adminInputErrorStatus,
  isValidAdminObjectId,
  validateOfferInput,
} from "../utils/adminCrudInput";
import { isValidRequestObjectId } from "../utils/requestValidation";

// ===================== GET ALL OFFERS =====================
export const getAllOffers = async (req: Request, res: Response) => {
  try {
    const offers = await Offer.find({ isActive: true }).sort({ createdAt: -1 });

    res.status(200).json({
      message: "Offers fetched successfully!",
      count: offers.length,
      data: offers,
    });
  } catch (error) {
    console.error("GetAllOffers Error:", error);
    res.status(500).json({ message: "Failed to fetch offers!" });
  }
};

// ===================== GET OFFER BY CODE =====================
export const getOfferByCode = async (req: Request, res: Response) => {
  try {
    const code = (req.params.code as string).toUpperCase();

    const offer = await Offer.findOne({ code, isActive: true });

    if (!offer) {
      return res.status(404).json({ message: "Invalid or expired offer code!" });
    }

    // Check validity dates
    const now = new Date();
    if (now < offer.validFrom || now > offer.validTo) {
      return res.status(400).json({ message: "This offer is not valid at the moment!" });
    }

    // Check usage limit
    if (offer.usageLimit && offer.usedCount >= offer.usageLimit) {
      return res.status(400).json({ message: "This offer has reached its usage limit!" });
    }

    res.status(200).json({
      message: "Offer is valid!",
      data: offer,
    });
  } catch (error) {
    console.error("GetOfferByCode Error:", error);
    res.status(500).json({ message: "Failed to validate offer!" });
  }
};

// ===================== CREATE OFFER (Admin) =====================
export const createOffer = async (req: Request, res: Response) => {
  const input = validateOfferInput(req.body, true);
  if (typeof input === "string") return res.status(400).json({ message: input });

  try {
    const existing = await Offer.findOne({ code: input.code as string });
    if (existing) {
      return res.status(409).json({ message: "Offer code already exists." });
    }

    const offer = await Offer.create(input);

    res.status(201).json({
      message: "Offer created successfully!",
      data: offer,
    });
  } catch (error) {
    const status = adminInputErrorStatus(error);
    res.status(status).json({
      message: status === 409 ? "Offer code already exists."
        : status === 400 ? "Offer data is invalid."
          : "Failed to create offer!",
    });
  }
};

// ===================== UPDATE OFFER (Admin) =====================
export const updateOffer = async (req: Request, res: Response) => {
  if (!isValidAdminObjectId(req.params.id)) {
    return res.status(400).json({ message: "Invalid offer id." });
  }
  const input = validateOfferInput(req.body, false);
  if (typeof input === "string") return res.status(400).json({ message: input });

  try {
    const current = await Offer.findById(req.params.id);
    if (!current) return res.status(404).json({ message: "Offer not found!" });
    const currentState = current.toObject();
    const merged = validateOfferInput({
      code: input.code ?? currentState.code,
      description: input.description ?? currentState.description,
      discountType: input.discountType ?? currentState.discountType,
      discountValue: input.discountValue ?? currentState.discountValue,
      validFrom: input.validFrom ?? currentState.validFrom,
      validTo: input.validTo ?? currentState.validTo,
      ...(input.minAmount !== undefined || currentState.minAmount !== undefined
        ? { minAmount: input.minAmount !== undefined ? input.minAmount : currentState.minAmount }
        : {}),
      ...(input.maxDiscount !== undefined || currentState.maxDiscount !== undefined
        ? { maxDiscount: input.maxDiscount !== undefined ? input.maxDiscount : currentState.maxDiscount }
        : {}),
      ...(input.usageLimit !== undefined || currentState.usageLimit !== undefined
        ? { usageLimit: input.usageLimit !== undefined ? input.usageLimit : currentState.usageLimit }
        : {}),
      ...(input.isActive !== undefined || currentState.isActive !== undefined
        ? { isActive: input.isActive ?? currentState.isActive }
        : {}),
    }, true);
    if (typeof merged === "string") return res.status(400).json({ message: merged });
    if (input.code && input.code !== current.code) {
      const existing = await Offer.findOne({ code: input.code as string, _id: { $ne: current._id } });
      if (existing) return res.status(409).json({ message: "Offer code already exists." });
    }

    const set = { ...input };
    const unset: Record<string, 1> = {};
    for (const key of ["minAmount", "maxDiscount", "usageLimit"] as const) {
      if (set[key] === null) {
        delete set[key];
        unset[key] = 1;
      }
    }
    const offer = await Offer.findByIdAndUpdate(req.params.id, {
      ...(Object.keys(set).length ? { $set: set } : {}),
      ...(Object.keys(unset).length ? { $unset: unset } : {}),
    }, {
      new: true,
      runValidators: true,
    });

    if (!offer) {
      return res.status(404).json({ message: "Offer not found!" });
    }

    res.status(200).json({
      message: "Offer updated successfully!",
      data: offer,
    });
  } catch (error) {
    const status = adminInputErrorStatus(error);
    res.status(status).json({
      message: status === 409 ? "Offer code already exists."
        : status === 400 ? "Offer data is invalid."
          : "Failed to update offer!",
    });
  }
};

// ===================== DELETE OFFER (Admin) =====================
export const deleteOffer = async (req: Request, res: Response) => {
  if (!isValidRequestObjectId(req.params.id)) {
    return res.status(400).json({ message: "Invalid offer id." });
  }

  try {
    const offer = await Offer.findByIdAndDelete(req.params.id);

    if (!offer) {
      return res.status(404).json({ message: "Offer not found!" });
    }

    res.status(200).json({
      message: "Offer deleted successfully!",
    });
  } catch (error) {
    console.error("DeleteOffer Error:", error);
    res.status(500).json({ message: "Failed to delete offer!" });
  }
};

// ===================== TOGGLE OFFER STATUS (Admin) =====================
export const toggleOfferStatus = async (req: Request, res: Response) => {
  if (!isValidRequestObjectId(req.params.id)) {
    return res.status(400).json({ message: "Invalid offer id." });
  }

  try {
    const offer = await Offer.findById(req.params.id);

    if (!offer) {
      return res.status(404).json({ message: "Offer not found!" });
    }

    offer.isActive = !offer.isActive;
    await offer.save();

    res.status(200).json({
      message: `Offer is now ${offer.isActive ? "active" : "inactive"}!`,
      data: offer,
    });
  } catch (error) {
    console.error("ToggleOfferStatus Error:", error);
    res.status(500).json({ message: "Failed to update offer status!" });
  }
};