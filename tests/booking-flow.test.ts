import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import mongoose, { Types } from "mongoose";
import {
  createBooking,
  cancelBooking,
  getBookingByCode,
} from "../src/controllers/booking.controller";
import { Booking } from "../src/models/booking.model";
import { Cinema } from "../src/models/cinema.model";
import { MovieModel } from "../src/models/movie.model";
import { Offer } from "../src/models/offer.model";
import { Screen } from "../src/models/screen.model";
import { Showtime } from "../src/models/showtime.model";
import { releaseExpiredHolds, hashPaymentToken } from "../src/services/bookingHold.service";
import {
  generateBookingCode,
  normalizeBookingCode,
} from "../src/utils/bookingCode";

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
  const result: any = { statusCode: 200, body: undefined };
  result.status = (statusCode: number) => {
    result.statusCode = statusCode;
    return result;
  };
  result.json = (body: unknown) => {
    result.body = body;
    return result;
  };
  return result;
};

const setupBookingMocks = (
  context: TestContext,
  options: { saveError?: Error; transactionError?: Error } = {}
) => {
  const showtimeId = new Types.ObjectId();
  const movieId = new Types.ObjectId();
  const cinemaId = new Types.ObjectId();
  const screenId = new Types.ObjectId();
  const showtime = {
    _id: showtimeId,
    movie: movieId,
    cinema: cinemaId,
    screen: screenId,
    totalSeats: 10,
    availableSeats: 10,
    ticketPrice: 1250,
    isActive: true,
  };
  const screen = {
    _id: screenId,
    cinema: cinemaId,
    isActive: true,
    totalSeats: 10,
    rows: 1,
    seatsPerRow: 10,
    seatLayout: [{ row: "A", seats: 10 }],
  };
  const saved: any[] = [];
  const seatUpdates: any[] = [];

  replace(context, Booking, "find", () => query([]));
  replace(context, Booking, "findOne", async () => null);
  replace(context, Booking, "findById", (id: Types.ObjectId) =>
    query(saved.find((booking) => booking._id.equals(id)) ?? saved[0])
  );
  replace(context, Showtime, "findById", async () => showtime);
  replace(context, Showtime, "updateOne", async (_filter: unknown, update: unknown) => {
    seatUpdates.push(update);
    return { modifiedCount: 1 };
  });
  replace(context, MovieModel, "findById", () => query({ _id: movieId }));
  replace(context, Cinema, "findById", () => query({ _id: cinemaId, isActive: true }));
  replace(context, Screen, "findById", () => query(screen));
  replace(context, Booking.prototype, "save", async function (this: any) {
    if (options.saveError) throw options.saveError;
    saved.push(this);
    return this;
  });

  const session = {
    withTransaction: async (callback: () => Promise<void>) => {
      if (options.transactionError) throw options.transactionError;
      await callback();
    },
    endSession: async () => undefined,
  };
  replace(context, mongoose, "startSession", async () => session);

  return { showtimeId, saved, seatUpdates };
};

test("generates secure-format booking codes and accepts legacy codes", () => {
  const code = generateBookingCode();

  assert.match(code, /^BK-[A-HJ-NP-Z2-9]{26}$/);
  assert.equal(normalizeBookingCode("bk-abc234"), "BK-ABC234");
  assert.equal(normalizeBookingCode(code.toLowerCase()), code);
  assert.equal(normalizeBookingCode("BK-INVALID!"), null);
});

test("legacy guest lookup requires matching contact details and excludes them from its response", async (t) => {
  const booking = {
    bookingCode: "BK-ABC234",
    guestInfo: {
      name: "Test User",
      email: "private@example.test",
      phone: "0770000000",
    },
    movie: { title: "Test Movie", poster: "/poster.png", duration: 100 },
    cinema: { name: "Test Cinema", address: "Test Address" },
    screen: { name: "Screen 1", screenType: "Standard" },
    showtime: {
      showDate: "2026-01-01",
      startTime: "18:00",
      ticketPrice: 1250,
    },
    seats: [{ row: "A", seatNumber: 1, seatId: "A-1" }],
    totalSeats: 1,
    ticketPrice: 1250,
    totalAmount: 1250,
    foodTotal: 0,
    discountAmount: 0,
    offer: null,
    finalAmount: 1250,
    paymentStatus: "Paid",
    bookingStatus: "Confirmed",
    user: null,
    paymentTokenHash: "must-not-be-returned",
  };
  const filters: unknown[] = [];

  replace(t, Booking, "findOne", (filter: unknown) => {
    filters.push(filter);
    return query(booking);
  });

  const legacyResponse = response();
  await getBookingByCode({
    method: "POST",
    params: { code: "bk-abc234" },
    body: { email: "PRIVATE@example.test", phone: "0770000000" },
  } as any, legacyResponse);

  assert.equal(legacyResponse.statusCode, 200);
  assert.deepEqual(filters[0], { bookingCode: "BK-ABC234" });
  assert.deepEqual(legacyResponse.body.data.guestInfo, { name: "Test User" });
  assert.deepEqual(legacyResponse.body.data.seats, [{ seatId: "A-1" }]);
  assert.deepEqual(Object.keys(legacyResponse.body.data).sort(), [
    "bookingCode",
    "bookingStatus",
    "cinema",
    "discountAmount",
    "finalAmount",
    "foodTotal",
    "guestInfo",
    "movie",
    "offer",
    "paymentStatus",
    "screen",
    "seats",
    "showtime",
    "ticketPrice",
    "totalSeats",
  ]);
  assert.equal("email" in legacyResponse.body.data.guestInfo, false);
  assert.equal("phone" in legacyResponse.body.data.guestInfo, false);
  assert.equal("user" in legacyResponse.body.data, false);
  assert.equal("paymentTokenHash" in legacyResponse.body.data, false);

  const unauthorizedLegacyResponse = response();
  await getBookingByCode({
    method: "GET",
    params: { code: "BK-ABC234" },
  } as any, unauthorizedLegacyResponse);
  assert.equal(unauthorizedLegacyResponse.statusCode, 404);

  const wrongContactResponse = response();
  await getBookingByCode({
    method: "POST",
    params: { code: "BK-ABC234" },
    body: { email: "wrong@example.test", phone: "0770000000" },
  } as any, wrongContactResponse);
  assert.equal(wrongContactResponse.statusCode, 404);

  const secureCode = generateBookingCode();
  const secureResponse = response();
  await getBookingByCode({
    method: "GET",
    params: { code: secureCode },
  } as any, secureResponse);

  assert.equal(secureResponse.statusCode, 200);
  assert.deepEqual(filters.at(-1), { bookingCode: secureCode });
});

test("legacy account bookings require the authenticated account owner", async (t) => {
  const accountId = new Types.ObjectId();
  const booking = {
    bookingCode: "BK-ABC234",
    user: accountId,
    guestInfo: undefined,
    movie: { title: "Test Movie", poster: "/poster.png", duration: 100 },
    cinema: { name: "Test Cinema", address: "Test Address" },
    screen: { name: "Screen 1", screenType: "Standard" },
    showtime: { showDate: "2026-01-01", startTime: "18:00" },
    seats: [{ seatId: "A-1" }],
    totalSeats: 1,
    ticketPrice: 1250,
    paymentStatus: "Paid",
    bookingStatus: "Confirmed",
    finalAmount: 1250,
  };
  replace(t, Booking, "findOne", () => query(booking));

  const ownerResponse = response();
  await getBookingByCode({
    method: "GET",
    params: { code: "BK-ABC234" },
    user: { sub: accountId.toString() },
  } as any, ownerResponse);
  assert.equal(ownerResponse.statusCode, 200);

  const otherUserResponse = response();
  await getBookingByCode({
    method: "GET",
    params: { code: "BK-ABC234" },
    user: { sub: new Types.ObjectId().toString() },
  } as any, otherUserResponse);
  assert.equal(otherUserResponse.statusCode, 404);
});

test("public booking lookup uses the same not-found response for invalid and unknown codes", async (t) => {
  let lookupCount = 0;
  replace(t, Booking, "findOne", () => {
    lookupCount += 1;
    return query(null);
  });

  const invalidResponse = response();
  await getBookingByCode({ params: { code: "not-a-booking-code" } } as any, invalidResponse);
  const unknownResponse = response();
  await getBookingByCode({ params: { code: "BK-ZZZZZZ" } } as any, unknownResponse);

  assert.equal(invalidResponse.statusCode, 404);
  assert.deepEqual(invalidResponse.body, unknownResponse.body);
  assert.equal(lookupCount, 1);
});

test("cancelling an unpaid pending booking preserves cancellation and seat release behavior", async (t) => {
  const booking = {
    _id: new Types.ObjectId(),
    user: new Types.ObjectId(),
    bookingStatus: "Pending",
    paymentStatus: "Pending",
    showtime: new Types.ObjectId(),
    totalSeats: 2,
    offer: new Types.ObjectId(),
  };
  let bookingUpdate: any;
  const seatUpdates: unknown[] = [];
  const offerUpdates: unknown[] = [];

  replace(t, Booking, "findById", async () => booking);
  replace(
    t,
    Booking,
    "findOneAndUpdate",
    async (_filter: unknown, update: any) => {
      bookingUpdate = update;
      return { ...booking, ...update.$set };
    }
  );
  replace(t, Showtime, "updateOne", async (_filter: unknown, update: unknown) => {
    seatUpdates.push(update);
  });
  replace(t, Offer, "updateOne", async (_filter: unknown, update: unknown) => {
    offerUpdates.push(update);
  });

  const res = response();
  await cancelBooking(
    { params: { id: booking._id.toString() }, user: { sub: booking.user.toString() } } as any,
    res
  );

  assert.equal(res.statusCode, 200);
  assert.equal(bookingUpdate.$set.bookingStatus, "Cancelled");
  assert.equal(bookingUpdate.$set.paymentStatus, "Cancelled");
  assert.deepEqual(seatUpdates[0], { $inc: { availableSeats: 2 } });
  assert.deepEqual(offerUpdates[0], { $inc: { usedCount: -1 } });
});

test("cancelling a paid booking keeps payment status Paid pending genuine refund confirmation", async (t) => {
  const booking = {
    _id: new Types.ObjectId(),
    user: new Types.ObjectId(),
    bookingStatus: "Confirmed",
    paymentStatus: "Paid",
    showtime: new Types.ObjectId(),
    totalSeats: 1,
    offer: null,
  };
  let bookingUpdate: any;
  const seatUpdates: unknown[] = [];

  replace(t, Booking, "findById", async () => booking);
  replace(
    t,
    Booking,
    "findOneAndUpdate",
    async (_filter: unknown, update: any) => {
      bookingUpdate = update;
      return { ...booking, ...update.$set };
    }
  );
  replace(t, Showtime, "updateOne", async (_filter: unknown, update: unknown) => {
    seatUpdates.push(update);
  });

  const res = response();
  await cancelBooking(
    { params: { id: booking._id.toString() }, user: { sub: booking.user.toString() } } as any,
    res
  );

  assert.equal(res.statusCode, 200);
  assert.equal(bookingUpdate.$set.bookingStatus, "Cancelled");
  assert.equal(bookingUpdate.$set.paymentStatus, "Paid");
  assert.equal(res.body.data.paymentStatus, "Paid");
  assert.deepEqual(seatUpdates[0], { $inc: { availableSeats: 1 } });
});

test("creates a Pending booking, reserves seats, and returns the raw token once", async (t) => {
  const { showtimeId, saved, seatUpdates } = setupBookingMocks(t);
  const res = response();

  await createBooking(
    {
      body: {
        showtimeId: showtimeId.toString(),
        seats: [{ row: "A", seatNumber: 1 }],
        guestInfo: { name: "Test User", email: "test@example.test", phone: "0770000000" },
      },
    } as any,
    res
  );

  assert.equal(res.statusCode, 201);
  assert.equal(res.body.data.bookingStatus, "Pending");
  assert.equal(res.body.data.paymentStatus, "Pending");
  assert.equal(res.body.data.finalAmount, 1250);
  assert.equal(res.body.data.totalSeats, 1);
  assert.match(res.body.paymentToken, /^[a-f0-9]{64}$/);
  assert.equal(res.body.data.paymentTokenHash, hashPaymentToken(res.body.paymentToken));
  assert.equal(saved.length, 1);
  assert.equal(seatUpdates.length, 1);
  assert.deepEqual(seatUpdates[0].$inc, { availableSeats: -1 });
});

test("rejects a seat already returned by the active-booking query", async (t) => {
  const { showtimeId, seatUpdates } = setupBookingMocks(t);
  replace(t, Booking, "find", (filter: any) =>
    query(filter?.bookingStatus?.$ne ? [{ seats: [{ seatId: "A-1" }] }] : [])
  );
  const res = response();

  await createBooking(
    {
      body: {
        showtimeId: showtimeId.toString(),
        seats: [{ row: "A", seatNumber: 1 }],
        guestInfo: { name: "Test User", email: "test@example.test", phone: "0770000000" },
      },
    } as any,
    res
  );

  assert.equal(res.statusCode, 409);
  assert.deepEqual(res.body.unavailableSeats, ["A-1"]);
  assert.equal(seatUpdates.length, 0);
});

test("compensates a standalone seat reservation if booking persistence fails", async (t) => {
  const unsupportedTransaction = Object.assign(
    new Error("Transaction numbers are only allowed on a replica set member or mongos"),
    { code: 20 }
  );
  const { showtimeId, seatUpdates } = setupBookingMocks(t, {
    transactionError: unsupportedTransaction,
    saveError: new Error("simulated booking write failure"),
  });
  let loggedFailure = false;
  replace(t, console, "error", () => {
    loggedFailure = true;
  });
  const res = response();

  await createBooking(
    {
      body: {
        showtimeId: showtimeId.toString(),
        seats: [{ row: "A", seatNumber: 1 }],
        guestInfo: { name: "Test User", email: "test@example.test", phone: "0770000000" },
      },
    } as any,
    res
  );

  assert.equal(res.statusCode, 500);
  assert.equal(loggedFailure, true);
  assert.equal(seatUpdates.length, 2);
  assert.deepEqual(seatUpdates[0].$inc, { availableSeats: -1 });
  assert.deepEqual(seatUpdates[1].$inc, { availableSeats: 1 });
});

test("releases an expired hold once and does not double-release a lost conditional update", async (t) => {
  const bookingId = new Types.ObjectId();
  const showtimeId = new Types.ObjectId();
  const offerId = new Types.ObjectId();
  let releaseWins = true;
  const updates: unknown[] = [];

  replace(t, Booking, "find", () =>
    query([{ _id: bookingId }])
  );
  replace(t, Booking, "findOneAndUpdate", async () =>
    releaseWins
      ? {
          _id: bookingId,
          showtime: showtimeId,
          totalSeats: 2,
          offer: offerId,
        }
      : null
  );
  replace(t, Showtime, "updateOne", async (_filter: unknown, update: unknown) => {
    updates.push(update);
  });
  replace(t, Offer, "updateOne", async (_filter: unknown, update: unknown) => {
    updates.push(update);
  });

  assert.equal(await releaseExpiredHolds({ now: new Date() }), 1);
  assert.equal(updates.length, 2);

  updates.length = 0;
  releaseWins = false;
  assert.equal(await releaseExpiredHolds({ now: new Date() }), 0);
  assert.equal(updates.length, 0);
});
