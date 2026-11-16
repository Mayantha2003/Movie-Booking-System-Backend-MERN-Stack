import mongoose from "mongoose";

export const isValidRequestObjectId = (value: unknown): value is string =>
  typeof value === "string" &&
  /^[a-f\d]{24}$/i.test(value) &&
  mongoose.Types.ObjectId.isValid(value);

export const isValidRequestObjectIdArray = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every(isValidRequestObjectId);

export const parseOptionalQueryString = (
  value: unknown
): { valid: boolean; value?: string } => {
  if (value === undefined) return { valid: true };
  if (typeof value !== "string") return { valid: false };
  const normalized = value.trim();
  return { valid: true, ...(normalized ? { value: normalized } : {}) };
};

export const parseOptionalQueryBoolean = (
  value: unknown
): { valid: boolean; value?: boolean } => {
  if (value === undefined || value === "") return { valid: true };
  if (value === "true") return { valid: true, value: true };
  if (value === "false") return { valid: true, value: false };
  return { valid: false };
};

export const parseOptionalObjectIdQuery = (
  value: unknown
): { valid: boolean; value?: string } => {
  const parsed = parseOptionalQueryString(value);
  if (!parsed.valid) return { valid: false };
  if (parsed.value === undefined) return { valid: true };
  return isValidRequestObjectId(parsed.value)
    ? { valid: true, value: parsed.value }
    : { valid: false };
};

export const parseOptionalDateQuery = (
  value: unknown
): { valid: boolean; value?: Date } => {
  const parsed = parseOptionalQueryString(value);
  if (!parsed.valid) return { valid: false };
  if (parsed.value === undefined) return { valid: true };

  const dateString = parsed.value;
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateString);
  const dateTime =
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})?$/.exec(
      dateString
    );
  const match = dateOnly ?? dateTime;
  if (!match) return { valid: false };

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const localMidnight = new Date(year, month - 1, day);
  if (
    localMidnight.getFullYear() !== year ||
    localMidnight.getMonth() !== month - 1 ||
    localMidnight.getDate() !== day
  ) {
    return { valid: false };
  }
  if (
    dateTime &&
    (Number(match[4]) > 23 ||
      Number(match[5]) > 59 ||
      Number(match[6]) > 59)
  ) {
    return { valid: false };
  }

  const date = new Date(dateString);
  return Number.isNaN(date.getTime())
    ? { valid: false }
    : { valid: true, value: date };
};
