import { NextFunction, Request, Response } from "express";
import multer from "multer";

const MAX_BYTES = 5 * 1024 * 1024; // 5 MB
const ALLOWED = ["image/jpeg", "image/png", "image/webp"];

// Files are kept in memory and streamed to Supabase. Nothing is written to disk.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_BYTES, files: 1 },
  fileFilter: (_req, file, cb) => {
    if (ALLOWED.includes(file.mimetype)) return cb(null, true);
    cb(new Error("INVALID_IMAGE_TYPE"));
  },
});

// Expects ONE file in the form field "image". Turns upload problems into clean 400 answers.
export const uploadSingleImage = (req: Request, res: Response, next: NextFunction) => {
  upload.single("image")(req, res, (err: unknown) => {
    if (!err) return next();

    if (err instanceof multer.MulterError) {
      const message =
        err.code === "LIMIT_FILE_SIZE"
          ? "Image must be 5 MB or smaller!"
          : "Upload the image in a single field named 'image'!";
      return res.status(400).json({ message });
    }
    if (err instanceof Error && err.message === "INVALID_IMAGE_TYPE") {
      return res.status(400).json({ message: "Only JPG, PNG or WebP images are allowed!" });
    }
    next(err);
  });
};