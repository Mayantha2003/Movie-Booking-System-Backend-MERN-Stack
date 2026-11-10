import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { Booking } from "../src/models/booking.model";
import { Payment } from "../src/models/payment.model";
import {
  buildCheckoutForm,
  amountsMatch,
  formatAmount,
  mapStatusCode,
  parseNotification,
  verifyNotificationSignature,
} from "../src/services/payhere.service";
import {
  generatePaymentToken,
  hashPaymentToken,
  isHoldActive,
  verifyPaymentToken,
} from "../src/services/bookingHold.service";

const md5 = (value: string): string =>
  createHash("md5").update(value, "utf8").digest("hex").toUpperCase();

const withPayHereEnv = (run: () => void): void => {
  const keys = [
    "PAYHERE_MODE",
    "PAYHERE_MERCHANT_ID",
    "PAYHERE_MERCHANT_SECRET",
    "BACKEND_PUBLIC_URL",
    "FRONTEND_URL",
  ] as const;
  const previous = new Map(keys.map((key) => [key, process.env[key]]));
  process.env.PAYHERE_MODE = "sandbox";
  process.env.PAYHERE_MERCHANT_ID = "merchant-test";
  process.env.PAYHERE_MERCHANT_SECRET = "secret-test";
  process.env.BACKEND_PUBLIC_URL = "https://backend.example.test";
  process.env.FRONTEND_URL = "https://frontend.example.test";

  try {
    run();
  } finally {
    for (const key of keys) {
      const value = previous.get(key);
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
};

test("formats amounts and rejects malformed currency amounts", () => {
  assert.equal(formatAmount(10), "10.00");
  assert.equal(formatAmount(10.129), "10.13");
  assert.equal(Number.isFinite(10.129), true);

  assert.equal(amountsMatch("10", 10), true);
  assert.equal(amountsMatch("10.00", 10), true);
  assert.equal(amountsMatch("10.001", 10), false);
  assert.equal(amountsMatch("10.01", 10), false);
  assert.throws(() => formatAmount(Number.NaN));
});

test("notification signatures cover PayHere-signed fields", () => {
  const body = {
    merchant_id: "merchant-test",
    order_id: "PH-BK-ABC234-1",
    payment_id: "payment-1",
    payhere_amount: "10.00",
    payhere_currency: "LKR",
    status_code: "2",
  };
  const signature = md5(
    body.merchant_id +
      body.order_id +
      body.payhere_amount +
      body.payhere_currency +
      body.status_code +
      md5("secret-test")
  );
  const parsed = parseNotification({ ...body, md5sig: signature });
  assert.ok(parsed);
  assert.equal(verifyNotificationSignature(parsed, "secret-test"), true);
  assert.equal(
    verifyNotificationSignature({ ...parsed, payhere_amount: "11.00" }, "secret-test"),
    false
  );
  assert.equal(parseNotification({ ...body, md5sig: signature, status_code: ["2"] }), null);
  assert.equal(mapStatusCode("2")?.status, "SUCCESS");
  assert.equal(mapStatusCode("-1")?.status, "CANCELLED");
  assert.equal(mapStatusCode("-2")?.status, "FAILED");
  assert.equal(mapStatusCode("unknown"), null);
});

test("checkout form is sandbox-configured and encodes return URLs", () => {
  withPayHereEnv(() => {
    const checkout = buildCheckoutForm({
      orderId: "PH-BK-ABC234-1",
      amount: 10,
      items: "Movie tickets",
      customer: {
        firstName: "Test",
        lastName: "Customer",
        email: "test@example.test",
        phone: "0770000000",
      },
    });

    assert.equal(checkout.action, "https://sandbox.payhere.lk/pay/checkout");
    assert.equal(checkout.fields.currency, "LKR");
    assert.equal(checkout.fields.amount, "10.00");
    assert.match(checkout.fields.return_url, /order_id=PH-BK-ABC234-1/);
    assert.equal(
      checkout.fields.notify_url,
      "https://backend.example.test/api/payments/notify"
    );
    assert.notEqual(checkout.fields.hash, "secret-test");
  });
});

test("payment token is random, stored as a hash, and rejects invalid/released tokens", () => {
  const first = generatePaymentToken();
  const second = generatePaymentToken();
  assert.equal(first.token.length, 64);
  assert.notEqual(first.token, second.token);
  assert.equal(first.hash, hashPaymentToken(first.token));
  assert.equal(verifyPaymentToken(first.token, first.hash), true);
  assert.equal(verifyPaymentToken("wrong-token", first.hash), false);
  assert.equal(verifyPaymentToken(first.token, null), false);
  assert.equal(verifyPaymentToken(first.token, "not-a-sha256-hash"), false);
  assert.equal(
    isHoldActive({
      bookingStatus: "Pending",
      holdExpiresAt: new Date(Date.now() + 1000),
    }),
    true
  );
  assert.equal(
    isHoldActive({
      bookingStatus: "Pending",
      holdExpiresAt: new Date(Date.now() - 1000),
    }),
    false
  );
  assert.equal(
    isHoldActive({
      bookingStatus: "Confirmed",
      holdExpiresAt: new Date(Date.now() + 1000),
    }),
    false
  );
});

test("schemas declare active-seat uniqueness and unique payment attempt indexes", () => {
  const bookingIndexes = Booking.schema.indexes();
  const seatIndex = bookingIndexes.find(
    ([keys, options]) =>
      "seats.seatId" in keys && options.name === "unique_held_seat_per_showtime"
  );
  assert.ok(seatIndex);
  assert.equal(seatIndex[1].unique, true);
  assert.deepEqual(seatIndex[1].partialFilterExpression, {
    bookingStatus: { $in: ["Pending", "Confirmed"] },
  });

  const paymentIndexes = Payment.schema.indexes();
  assert.ok(
    paymentIndexes.some(
      ([keys, options]) =>
        "attempt" in keys && options.name === "unique_payment_attempt_per_booking"
    )
  );
  assert.ok(
    paymentIndexes.some(
      ([keys, options]) =>
        "payherePaymentId" in keys && options.name === "unique_payhere_payment_id"
    )
  );
});
