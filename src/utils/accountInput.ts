export interface AccountInput {
  first_name: string;
  last_name: string;
  username: string;
  email: string;
  phone?: string;
  password: string;
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ACCOUNT_FIELDS = new Set([
  "first_name",
  "last_name",
  "username",
  "email",
  "phone",
  "password",
]);

export const validateAccountInput = (body: unknown): AccountInput | string => {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return "A valid account request is required.";
  }

  const input = body as Record<string, unknown>;
  if (Object.keys(input).some((key) => !ACCOUNT_FIELDS.has(key))) {
    return "Unexpected account fields were provided.";
  }

  for (const field of [
    "first_name",
    "last_name",
    "username",
    "email",
    "password",
  ] as const) {
    if (typeof input[field] !== "string") {
      return `${field} must be a string.`;
    }
    if (!input[field].trim()) {
      return `${field} is required.`;
    }
  }

  const firstName = (input.first_name as string).trim();
  const lastName = (input.last_name as string).trim();
  const username = (input.username as string).trim();
  const email = (input.email as string).trim().toLowerCase();
  const password = input.password as string;
  const phone = input.phone;

  if (firstName.length > 100 || lastName.length > 100) {
    return "Names must be 100 characters or fewer.";
  }
  if (username.length < 3 || username.length > 50) {
    return "Username must be between 3 and 50 characters.";
  }
  if (email.length > 254 || !EMAIL_PATTERN.test(email)) {
    return "A valid email address is required.";
  }
  if (Buffer.byteLength(password, "utf8") > 72) {
    return "Password must be 72 bytes or fewer.";
  }
  if (
    password.length < 8 ||
    !/[A-Za-z]/.test(password) ||
    !/[0-9]/.test(password)
  ) {
    return "Password must be at least 8 characters and include a letter and a number.";
  }
  if (phone !== undefined && typeof phone !== "string") {
    return "phone must be a string.";
  }
  if (typeof phone === "string" && phone.trim().length > 30) {
    return "Phone must be 30 characters or fewer.";
  }

  return {
    first_name: firstName,
    last_name: lastName,
    username,
    email,
    ...(typeof phone === "string" && phone.trim()
      ? { phone: phone.trim() }
      : {}),
    password,
  };
};

export const emailDuplicateFilter = (
  email: string
): { email: { $regex: string; $options: "i" } } => ({
  email: {
    $regex: `^${email.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`,
    $options: "i",
  },
});
