import mongoose from "mongoose";
import { isValidRequestObjectId } from "./requestValidation";

type Input = Record<string, unknown>;

const isRecord = (value: unknown): value is Input =>
  value !== null && typeof value === "object" && !Array.isArray(value);

export const parseAdminBody = (
  body: unknown,
  allowed: readonly string[]
): Input | string => {
  if (!isRecord(body)) return "A valid JSON object is required.";
  if (Object.keys(body).some((key) => !allowed.includes(key))) {
    return "Unexpected or protected fields were provided.";
  }
  if (Object.keys(body).length === 0) return "At least one field is required.";
  return body;
};

export const adminInputErrorStatus = (error: unknown): number => {
  if (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === 11000
  ) return 409;
  if (
    error instanceof mongoose.Error.ValidationError ||
    error instanceof mongoose.Error.CastError
  ) return 400;
  return 500;
};

export const isValidAdminObjectId = (value: unknown): value is string =>
  isValidRequestObjectId(value);

const validString = (value: unknown, required = false): value is string =>
  typeof value === "string" && (!required || value.trim().length > 0);

const validNumber = (value: unknown, min: number, integer = false): value is number =>
  typeof value === "number" &&
  Number.isFinite(value) &&
  value <= Number.MAX_SAFE_INTEGER &&
  value >= min &&
  (!integer || Number.isSafeInteger(value));

const validBoolean = (value: unknown): value is boolean =>
  typeof value === "boolean";

const validDate = (value: unknown): value is string | Date => {
  if (value instanceof Date) return !Number.isNaN(value.getTime());
  if (typeof value !== "string" ||
      !/^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z)?$/.test(value)) {
    return false;
  }
  const parsed = new Date(value);
  return !Number.isNaN(parsed.getTime()) &&
    (value.includes("T") || parsed.toISOString().slice(0, 10) === value);
};

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const SCREEN_TYPES = ["Standard", "Premium", "IMAX", "4DX", "Dolby Atmos"];
const FOOD_CATEGORIES = ["Popcorn", "Drinks", "Snacks", "Combos", "Other"];
const DISCOUNT_TYPES = ["percentage", "fixed"];

export const validateCinemaInput = (
  body: unknown,
  creating: boolean
): Input | string => {
  const allowed = [
    "name", "location", "address", "city", "state", "pincode",
    "contactNumber", "email", "facilities", "isActive",
  ] as const;
  const input = parseAdminBody(body, allowed);
  if (typeof input === "string") return input;
  const required = ["name", "location", "address", "city"];
  if (creating && required.some((key) => !validString(input[key], true))) {
    return "Name, location, address and city are required strings.";
  }
  for (const key of ["name", "location", "address", "city", "state", "pincode", "contactNumber"]) {
    if (key in input && !validString(input[key], required.includes(key))) {
      return `${key} must be a valid string.`;
    }
  }
  if ("email" in input) {
    if (!validString(input.email)) return "Email must be a string.";
    const email = input.email.trim();
    if (email && !EMAIL_PATTERN.test(email)) return "A valid email address is required.";
    input.email = email.toLowerCase();
  }
  if ("facilities" in input) {
    if (!Array.isArray(input.facilities) || !input.facilities.every((v) => validString(v, true))) {
      return "Facilities must be an array of non-empty strings.";
    }
    input.facilities = input.facilities.map((v) => (v as string).trim());
  }
  if ("isActive" in input && !validBoolean(input.isActive)) {
    return "isActive must be a boolean.";
  }
  for (const key of ["name", "location", "address", "city", "state", "pincode", "contactNumber"]) {
    if (key in input) input[key] = (input[key] as string).trim();
  }
  return input;
};

export const validateScreenInput = (
  body: unknown,
  creating: boolean
): Input | string => {
  const allowed = [
    "cinema", "name", "screenType", "totalSeats", "rows", "seatsPerRow",
    "seatLayout", "isActive",
  ] as const;
  const input = parseAdminBody(body, allowed);
  if (typeof input === "string") return input;
  if (creating && (!isValidAdminObjectId(input.cinema) || !validString(input.name, true) ||
      !validNumber(input.rows, 1, true) || !validNumber(input.seatsPerRow, 1, true))) {
    return "Cinema, name, rows and seats per row are required and must be valid.";
  }
  if ("cinema" in input && !isValidAdminObjectId(input.cinema)) return "Cinema must be a valid ObjectId.";
  if ("name" in input && !validString(input.name, true)) return "Name must be a non-empty string.";
  if ("screenType" in input &&
      (!validString(input.screenType, true) || !SCREEN_TYPES.includes(input.screenType))) {
    return "Screen type is invalid.";
  }
  for (const key of ["rows", "seatsPerRow"] as const) {
    if (key in input && !validNumber(input[key], 1, true)) {
      return `${key} must be a positive integer.`;
    }
  }
  if ("totalSeats" in input && !validNumber(input.totalSeats, 1, true)) {
    return "Total seats must be a positive integer.";
  }
  if ("seatLayout" in input && input.seatLayout !== undefined) {
    if (!Array.isArray(input.seatLayout) ||
        !input.seatLayout.every((row) =>
          isRecord(row) &&
          Object.keys(row).every((key) => key === "row" || key === "seats") &&
          validString(row.row, true) &&
          validNumber(row.seats, 1, true)
        )) {
      return "Seat layout must contain valid row names and positive seat counts.";
    }
  }
  if ("isActive" in input && !validBoolean(input.isActive)) {
    return "isActive must be a boolean.";
  }
  if ("name" in input) input.name = (input.name as string).trim();
  return input;
};

export const normalizeScreenInput = (
  input: Input,
  existing?: Input
): Input | string => {
  const merged = { ...existing, ...input };
  const rows = merged.rows;
  const seatsPerRow = merged.seatsPerRow;
  if (!validNumber(rows, 1, true) || !validNumber(seatsPerRow, 1, true)) {
    return "Rows and seats per row must be positive integers.";
  }
  const dimensionsChanged = !existing ||
    input.rows !== undefined || input.seatsPerRow !== undefined;
  const hasLayout = Array.isArray(merged.seatLayout) && merged.seatLayout.length > 0;
  let totalSeats = rows * seatsPerRow;
  let seatLayout: Array<{ row: string; seats: number }> | undefined;

  if (hasLayout) {
    const layout = merged.seatLayout as Array<{ row: string; seats: number }>;
    if (layout.length !== rows) return "Seat layout row count must match rows.";
    const names = new Set<string>();
    for (const entry of layout) {
      const row = entry.row.trim().toUpperCase();
      if (names.has(row) || entry.seats > seatsPerRow) {
        return "Seat layout rows must be unique and fit within seats per row.";
      }
      names.add(row);
    }
    seatLayout = layout.map(({ row, seats }) => ({ row: row.trim().toUpperCase(), seats }));
    totalSeats = seatLayout.reduce((sum, entry) => sum + entry.seats, 0);
  } else if (dimensionsChanged) {
    seatLayout = rows <= 26
      ? Array.from({ length: rows }, (_, index) => ({
          row: String.fromCharCode(65 + index),
          seats: seatsPerRow,
        }))
      : [];
  }

  if (!Number.isSafeInteger(totalSeats) || totalSeats < 1) {
    return "Screen capacity must be a positive safe integer.";
  }
  if ("totalSeats" in input && input.totalSeats !== totalSeats) {
    return "Total seats must match the screen layout.";
  }

  const normalized: Input = { ...input, totalSeats };
  if (seatLayout !== undefined) normalized.seatLayout = seatLayout;
  return normalized;
};

export const validateShowtimeInput = (
  body: unknown,
  creating: boolean
): Input | string => {
  const allowed = [
    "movie", "cinema", "screen", "showDate", "startTime", "endTime",
    "ticketPrice", "isActive",
  ] as const;
  const input = parseAdminBody(body, allowed);
  if (typeof input === "string") return input;
  const required = ["movie", "cinema", "screen", "showDate", "startTime", "endTime", "ticketPrice"];
  if (creating && required.some((key) => !(key in input))) {
    return "Movie, cinema, screen, date, times and ticket price are required.";
  }
  for (const key of ["movie", "cinema", "screen"]) {
    if (key in input && !isValidAdminObjectId(input[key])) return `${key} must be a valid ObjectId.`;
  }
  if ("showDate" in input && !validDate(input.showDate)) return "Show date must be valid.";
  for (const key of ["startTime", "endTime"]) {
    if (key in input && (!validString(input[key], true) || !timeToMinutes(input[key]))) {
      return `${key} must be a valid time.`;
    }
  }
  if ("ticketPrice" in input && !validNumber(input.ticketPrice, 0)) {
    return "Ticket price must be a non-negative number.";
  }
  if ("isActive" in input && !validBoolean(input.isActive)) {
    return "isActive must be a boolean.";
  }
  if ("startTime" in input && "endTime" in input) {
    const start = timeToMinutes(input.startTime as string);
    const end = timeToMinutes(input.endTime as string);
    if (start === end) {
      return "End time must differ from start time.";
    }
  }
  if ("showDate" in input) input.showDate = new Date(input.showDate as string | Date);
  for (const key of ["startTime", "endTime"]) {
    if (key in input) input[key] = (input[key] as string).trim();
  }
  return input;
};

export const validateFoodInput = (
  body: unknown,
  creating: boolean
): Input | string => {
  const allowed = [
    "name", "description", "category", "price", "image",
    "isAvailable", "isVegetarian",
  ] as const;
  const input = parseAdminBody(body, allowed);
  if (typeof input === "string") return input;
  if (creating && (!validString(input.name, true) ||
      !validString(input.category, true) || !("price" in input))) {
    return "Name, category and price are required.";
  }
  if ("name" in input && !validString(input.name, true)) return "Name must be a non-empty string.";
  if ("description" in input && !validString(input.description)) return "Description must be a string.";
  if ("category" in input &&
      (!validString(input.category, true) || !FOOD_CATEGORIES.includes(input.category))) {
    return "Food category is invalid.";
  }
  if ("price" in input && !validNumber(input.price, 0)) return "Price must be a non-negative number.";
  if ("image" in input && (!validString(input.image) ||
      (input.image.trim() !== "" && !/^https?:\/\/\S+$/i.test(input.image.trim())))) {
    return "Image must be a valid HTTP or HTTPS URL.";
  }
  if ("isAvailable" in input && !validBoolean(input.isAvailable)) return "isAvailable must be a boolean.";
  if ("isVegetarian" in input && !validBoolean(input.isVegetarian)) return "isVegetarian must be a boolean.";
  for (const key of ["name", "description", "image"]) {
    if (key in input) input[key] = (input[key] as string).trim();
  }
  return input;
};

export const validateOfferInput = (
  body: unknown,
  creating: boolean
): Input | string => {
  const allowed = [
    "code", "description", "discountType", "discountValue", "minAmount",
    "maxDiscount", "validFrom", "validTo", "usageLimit", "isActive",
  ] as const;
  const input = parseAdminBody(body, allowed);
  if (typeof input === "string") return input;
  const required = ["code", "description", "discountType", "discountValue", "validFrom", "validTo"];
  if (creating && required.some((key) => !(key in input))) {
    return "Offer code, description, discount, and validity dates are required.";
  }
  if ("code" in input && (!validString(input.code, true) || !/^[A-Za-z0-9_-]+$/.test(input.code.trim()))) {
    return "Offer code must contain only letters, numbers, underscores or hyphens.";
  }
  if ("description" in input && !validString(input.description, true)) return "Description must be a non-empty string.";
  if ("discountType" in input &&
      (!validString(input.discountType, true) || !DISCOUNT_TYPES.includes(input.discountType))) {
    return "Discount type is invalid.";
  }
  if ("discountValue" in input && !validNumber(input.discountValue, 0)) {
    return "Discount value must be a non-negative number.";
  }
  for (const key of ["minAmount", "maxDiscount", "usageLimit"] as const) {
    if (input[key] === "") input[key] = null;
  }
  for (const key of ["minAmount", "maxDiscount"] as const) {
    if (key in input && input[key] !== null && !validNumber(input[key], 0)) {
      return "Offer amounts must be non-negative numbers.";
    }
  }
  if ("usageLimit" in input && input.usageLimit !== null &&
      !validNumber(input.usageLimit, 1, true)) {
    return "Usage limit must be a positive integer.";
  }
  if ("validFrom" in input && !validDate(input.validFrom)) return "Valid-from date must be valid.";
  if ("validTo" in input && !validDate(input.validTo)) return "Valid-to date must be valid.";
  if ("isActive" in input && !validBoolean(input.isActive)) return "isActive must be a boolean.";
  if (input.discountType === "percentage" &&
      typeof input.discountValue === "number" && input.discountValue > 100) {
    return "Percentage discount cannot exceed 100.";
  }
  if (input.validFrom && input.validTo &&
      new Date(input.validTo as string | Date) < new Date(input.validFrom as string | Date)) {
    return "Valid-to date must not precede valid-from date.";
  }
  if ("code" in input) input.code = (input.code as string).trim().toUpperCase();
  if ("description" in input) input.description = (input.description as string).trim();
  for (const key of ["validFrom", "validTo"]) {
    if (key in input) input[key] = new Date(input[key] as string | Date);
  }
  return input;
};

export const timeToMinutes = (value: string): number | undefined => {
  const twentyFourHour = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(value);
  if (twentyFourHour) return Number(twentyFourHour[1]) * 60 + Number(twentyFourHour[2]);
  const twelveHour = /^(0?[1-9]|1[0-2]):([0-5]\d)\s*(AM|PM)$/i.exec(value);
  if (!twelveHour) return undefined;
  const hour = Number(twelveHour[1]) % 12 + (/PM/i.test(twelveHour[3]) ? 12 : 0);
  return hour * 60 + Number(twelveHour[2]);
};
