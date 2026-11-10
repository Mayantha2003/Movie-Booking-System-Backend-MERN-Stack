import express, { Router } from "express";
import type { NextFunction, Request, Response } from "express";
import {
  createCheckout,
  getPaymentStatus,
  handleNotify,
} from "../controllers/payment.controller";

const router = Router();

const noStore = (_req: Request, res: Response, next: NextFunction) => {
  res.set("Cache-Control", "no-store");
  next();
};

router.post("/checkout", noStore, createCheckout);
router.post(
  "/notify",
  express.urlencoded({ extended: false, limit: "10kb" }),
  handleNotify
);
router.get("/status/:orderId", noStore, getPaymentStatus);

export default router;
