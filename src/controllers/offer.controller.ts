import { Request, Response } from "express";
import { Offer } from "../models/offer.model";

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
  try {
    const {
      code,
      description,
      discountType,
      discountValue,
      minAmount,
      maxDiscount,
      validFrom,
      validTo,
      usageLimit,
    } = req.body;

    if (!code || !description || !discountType || !discountValue || !validFrom || !validTo) {
      return res.status(400).json({ message: "Required fields are missing!" });
    }

    const existing = await Offer.findOne({ code: code.toUpperCase() });
    if (existing) {
      return res.status(400).json({ message: "Offer code already exists!" });
    }

    const offer = await Offer.create({
      code: code.toUpperCase(),
      description,
      discountType,
      discountValue,
      minAmount: minAmount || 0,
      maxDiscount,
      validFrom,
      validTo,
      usageLimit,
    });

    res.status(201).json({
      message: "Offer created successfully!",
      data: offer,
    });
  } catch (error) {
    console.error("CreateOffer Error:", error);
    res.status(500).json({ message: "Failed to create offer!" });
  }
};

// ===================== UPDATE OFFER (Admin) =====================
export const updateOffer = async (req: Request, res: Response) => {
  try {
    const offer = await Offer.findByIdAndUpdate(req.params.id, req.body, {
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
    console.error("UpdateOffer Error:", error);
    res.status(500).json({ message: "Failed to update offer!" });
  }
};

// ===================== DELETE OFFER (Admin) =====================
export const deleteOffer = async (req: Request, res: Response) => {
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