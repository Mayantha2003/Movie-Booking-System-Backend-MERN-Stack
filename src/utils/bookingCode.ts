import { randomInt } from "crypto";

const BOOKING_CODE_CHARACTERS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const BOOKING_CODE_PATTERN =
  /^BK-(?:[A-HJ-NP-Z2-9]{6}|[A-HJ-NP-Z2-9]{26})$/i;

export const generateBookingCode = (): string => {
  let code = "BK-";
  for (let i = 0; i < 26; i++) {
    code += BOOKING_CODE_CHARACTERS.charAt(
      randomInt(BOOKING_CODE_CHARACTERS.length)
    );
  }
  return code;
};

export const normalizeBookingCode = (value: unknown): string | null => {
  if (typeof value !== "string") return null;

  const code = value.trim().toUpperCase();
  return BOOKING_CODE_PATTERN.test(code) ? code : null;
};