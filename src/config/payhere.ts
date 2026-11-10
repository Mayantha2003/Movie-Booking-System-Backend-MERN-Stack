import dotenv from "dotenv";

dotenv.config();

// ---------------------------------------------------------------------------
// PayHere SANDBOX configuration.
//
// The checkout URL is written here on purpose and is NOT read from .env, so a
// wrong value in .env can never send a test payment to the live gateway.
// Going live would need a deliberate change to this file.
// ---------------------------------------------------------------------------
export const PAYHERE_CHECKOUT_URL = "https://sandbox.payhere.lk/pay/checkout";
export const PAYHERE_CURRENCY = "LKR";

// A booking can be paid at most 3 times (retries after a failed / cancelled payment)
export const PAYHERE_MAX_ATTEMPTS = 3;

// PayHere requires an address, city and country for every payment.
// We do not collect them, so fixed values are sent.
export const PAYHERE_FIXED_ADDRESS = {
  address: "Colombo",
  city: "Colombo",
  country: "Sri Lanka",
} as const;

const DEFAULT_HOLD_MINUTES = 10;

export interface PayHereConfig {
  merchantId: string;
  merchantSecret: string;
  backendPublicUrl: string;
  frontendUrl: string;
  holdMinutes: number;
  checkoutUrl: typeof PAYHERE_CHECKOUT_URL;
  currency: typeof PAYHERE_CURRENCY;
}

const readRequired = (name: string): string => {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`PayHere is not configured: ${name} is missing in .env`);
  }
  return value;
};

const readUrl = (name: string): string => {
  const raw = readRequired(name);
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new Error(`${name} must be a full URL, for example https://example.com`);
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error(`${name} must start with http:// or https://`);
  }
  return raw.replace(/\/+$/, "");
};

const readHoldMinutes = (): number => {
  const raw = process.env.PAYMENT_HOLD_MINUTES?.trim();
  if (!raw) return DEFAULT_HOLD_MINUTES;

  const minutes = Number(raw);
  if (!Number.isInteger(minutes) || minutes < 1 || minutes > 60) {
    throw new Error("PAYMENT_HOLD_MINUTES must be a whole number from 1 to 60");
  }
  return minutes;
};

// Read and validate when a payment is actually started, not at import time,
// so the server still runs without PayHere keys and only payments report the problem.
export const getPayHereConfig = (): PayHereConfig => {
  const mode = process.env.PAYHERE_MODE?.trim().toLowerCase();
  if (mode && mode !== "sandbox") {
    throw new Error("Only the PayHere sandbox is supported. Remove PAYHERE_MODE or set it to 'sandbox'.");
  }

  return {
    merchantId: readRequired("PAYHERE_MERCHANT_ID"),
    merchantSecret: readRequired("PAYHERE_MERCHANT_SECRET"),
    backendPublicUrl: readUrl("BACKEND_PUBLIC_URL"),
    frontendUrl: readUrl("FRONTEND_URL"),
    holdMinutes: readHoldMinutes(),
    checkoutUrl: PAYHERE_CHECKOUT_URL,
    currency: PAYHERE_CURRENCY,
  };
};

const isLocalUrl = (url: string): boolean => {
  const host = new URL(url).hostname;
  return host === "localhost" || host === "127.0.0.1" || host === "::1" || host === "[::1]";
};

export interface PayHereStatus {
  configured: boolean;
  summary: string;
  warnings: string[];
}

// For one startup log line. Never includes the merchant secret.
export const describePayHereConfig = (): PayHereStatus => {
  try {
    const config = getPayHereConfig();
    const warnings: string[] = [];

    if (isLocalUrl(config.backendPublicUrl)) {
      warnings.push(
        "BACKEND_PUBLIC_URL is localhost, so PayHere cannot send payment notifications. Use a tunnel such as ngrok."
      );
    }

    return {
      configured: true,
      summary: `PayHere SANDBOX ready (merchant ${config.merchantId}, seat hold ${config.holdMinutes} min)`,
      warnings,
    };
  } catch (error) {
    return {
      configured: false,
      summary: `PayHere not ready: ${error instanceof Error ? error.message : "unknown error"}`,
      warnings: [],
    };
  }
};
