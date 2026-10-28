import { Router } from "express";
import {
  getAllOffers,
  getOfferByCode,
  createOffer,
  updateOffer,
  deleteOffer,
  toggleOfferStatus,
} from "../controllers/offer.controller";
// import { authenticate } from "../middleware/auth";
// import { isAdmin } from "../middleware/admin";

const router = Router();

// ===================== PUBLIC ROUTES =====================
router.get("/", getAllOffers);
router.get("/code/:code", getOfferByCode);

// ===================== ADMIN ROUTES =====================
router.post("/", createOffer);
router.put("/:id", updateOffer);
router.delete("/:id", deleteOffer);
router.patch("/:id/toggle", toggleOfferStatus);

export default router;