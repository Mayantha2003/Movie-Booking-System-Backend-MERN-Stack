import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import { Types } from "mongoose";
import { createCinema, updateCinema } from "../src/controllers/cinema.controller";
import {
  createScreen,
  deleteScreen,
  updateScreen,
} from "../src/controllers/screen.controller";
import { createShowtime, updateShowtime } from "../src/controllers/showtime.controller";
import { createFood, updateFood } from "../src/controllers/food.controller";
import { createOffer, updateOffer } from "../src/controllers/offer.controller";
import { Cinema } from "../src/models/cinema.model";
import { Food } from "../src/models/food.model";
import { MovieModel } from "../src/models/movie.model";
import { Offer } from "../src/models/offer.model";
import { Screen } from "../src/models/screen.model";
import { Showtime } from "../src/models/showtime.model";
import {
  validateCinemaInput,
  validateFoodInput,
  validateOfferInput,
  validateScreenInput,
  validateShowtimeInput,
} from "../src/utils/adminCrudInput";

const replacements = new WeakMap<
  TestContext,
  WeakMap<object, Map<string, PropertyDescriptor | undefined>>
>();

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

const queryWithPopulate = (value: unknown) => ({
  populate() {
    return this;
  },
  then(resolve: (value: unknown) => unknown, reject: (error: unknown) => unknown) {
    return Promise.resolve(value).then(resolve, reject);
  },
});

const id = () => new Types.ObjectId();

test("resource input validators accept valid create/update payloads and reject invalid fields", () => {
  const cinema = {
    name: " Central Cinema ",
    location: "Colombo 03",
    address: "1 Main Street",
    city: "Colombo",
    email: " BOX@EXAMPLE.COM ",
    facilities: [" Parking "],
    isActive: true,
  };
  assert.equal(typeof validateCinemaInput(cinema, true), "object");
  assert.equal(typeof validateCinemaInput({ isActive: false }, false), "object");
  assert.equal(typeof validateCinemaInput({ ...cinema, createdAt: new Date() }, true), "string");
  assert.equal(typeof validateCinemaInput({ ...cinema, city: 3 }, true), "string");
  assert.equal(typeof validateCinemaInput({ name: "Cinema" }, true), "string");

  const screen = {
    cinema: id().toString(),
    name: "Screen 1",
    screenType: "Standard",
    rows: 2,
    seatsPerRow: 10,
    totalSeats: 20,
    seatLayout: [{ row: "A", seats: 10 }, { row: "B", seats: 10 }],
  };
  assert.equal(typeof validateScreenInput(screen, true), "object");
  assert.equal(typeof validateScreenInput({ isActive: false }, false), "object");
  assert.equal(typeof validateScreenInput({ ...screen, cinema: "bad-id" }, true), "string");
  assert.equal(typeof validateScreenInput({ ...screen, rows: 1.5 }, true), "string");
  assert.equal(typeof validateScreenInput({ ...screen, owner: "admin" }, true), "string");

  const showtime = {
    movie: id().toString(),
    cinema: screen.cinema,
    screen: id().toString(),
    showDate: "2026-12-10",
    startTime: "10:00",
    endTime: "12:00",
    ticketPrice: 1200,
  };
  assert.equal(typeof validateShowtimeInput(showtime, true), "object");
  assert.equal(typeof validateShowtimeInput({ isActive: true }, false), "object");
  assert.equal(typeof validateShowtimeInput({ ...showtime, showDate: "not-a-date" }, true), "string");
  assert.equal(typeof validateShowtimeInput({ ...showtime, endTime: "10:00" }, true), "string");
  assert.equal(typeof validateShowtimeInput({ ...showtime, ticketPrice: -1 }, true), "string");

  const food = { name: "Popcorn", category: "Popcorn", price: 500, isVegetarian: false };
  assert.equal(typeof validateFoodInput(food, true), "object");
  assert.equal(typeof validateFoodInput({ isVegetarian: true }, false), "object");
  assert.equal(typeof validateFoodInput({ ...food, price: "500" }, true), "string");
  assert.equal(typeof validateFoodInput({ ...food, isAvailable: "true" }, true), "string");

  const offer = {
    code: "SAVE10",
    description: "Ten percent off",
    discountType: "percentage",
    discountValue: 10,
    validFrom: "2026-12-01",
    validTo: "2026-12-31",
  };
  assert.equal(typeof validateOfferInput(offer, true), "object");
  assert.equal(typeof validateOfferInput({ isActive: false }, false), "object");
  assert.equal(typeof validateOfferInput({ ...offer, discountValue: 101 }, true), "string");
  assert.equal(typeof validateOfferInput({ ...offer, validTo: "2026-11-30" }, true), "string");
  assert.equal(typeof validateOfferInput({ ...offer, usedCount: 0 }, true), "string");
});

test("all five resource create handlers persist only validated allowlisted data", async (t) => {
  const cinemaId = id();
  const movieId = id();
  const screenId = id();
  replace(t, Cinema, "create", async (value: unknown) => value);
  replace(t, Cinema, "findById", async () => ({ _id: cinemaId }));
  replace(t, Screen, "create", async (value: unknown) => value);
  replace(t, MovieModel, "findById", async () => ({ _id: movieId }));
  replace(t, Screen, "findById", async () => ({ _id: screenId, cinema: cinemaId, totalSeats: 20 }));
  replace(t, Showtime, "create", async (value: unknown) => value);
  replace(t, Food, "create", async (value: unknown) => value);
  replace(t, Offer, "findOne", async () => null);
  replace(t, Offer, "create", async (value: unknown) => value);

  const baseCinema = { name: "Central", location: "Colombo", address: "1 Main", city: "Colombo" };
  const cinemaResponse = response();
  await createCinema({ body: baseCinema } as any, cinemaResponse);
  assert.equal(cinemaResponse.statusCode, 201);
  assert.equal(cinemaResponse.body.data.name, "Central");

  const screenResponse = response();
  await createScreen({
    body: {
      cinema: cinemaId.toString(), name: "Screen 1", rows: 2, seatsPerRow: 10,
      totalSeats: 20, seatLayout: [{ row: "A", seats: 10 }, { row: "B", seats: 10 }],
    },
  } as any, screenResponse);
  assert.equal(screenResponse.statusCode, 201);
  assert.equal(screenResponse.body.data.totalSeats, 20);
  assert.equal("_id" in screenResponse.body.data, false);

  const showtimeResponse = response();
  await createShowtime({
    body: {
      movie: movieId.toString(), cinema: cinemaId.toString(), screen: screenId.toString(),
      showDate: "2026-12-10", startTime: "10:00", endTime: "12:00", ticketPrice: 1200,
    },
  } as any, showtimeResponse);
  assert.equal(showtimeResponse.statusCode, 201);
  assert.equal(showtimeResponse.body.data.availableSeats, 20);

  const foodResponse = response();
  await createFood({ body: { name: "Popcorn", category: "Popcorn", price: 500 } } as any, foodResponse);
  assert.equal(foodResponse.statusCode, 201);

  const offerResponse = response();
  await createOffer({
    body: {
      code: "SAVE10", description: "Ten percent off", discountType: "percentage",
      discountValue: 10, validFrom: "2026-12-01", validTo: "2026-12-31",
    },
  } as any, offerResponse);
  assert.equal(offerResponse.statusCode, 201);
  assert.equal(offerResponse.body.data.code, "SAVE10");
});

test("all five resource update handlers use explicit $set updates and run validators", async (t) => {
  const cinemaId = id();
  const movieId = id();
  const screenId = id();
  const showtimeId = id();
  const foodId = id();
  const offerId = id();
  const validFrom = new Date("2026-12-01T00:00:00.000Z");
  const validTo = new Date("2026-12-31T00:00:00.000Z");
  const screenCurrent = {
    cinema: cinemaId, name: "Screen 1", screenType: "Standard",
    rows: 2, seatsPerRow: 10, totalSeats: 20,
    seatLayout: [{ row: "A", seats: 10 }, { row: "B", seats: 10 }],
    toObject() {
      return {
        cinema: this.cinema, name: this.name, screenType: this.screenType,
        rows: this.rows, seatsPerRow: this.seatsPerRow, totalSeats: this.totalSeats,
        seatLayout: this.seatLayout,
      };
    },
  };
  const showtimeCurrent = {
    movie: movieId, cinema: cinemaId, screen: screenId,
    showDate: new Date("2026-12-10T00:00:00.000Z"),
    startTime: "10:00", endTime: "12:00", ticketPrice: 1200,
  };
  const offerCurrent = {
    _id: offerId, code: "SAVE10", description: "Ten percent off",
    discountType: "percentage", discountValue: 10,
    minAmount: 0, maxDiscount: undefined, usageLimit: undefined, isActive: true,
    validFrom, validTo,
    toObject() {
      return {
        code: this.code, description: this.description, discountType: this.discountType,
        discountValue: this.discountValue, minAmount: this.minAmount,
        maxDiscount: this.maxDiscount, usageLimit: this.usageLimit,
        isActive: this.isActive, validFrom: this.validFrom, validTo: this.validTo,
      };
    },
  };
  const updateCalls = new Map<string, { update: any; options: any }>();
  const updateStub = (model: object, key: string, value: unknown) => {
    replace(t, model, "findByIdAndUpdate", (_id: string, update: unknown, options: unknown) => {
      updateCalls.set(key, { update, options });
      return value;
    });
  };
  replace(t, Cinema, "findByIdAndUpdate", async (_id: string, update: unknown, options: unknown) => {
    updateCalls.set("cinema", { update, options });
    return { _id: cinemaId };
  });
  replace(t, Screen, "findById", async () => screenCurrent);
  replace(t, Cinema, "findById", async () => ({ _id: cinemaId }));
  updateStub(Screen, "screen", queryWithPopulate({ _id: screenId }));
  replace(t, MovieModel, "findById", async () => ({ _id: movieId }));
  replace(t, Showtime, "findById", async () => showtimeCurrent);
  replace(t, Showtime, "exists", async () => null);
  replace(t, Screen, "findById", async () => ({ ...screenCurrent, cinema: cinemaId }));
  updateStub(Showtime, "showtime", queryWithPopulate({ _id: showtimeId }));
  updateStub(Food, "food", { _id: foodId });
  replace(t, Offer, "findById", async () => offerCurrent);
  replace(t, Offer, "findOne", async () => null);
  updateStub(Offer, "offer", { _id: offerId });

  const cinemaResponse = response();
  await updateCinema({ params: { id: cinemaId.toString() }, body: { name: "Updated" } } as any, cinemaResponse);
  assert.equal(cinemaResponse.statusCode, 200);

  const screenResponse = response();
  await updateScreen({
    params: { id: screenId.toString() },
    body: {
      cinema: cinemaId.toString(), name: "Screen 1", screenType: "Standard",
      rows: 2, seatsPerRow: 10, totalSeats: 20,
      seatLayout: [{ row: "A", seats: 10 }, { row: "B", seats: 10 }],
    },
  } as any, screenResponse);
  assert.equal(screenResponse.statusCode, 200);

  const showtimeResponse = response();
  await updateShowtime({
    params: { id: showtimeId.toString() },
    body: { movie: movieId.toString(), cinema: cinemaId.toString(), screen: screenId.toString(), isActive: false },
  } as any, showtimeResponse);
  assert.equal(showtimeResponse.statusCode, 200);

  const foodResponse = response();
  await updateFood({ params: { id: foodId.toString() }, body: { price: 600 } } as any, foodResponse);
  assert.equal(foodResponse.statusCode, 200);

  const offerResponse = response();
  await updateOffer({
    params: { id: offerId.toString() },
    body: { discountValue: 15, maxDiscount: "" },
  } as any, offerResponse);
  assert.equal(offerResponse.statusCode, 200);

  for (const key of ["cinema", "screen", "showtime", "food", "offer"]) {
    const call = updateCalls.get(key);
    assert.ok(call, `${key} update was invoked`);
    assert.ok(call.update.$set, `${key} update uses $set`);
    assert.equal(call.options.runValidators, true, `${key} enables update validators`);
  }
  assert.equal(updateCalls.get("offer")?.update.$unset.maxDiscount, 1);
});

test("screen seating and cinema cannot change or be deleted while showtimes use them", async (t) => {
  const screenId = id();
  const cinemaId = id();
  const current = {
    _id: screenId,
    cinema: cinemaId,
    name: "Screen 1",
    screenType: "Standard",
    rows: 2,
    seatsPerRow: 10,
    totalSeats: 20,
    seatLayout: [{ row: "A", seats: 10 }, { row: "B", seats: 10 }],
    toObject() {
      return {
        cinema: this.cinema,
        name: this.name,
        screenType: this.screenType,
        rows: this.rows,
        seatsPerRow: this.seatsPerRow,
        totalSeats: this.totalSeats,
        seatLayout: this.seatLayout,
      };
    },
  };
  let writes = 0;
  replace(t, Screen, "findById", async () => current);
  replace(t, Showtime, "exists", async () => ({ _id: id() }));
  replace(t, Screen, "findByIdAndUpdate", async () => { writes += 1; });
  replace(t, Screen, "findByIdAndDelete", async () => { writes += 1; });

  const updateResponse = response();
  await updateScreen({
    params: { id: screenId.toString() },
    body: {
      rows: 3,
      seatsPerRow: 10,
      totalSeats: 30,
      seatLayout: [
        { row: "A", seats: 10 },
        { row: "B", seats: 10 },
        { row: "C", seats: 10 },
      ],
    },
  } as any, updateResponse);
  assert.equal(updateResponse.statusCode, 409);

  const cinemaChangeResponse = response();
  await updateScreen({
    params: { id: screenId.toString() },
    body: { cinema: id().toString() },
  } as any, cinemaChangeResponse);
  assert.equal(cinemaChangeResponse.statusCode, 409);

  const deleteResponse = response();
  await deleteScreen({ params: { id: screenId.toString() } } as any, deleteResponse);
  assert.equal(deleteResponse.statusCode, 409);
  assert.equal(writes, 0);
});

test("descriptive screen updates remain available while showtimes use the screen", async (t) => {
  const screenId = id();
  const cinemaId = id();
  const current = {
    _id: screenId,
    cinema: cinemaId,
    name: "Screen 1",
    screenType: "Standard",
    rows: 2,
    seatsPerRow: 10,
    totalSeats: 20,
    seatLayout: [
      { _id: id(), row: "A", seats: 10 },
      { _id: id(), row: "B", seats: 10 },
    ],
    toObject() {
      return {
        cinema: this.cinema,
        name: this.name,
        screenType: this.screenType,
        rows: this.rows,
        seatsPerRow: this.seatsPerRow,
        totalSeats: this.totalSeats,
        seatLayout: this.seatLayout,
      };
    },
  };
  replace(t, Screen, "findById", async () => current);
  replace(t, Showtime, "exists", async () => ({ _id: id() }));
  replace(t, Cinema, "findById", async () => ({ _id: cinemaId }));
  replace(
    t,
    Screen,
    "findByIdAndUpdate",
    () => queryWithPopulate({ _id: screenId, name: "Updated" })
  );

  const res = response();
  await updateScreen({
    params: { id: screenId.toString() },
    body: { name: "Updated" },
  } as any, res);

  assert.equal(res.statusCode, 200);
});

test("invalid IDs, mass-assignment fields, relationships, and inconsistent capacities are rejected before writes", async (t) => {
  let writes = 0;
  replace(t, Cinema, "create", async () => { writes += 1; });
  replace(t, Screen, "create", async () => { writes += 1; });
  replace(t, Cinema, "findById", async () => ({ _id: id() }));
  const invalidCinema = response();
  await updateCinema({ params: { id: "invalid" }, body: { isActive: false } } as any, invalidCinema);
  assert.equal(invalidCinema.statusCode, 400);

  const protectedFoodField = response();
  await createFood({
    body: { name: "Popcorn", category: "Popcorn", price: 500, createdAt: new Date() },
  } as any, protectedFoodField);
  assert.equal(protectedFoodField.statusCode, 400);

  const mismatchedScreen = response();
  await createScreen({
    body: {
      cinema: id().toString(), name: "Screen 2", rows: 2, seatsPerRow: 10, totalSeats: 21,
    },
  } as any, mismatchedScreen);
  assert.equal(mismatchedScreen.statusCode, 400);
  assert.equal(writes, 0);
});
