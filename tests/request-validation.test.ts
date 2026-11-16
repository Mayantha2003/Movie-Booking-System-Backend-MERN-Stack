import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import { Types } from "mongoose";
import { cancelBooking, createBooking, getAllBookings } from "../src/controllers/booking.controller";
import { getAllCinemas, getCinemaById } from "../src/controllers/cinema.controller";
import { getAllFoods, getFoodById } from "../src/controllers/food.controller";
import { createMovie, getMovieById, updateMovie } from "../src/controllers/movie.controller";
import { deleteOffer } from "../src/controllers/offer.controller";
import { getAllScreens, getScreenById } from "../src/controllers/screen.controller";
import { getAllShowtimes, getShowtimeById, getShowtimesByMovie } from "../src/controllers/showtime.controller";
import { UserModel } from "../src/models/user.model";
import { Booking } from "../src/models/booking.model";
import { Cinema } from "../src/models/cinema.model";
import { Food } from "../src/models/food.model";
import { MovieModel } from "../src/models/movie.model";
import { Offer } from "../src/models/offer.model";
import { Screen } from "../src/models/screen.model";
import { Showtime } from "../src/models/showtime.model";
import {
  isValidRequestObjectId,
  isValidRequestObjectIdArray,
  parseOptionalDateQuery,
  parseOptionalObjectIdQuery,
} from "../src/utils/requestValidation";
import { validateShowtimeInput } from "../src/utils/adminCrudInput";

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

test("shared request validators handle ObjectIds, optional IDs, ID arrays, and ISO dates", () => {
  const validId = new Types.ObjectId().toString();
  assert.equal(isValidRequestObjectId(validId), true);
  assert.equal(isValidRequestObjectId("malformed"), false);
  assert.equal(isValidRequestObjectId("abcdefghijkl"), false);
  assert.deepEqual(parseOptionalObjectIdQuery(undefined), { valid: true });
  assert.deepEqual(parseOptionalObjectIdQuery(validId), { valid: true, value: validId });
  assert.deepEqual(parseOptionalObjectIdQuery("bad"), { valid: false });
  assert.equal(isValidRequestObjectIdArray([validId, new Types.ObjectId().toString()]), true);
  assert.equal(isValidRequestObjectIdArray([validId, "bad"]), false);
  assert.equal(isValidRequestObjectIdArray(undefined), false);

  assert.equal(parseOptionalDateQuery(undefined).valid, true);
  assert.equal(parseOptionalDateQuery("2026-11-11").valid, true);
  assert.equal(parseOptionalDateQuery("2026-11-11T13:30:00+05:30").valid, true);
  assert.equal(parseOptionalDateQuery("2026-02-30").valid, false);
  assert.equal(parseOptionalDateQuery("not-a-date").valid, false);
  assert.equal(parseOptionalDateQuery(["2026-11-11"]).valid, false);

  const overnightShowtime = validateShowtimeInput({
    movie: validId,
    cinema: validId,
    screen: validId,
    showDate: "2026-11-11",
    startTime: "23:00",
    endTime: "01:00",
    ticketPrice: 100,
  }, true);
  assert.equal(typeof overnightShowtime, "object");
});

test("movie release-date inputs reject malformed dates before database operations", async (t) => {
  let queries = 0;
  replace(t, MovieModel, "create", async () => { queries += 1; });
  replace(t, MovieModel, "findById", async () => { queries += 1; });
  const res = response();
  await createMovie({
    body: {
      title: "Movie", description: "Description", genre: ["Drama"], language: "English",
      duration: 120, release_date: "2026-02-30", poster: "https://example.test/poster.jpg",
      director: "Director",
    },
  } as any, res);
  assert.equal(res.statusCode, 400);

  const updateRes = response();
  await updateMovie({
    params: { id: new Types.ObjectId().toString() },
    body: { release_date: "not-a-date" },
  } as any, updateRes);
  assert.equal(updateRes.statusCode, 400);
  assert.equal(queries, 0);
});

test("malformed route ObjectIds return 400 before model queries", async (t) => {
  let queries = 0;
  for (const model of [
    Booking, Cinema, Food, MovieModel, Offer, Screen, Showtime, UserModel,
  ]) {
    for (const method of ["findById", "findByIdAndDelete", "findOneAndDelete"]) {
      if (method in model) replace(t, model, method, async () => { queries += 1; });
    }
  }

  const cases: Array<[(req: any, res: any) => Promise<unknown>, any]> = [
    [getMovieById, { params: { id: "bad" } }],
    [getCinemaById, { params: { id: "bad" } }],
    [getScreenById, { params: { id: "bad" } }],
    [getFoodById, { params: { id: "bad" } }],
    [getShowtimeById, { params: { id: "bad" } }],
    [deleteOffer, { params: { id: "bad" } }],
    [cancelBooking, { params: { id: "bad" } }],
  ];

  for (const [handler, req] of cases) {
    const res = response();
    await handler(req, res);
    assert.equal(res.statusCode, 400);
    assert.equal(typeof res.body.message, "string");
  }
  assert.equal(queries, 0);
});

test("invalid query IDs, dates, booleans, categories, and statuses are rejected before queries", async (t) => {
  let queries = 0;
  for (const model of [Booking, Cinema, Food, Screen, Showtime]) {
    replace(t, model, "find", async () => {
      queries += 1;
      return [];
    });
  }

  const cases: Array<[(req: any, res: any) => Promise<unknown>, any]> = [
    [getAllCinemas, { query: { isActive: "yes" } }],
    [getAllScreens, { query: { cinema: "nope" } }],
    [getAllShowtimes, { query: { movie: "nope" } }],
    [getAllShowtimes, { query: { showDate: "2026-02-30" } }],
    [getShowtimesByMovie, { params: { movieId: new Types.ObjectId().toString() }, query: { date: "bad-date" } }],
    [getAllFoods, { query: { category: "Other$ne" } }],
    [getAllBookings, { query: { status: "Anything" } }],
  ];

  for (const [handler, req] of cases) {
    const res = response();
    await handler(req, res);
    assert.equal(res.statusCode, 400);
  }
  assert.equal(queries, 0);
});

test("booking rejects invalid ObjectIds inside food arrays before database access", async (t) => {
  let queries = 0;
  replace(t, Showtime, "findById", async () => { queries += 1; });
  const res = response();
  await createBooking({
    body: {
      showtimeId: new Types.ObjectId().toString(),
      seats: [{ row: "A", seatNumber: 1 }],
      foodItems: [
        { foodId: new Types.ObjectId().toString(), quantity: 1 },
        { foodId: { $ne: null }, quantity: 1 },
      ],
    },
  } as any, res);
  assert.equal(res.statusCode, 400);
  assert.equal(queries, 0);
});

test("existing valid date and ID query filters preserve showtime date behavior", async (t) => {
  const movie = new Types.ObjectId().toString();
  const date = "2026-11-11";
  let captured: Record<string, unknown> | undefined;
  const query = {
    populate() {
      return this;
    },
    sort() {
      return Promise.resolve([]);
    },
  };
  replace(t, Showtime, "find", (filter: Record<string, unknown>) => {
    captured = filter;
    return query;
  });
  const res = response();
  await getAllShowtimes({
    query: { movie, showDate: date, isActive: "true" },
  } as any, res);
  assert.equal(res.statusCode, 200);
  assert.equal(captured?.movie, movie);
  assert.equal((captured?.showDate as Date).toISOString(), "2026-11-11T00:00:00.000Z");
  assert.equal(captured?.isActive, true);

  let movieFilter: Record<string, unknown> | undefined;
  const movieQuery = {
    populate() {
      return this;
    },
    populateAgain() {
      return this;
    },
    sort() {
      return Promise.resolve([]);
    },
  };
  replace(t, Showtime, "find", (filter: Record<string, unknown>) => {
    movieFilter = filter;
    return movieQuery;
  });
  const movieRes = response();
  await getShowtimesByMovie({
    params: { movieId: movie },
    query: { date },
  } as any, movieRes);
  assert.equal(movieRes.statusCode, 200);
  assert.equal(movieFilter?.movie, movie);
  assert.ok(movieFilter?.showDate);
});
