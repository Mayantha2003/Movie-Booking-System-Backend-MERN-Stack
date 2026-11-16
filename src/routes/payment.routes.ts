import { Router } from "express";
import type { NextFunction, Request, Response } from "express";

import { processDemoPayment } from "../controllers/payment.controller";

const router = Router();

const noStore = (_req: Request, res: Response, next: NextFunction) => {
  res.set("Cache-Control", "no-store");
  next();
};

router.post("/demo", noStore, processDemoPayment);

export default router;
