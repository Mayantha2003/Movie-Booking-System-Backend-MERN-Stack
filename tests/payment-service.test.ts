
import assert from "node:assert/strict";
import test from "node:test";

import { Booking } from "../src/models/booking.model";
import { Payment } from "../src/models/payment.model";

import {
  generatePaymentToken,
  hashPaymentToken,
  isHoldActive,
  verifyPaymentToken,
} from "../src/services/bookingHold.service";

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
      "seats.seatId" in keys &&
      options.name === "unique_held_seat_per_showtime"
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
        "attempt" in keys &&
        options.name === "unique_payment_attempt_per_booking"
    )
  );
});
