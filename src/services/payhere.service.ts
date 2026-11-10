import { createHash, timingSafeEqual } from "crypto";
import { getPayHereConfig, PAYHERE_FIXED_ADDRESS } from "../config/payhere";

// Pure PayHere helpers: checkout hash, form fields, and notification checks.

export type PayHereOutcome = "PENDING" | "SUCCESS" | "FAILED" | "CANCELLED";

const md5Upper = (text: string): string =>
  createHash("md5").update(text, "utf8").digest("hex").toUpperCase();

export const formatAmount = (amount: number): string => {
  if (!Number.isFinite(amount) || amount < 0) {
    throw new Error("Amount must be a non-negative number");
  }
  return (Math.round(amount * 100) / 100).toFixed(2);
};

export const amountsMatch = (received: string, expected: number): boolean => {
  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(received.trim());
  if (!match) return false;

  const cents = Number(match[1]) * 100 + Number((match[2] ?? "").padEnd(2, "0"));
  return cents === Math.round(expected * 100);
};

export const buildOrderId = (bookingCode: string, attempt: number): string =>
  `PH-${bookingCode}-${attempt}`.toUpperCase();

export const createCheckoutHash = (input: {
  merchantId: string;
  orderId: string;
  amount: number;
  currency: string;
  merchantSecret: string;
}): string =>
  md5Upper(
    input.merchantId +
      input.orderId +
      formatAmount(input.amount) +
      input.currency +
      md5Upper(input.merchantSecret)
  );

export const splitName = (
  fullName: string
): { firstName: string; lastName: string } => {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { firstName: "Customer", lastName: "Customer" };
  if (parts.length === 1) return { firstName: parts[0], lastName: "Customer" };
  return { firstName: parts[0], lastName: parts.slice(1).join(" ") };
};

export interface CheckoutCustomer {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
}

export interface CheckoutInput {
  orderId: string;
  amount: number;
  items: string;
  customer: CheckoutCustomer;
}

export interface CheckoutForm {
  action: string;
  fields: Record<string, string>;
}

export const buildCheckoutForm = (input: CheckoutInput): CheckoutForm => {
  const config = getPayHereConfig();
  const orderQuery = `order_id=${encodeURIComponent(input.orderId)}`;

  const fields: Record<string, string> = {
    merchant_id: config.merchantId,
    return_url: `${config.frontendUrl}/payment/return?${orderQuery}`,
    cancel_url: `${config.frontendUrl}/payment/cancelled?${orderQuery}`,
    notify_url: `${config.backendPublicUrl}/api/payments/notify`,
    order_id: input.orderId,
    items: input.items.slice(0, 100),
    currency: config.currency,
    amount: formatAmount(input.amount),
    first_name: input.customer.firstName,
    last_name: input.customer.lastName,
    email: input.customer.email,
    phone: input.customer.phone,
    address: PAYHERE_FIXED_ADDRESS.address,
    city: PAYHERE_FIXED_ADDRESS.city,
    country: PAYHERE_FIXED_ADDRESS.country,
    hash: createCheckoutHash({
      merchantId: config.merchantId,
      orderId: input.orderId,
      amount: input.amount,
      currency: config.currency,
      merchantSecret: config.merchantSecret,
    }),
  };

  return { action: config.checkoutUrl, fields };
};

export interface PayHereNotification {
  merchant_id: string;
  order_id: string;
  payment_id: string;
  payhere_amount: string;
  payhere_currency: string;
  status_code: string;
  md5sig: string;
  method?: string;
  status_message?: string;
}

const REQUIRED_FIELDS = [
  "merchant_id",
  "order_id",
  "payhere_amount",
  "payhere_currency",
  "status_code",
  "md5sig",
] as const;

export const parseNotification = (body: unknown): PayHereNotification | null => {
  if (typeof body !== "object" || body === null) return null;
  const data = body as Record<string, unknown>;

  for (const key of REQUIRED_FIELDS) {
    if (typeof data[key] !== "string" || (data[key] as string).trim() === "") {
      return null;
    }
  }

  const text = (key: string): string | undefined =>
    typeof data[key] === "string" ? (data[key] as string) : undefined;

  return {
    merchant_id: text("merchant_id")!,
    order_id: text("order_id")!,
    payment_id: text("payment_id") ?? "",
    payhere_amount: text("payhere_amount")!,
    payhere_currency: text("payhere_currency")!,
    status_code: text("status_code")!,
    md5sig: text("md5sig")!,
    method: text("method"),
    status_message: text("status_message"),
  };
};

export const verifyNotificationSignature = (
  notification: PayHereNotification,
  merchantSecret: string
): boolean => {
  const expected = md5Upper(
    notification.merchant_id +
      notification.order_id +
      notification.payhere_amount +
      notification.payhere_currency +
      notification.status_code +
      md5Upper(merchantSecret)
  );

  const received = notification.md5sig.trim().toUpperCase();
  if (received.length !== expected.length) return false;

  return timingSafeEqual(Buffer.from(received), Buffer.from(expected));
};

export interface MappedStatus {
  status: PayHereOutcome;
  chargeback: boolean;
}

export const mapStatusCode = (statusCode: string): MappedStatus | null => {
  switch (statusCode.trim()) {
    case "2":
      return { status: "SUCCESS", chargeback: false };
    case "0":
      return { status: "PENDING", chargeback: false };
    case "-1":
      return { status: "CANCELLED", chargeback: false };
    case "-2":
      return { status: "FAILED", chargeback: false };
    case "-3":
      return { status: "FAILED", chargeback: true };
    default:
      return null;
  }
};
