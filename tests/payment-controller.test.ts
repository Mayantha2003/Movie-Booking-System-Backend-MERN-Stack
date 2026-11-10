import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test, { type TestContext } from "node:test";
import { Types } from "mongoose";
import {
  createCheckout,
  getPaymentStatus,
  handleNotify,
} from "../src/controllers/payment.controller";
import { Booking } from "../src/models/booking.model";
import { Offer } from "../src/models/offer.model";
import { Payment } from "../src/models/payment.model";
import { Showtime } from "../src/models/showtime.model";
import { generatePaymentToken, hashPaymentToken } from "../src/services/bookingHold.service";

const query = <T>(value: T) => {
  const result: any = {
    select: () => result,
    populate: () => result,
    sort: () => result,
    limit: () => result,
    lean: () => result,
    then: (resolve: (resolved: T) => unknown, reject: (error: unknown) => unknown) =>
      Promise.resolve(value).then(resolve, reject),
  };
  return result;
};

const replace = (
  context: TestContext,
  target: object,
  name: string,
  implementation: (...args: any[]) => any
): void => {
  let targets = replacements.get(context);
  if (!targets) {
    targets = new WeakMap();
    replacements.set(context, targets);
  }
  let names = targets.get(target);
  if (!names) {
    names = new Map();
    targets.set(target, names);
  }
  if (!names.has(name)) {
    const original = Object.getOwnPropertyDescriptor(target, name);
    names.set(name, original);
    context.after(() => {
      if (original) Object.defineProperty(target, name, original);
      else delete (target as any)[name];
    });
  }
  Object.defineProperty(target, name, {
    configurable: true,
    writable: true,
    value: implementation,
  });
};

const replacements = new WeakMap<
  TestContext,
  WeakMap<object, Map<string, PropertyDescriptor | undefined>>
>();

const response = () => {
  const result: any = { statusCode: 200, body: undefined, text: undefined };
  result.status = (statusCode: number) => {
    result.statusCode = statusCode;
    return result;
  };
  result.json = (body: unknown) => {
    result.body = body;
    return result;
  };
  result.send = (text: string) => {
    result.text = text;
    return result;
  };
  return result;
};

const envKeys = [
  "PAYHERE_MODE",
  "PAYHERE_MERCHANT_ID",
  "PAYHERE_MERCHANT_SECRET",
  "BACKEND_PUBLIC_URL",
  "FRONTEND_URL",
] as const;

const setPayHereEnv = (): (() => void) => {
  const previous = new Map(envKeys.map((key) => [key, process.env[key]]));
  process.env.PAYHERE_MODE = "sandbox";
  process.env.PAYHERE_MERCHANT_ID = "merchant-test";
  process.env.PAYHERE_MERCHANT_SECRET = "secret-test";
  process.env.BACKEND_PUBLIC_URL = "https://backend.example.test";
  process.env.FRONTEND_URL = "https://frontend.example.test";

  return () => {
    for (const key of envKeys) {
      const value = previous.get(key);
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  };
};

const signedNotification = (statusCode: string, values: Record<string, string> = {}) => {
  const notification = {
    merchant_id: "merchant-test",
    order_id: "PH-BK-ABC234-1",
    payment_id: "payhere-payment-1",
    payhere_amount: "1250.00",
    payhere_currency: "LKR",
    status_code: statusCode,
    ...values,
  };
  const md5 = (value: string) =>
    createHash("md5").update(value, "utf8").digest("hex").toUpperCase();
  const md5sig = md5(
    notification.merchant_id +
      notification.order_id +
      notification.payhere_amount +
      notification.payhere_currency +
      notification.status_code +
      md5("secret-test")
  );
  return { ...notification, md5sig };
};

const fakePayment = (overrides: Record<string, unknown> = {}) => ({
  _id: new Types.ObjectId(),
  booking: new Types.ObjectId(),
  amount: 1250,
  currency: "LKR",
  attempt: 1,
  status: "PENDING",
  ...overrides,
});

test("checkout validates tokens and supports the same token for bounded retries", async (t) => {
  const restoreEnv = setPayHereEnv();
  t.after(restoreEnv);

  const token = generatePaymentToken();
  const bookingId = new Types.ObjectId();
  const booking = {
    _id: bookingId,
    bookingCode: "BK-ABC234",
    bookingStatus: "Pending",
    paymentStatus: "Failed",
    paymentTokenHash: token.hash,
    holdExpiresAt: new Date(Date.now() + 60_000),
    showtime: new Types.ObjectId(),
    finalAmount: 1250,
    guestInfo: { name: "Test User", email: "test@example.test", phone: "0770000000" },
    movie: { title: "Test Movie" },
  };
  let attempts = 1;
  let created: any;
  replace(t, Booking, "findOne", () => query(booking));
  replace(t, Payment, "countDocuments", async () => attempts);
  replace(t, Payment, "create", async (document: unknown) => {
    created = document;
  });
  replace(t, Booking, "updateOne", async () => ({ modifiedCount: 1 }));

  const retryResponse = response();
  await createCheckout(
    { body: { bookingCode: booking.bookingCode, paymentToken: token.token } } as any,
    retryResponse
  );
  assert.equal(retryResponse.statusCode, 200);
  assert.equal(retryResponse.body.data.attempt, 2);
  assert.equal(retryResponse.body.data.attemptsLeft, 1);
  assert.equal(created.status, "PENDING");
  assert.equal(created.orderId, "PH-BK-ABC234-2");

  attempts = 3;
  const maxResponse = response();
  await createCheckout(
    { body: { bookingCode: booking.bookingCode, paymentToken: token.token } } as any,
    maxResponse
  );
  assert.equal(maxResponse.statusCode, 409);
  assert.equal(maxResponse.body.code, "MAX_ATTEMPTS");

  const invalidResponse = response();
  await createCheckout(
    { body: { bookingCode: booking.bookingCode, paymentToken: "wrong" } } as any,
    invalidResponse
  );
  assert.equal(invalidResponse.statusCode, 403);

  booking.holdExpiresAt = new Date(Date.now() - 1);
  replace(t, Booking, "find", () => query([]));
  const expiredResponse = response();
  await createCheckout(
    { body: { bookingCode: booking.bookingCode, paymentToken: token.token } } as any,
    expiredResponse
  );
  assert.equal(expiredResponse.statusCode, 410);
  assert.equal(expiredResponse.body.code, "HOLD_EXPIRED");

  assert.equal(hashPaymentToken(token.token), booking.paymentTokenHash);
});

test("concurrent checkout attempt collisions are rejected without creating another payment", async (t) => {
  const restoreEnv = setPayHereEnv();
  t.after(restoreEnv);
  const token = generatePaymentToken();
  const booking = {
    _id: new Types.ObjectId(),
    bookingCode: "BK-ABC234",
    bookingStatus: "Pending",
    paymentTokenHash: token.hash,
    holdExpiresAt: new Date(Date.now() + 60_000),
    showtime: new Types.ObjectId(),
    finalAmount: 1250,
    guestInfo: { name: "Test User", email: "test@example.test", phone: "0770000000" },
    movie: { title: "Test Movie" },
  };
  let bookingStatusWrites = 0;
  replace(t, Booking, "findOne", () => query(booking));
  replace(t, Payment, "countDocuments", async () => 0);
  replace(
    t,
    Payment,
    "create",
    async () => {
      throw Object.assign(new Error("duplicate payment attempt"), { code: 11000 });
    }
  );
  replace(t, Booking, "updateOne", async () => {
    bookingStatusWrites += 1;
    return { modifiedCount: 1 };
  });

  const res = response();
  await createCheckout(
    { body: { bookingCode: booking.bookingCode, paymentToken: token.token } } as any,
    res
  );
  assert.equal(res.statusCode, 409);
  assert.equal(res.body.code, "ATTEMPT_IN_PROGRESS");
  assert.equal(bookingStatusWrites, 0);
});

test("verified success confirms the booking; an invalid signature cannot mutate state", async (t) => {
  const restoreEnv = setPayHereEnv();
  t.after(restoreEnv);
  const payment = fakePayment();
  let paymentWrites = 0;
  let bookingWrites = 0;
  replace(t, Payment, "findOne", () => query(payment));
  replace(t, Payment, "updateOne", async () => {
    paymentWrites += 1;
    return { modifiedCount: 1 };
  });
  replace(t, Booking, "findOneAndUpdate", async (_filter: unknown, update: any) => {
    bookingWrites += 1;
    assert.equal(update.$set.bookingStatus, "Confirmed");
    assert.equal(update.$set.paymentStatus, "Paid");
    return { _id: payment.booking };
  });

  const invalid = signedNotification("2");
  invalid.md5sig = "0".repeat(32);
  const invalidResponse = response();
  await handleNotify({ body: invalid } as any, invalidResponse);
  assert.equal(invalidResponse.statusCode, 400);
  assert.equal(paymentWrites, 0);
  assert.equal(bookingWrites, 0);

  const successResponse = response();
  await handleNotify({ body: signedNotification("2") } as any, successResponse);
  assert.equal(successResponse.statusCode, 200);
  assert.equal(paymentWrites, 1);
  assert.equal(bookingWrites, 1);
});

test("notification rejects wrong merchant, amount, and currency before confirmation", async (t) => {
  const restoreEnv = setPayHereEnv();
  t.after(restoreEnv);
  const payment = fakePayment();
  let confirmations = 0;
  let auditEvents = 0;
  replace(t, Payment, "findOne", () => query(payment));
  replace(t, Payment, "updateOne", async () => {
    auditEvents += 1;
    return { modifiedCount: 1 };
  });
  replace(t, Booking, "findOneAndUpdate", async () => {
    confirmations += 1;
    return { _id: payment.booking };
  });

  const wrongMerchant = signedNotification("2", { merchant_id: "other-merchant" });
  const merchantResponse = response();
  await handleNotify({ body: wrongMerchant } as any, merchantResponse);
  assert.equal(merchantResponse.statusCode, 200);
  assert.equal(confirmations, 0);

  const wrongAmount = signedNotification("2", { payhere_amount: "1251.00" });
  const amountResponse = response();
  await handleNotify({ body: wrongAmount } as any, amountResponse);
  assert.equal(amountResponse.statusCode, 200);
  assert.equal(confirmations, 0);
  assert.equal(auditEvents, 1);

  const wrongCurrency = signedNotification("2", { payhere_currency: "USD" });
  const currencyResponse = response();
  await handleNotify({ body: wrongCurrency } as any, currencyResponse);
  assert.equal(currencyResponse.statusCode, 200);
  assert.equal(confirmations, 0);
  assert.equal(auditEvents, 2);
});

test("failed attempt retains a hold; the third cancelled attempt releases its capacity", async (t) => {
  const restoreEnv = setPayHereEnv();
  t.after(restoreEnv);

  const payment = fakePayment({ attempt: 1 });
  let bookingUpdates = 0;
  let seatUpdates = 0;
  replace(t, Payment, "findOne", () => query(payment));
  replace(t, Payment, "findOneAndUpdate", async (_filter: unknown, _update: unknown) => ({
    ...payment,
    status: "FAILED",
  }));
  replace(t, Payment, "exists", async () => null);
  replace(t, Booking, "updateOne", async () => {
    bookingUpdates += 1;
    return { modifiedCount: 1 };
  });
  replace(t, Booking, "findOneAndUpdate", async () => ({
    _id: payment.booking,
    showtime: new Types.ObjectId(),
    totalSeats: 2,
  }));
  replace(t, Showtime, "updateOne", async () => {
    seatUpdates += 1;
  });
  replace(t, Offer, "updateOne", async () => undefined);

  const failedResponse = response();
  await handleNotify({ body: signedNotification("-2") } as any, failedResponse);
  assert.equal(failedResponse.statusCode, 200);
  assert.equal(bookingUpdates, 1);
  assert.equal(seatUpdates, 0);

  payment.attempt = 3;
  const cancelledResponse = response();
  await handleNotify({ body: signedNotification("-1") } as any, cancelledResponse);
  assert.equal(cancelledResponse.statusCode, 200);
  assert.equal(seatUpdates, 1);
  assert.equal(bookingUpdates, 1);
});

test("replayed success is idempotent and a late success with a seat conflict flags a refund", async (t) => {
  const restoreEnv = setPayHereEnv();
  t.after(restoreEnv);
  const payment = fakePayment();
  const writes: any[] = [];
  const confirmedBooking = {
    bookingStatus: "Confirmed",
    paymentStatus: "Paid",
  };
  replace(t, Payment, "findOne", (filter: any) =>
    filter?.status === "SUCCESS"
      ? query({ _id: payment._id })
      : query(payment)
  );
  replace(t, Payment, "updateOne", async (filter: unknown, update: unknown) => {
    writes.push({ filter, update });
    return { modifiedCount: 1 };
  });
  replace(t, Booking, "updateOne", async () => ({ modifiedCount: 1 }));
  replace(t, Booking, "findOneAndUpdate", async () => null);
  replace(t, Booking, "findById", () => query(confirmedBooking));

  const replayResponse = response();
  await handleNotify({ body: signedNotification("2") } as any, replayResponse);
  assert.equal(replayResponse.statusCode, 200);
  assert.equal(writes.length, 1);

  const latePayment = fakePayment({ attempt: 3 });
  replace(t, Payment, "findOne", () => query(latePayment));
  let bookingUpdateCalls = 0;
  replace(t, Booking, "findOneAndUpdate", async () => {
    bookingUpdateCalls += 1;
    if (bookingUpdateCalls === 1) return null;
    const duplicateSeat = Object.assign(new Error("duplicate seat"), {
      code: 11000,
      keyPattern: { "seats.seatId": 1 },
    });
    throw duplicateSeat;
  });
  replace(t, Booking, "findById", () =>
    query({
      bookingStatus: "Cancelled",
      holdExpiresAt: new Date(Date.now() - 1),
      showtime: new Types.ObjectId(),
      totalSeats: 2,
      offer: null,
    })
  );
  const lateResponse = response();
  await handleNotify({ body: signedNotification("2") } as any, lateResponse);
  assert.equal(lateResponse.statusCode, 200);
  assert.equal(
    writes.some(
      (write) => (write.update as any)?.$set?.refundRequired === true
    ),
    true
  );
});

test("status polling preserves Pending and never treats it as confirmed", async (t) => {
  const payment = fakePayment();
  replace(t, Payment, "findOne", () => query(payment));
  replace(t, Booking, "findById", () =>
    query({
      bookingStatus: "Pending",
      holdExpiresAt: new Date(Date.now() + 60_000),
    })
  );

  const res = response();
  await getPaymentStatus({ params: { orderId: "PH-BK-ABC234-1" } } as any, res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.data.status, "PENDING");
  assert.equal(res.body.data.bookingStatus, "Pending");
  assert.equal(res.body.data.attemptsLeft, 2);
});
