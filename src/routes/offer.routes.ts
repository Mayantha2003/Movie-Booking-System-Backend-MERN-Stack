import { Router } from "express";
import {
  getAllOffers,
  getOfferByCode,
  createOffer,
  updateOffer,
  deleteOffer,
  toggleOfferStatus,
} from "../controllers/offer.controller";

import { authenticate } from "../middleware/auth";
import { restrictTo } from "../middleware/restrictTo";

const router = Router();

// Public routes
router.get("/", getAllOffers);
router.get("/code/:code", getOfferByCode);

// Admin-only routes
router.post("/", authenticate, restrictTo("ADMIN"), createOffer);
router.put("/:id", authenticate, restrictTo("ADMIN"), updateOffer);
router.delete("/:id", authenticate, restrictTo("ADMIN"), deleteOffer);
router.patch(
  "/:id/toggle",
  authenticate,
  restrictTo("ADMIN"),
  toggleOfferStatus
);

export default router;