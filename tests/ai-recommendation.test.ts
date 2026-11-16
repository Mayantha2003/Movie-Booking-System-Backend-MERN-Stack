import assert from "node:assert/strict";
import test from "node:test";
import {
  buildUserPrompt,
  fallbackRecommendations,
  parseAiRecommendations,
  type CatalogMovie,
} from "../src/services/aiRecommendation.service";

const movies: CatalogMovie[] = [
  { _id: "a1", title: "Laugh Riot", description: "", genre: ["Comedy"], language: "English", duration: 95, rating: 7.1, recentTickets: 40 },
  { _id: "b2", title: "Night Siege", description: "", genre: ["Action"], language: "English", duration: 130, rating: 8.2, recentTickets: 120 },
  { _id: "c3", title: "Quiet Hearts", description: "", genre: ["Drama"], language: "Sinhala", duration: 110, rating: 9.0, recentTickets: 0 },
];

test("AI output: keeps only catalogue ids, removes duplicates, fills empty reasons", () => {
  const raw = '```json\n{"recommendations":[{"id":"b2","reason":"Crowd favourite."},{"id":"HACKED","reason":"x"},{"id":"b2","reason":"dup"},{"id":"a1","reason":""}]}\n```';
  const result = parseAiRecommendations(raw, movies);
  assert.deepEqual(result.map((r) => r.movieId), ["b2", "a1"]);
  assert.equal(result[0].reason, "Crowd favourite.");
  assert.ok(result[1].reason.length > 0);
});

test("AI output: invalid JSON or wrong shape gives an empty list", () => {
  assert.deepEqual(parseAiRecommendations("not json", movies), []);
  assert.deepEqual(parseAiRecommendations('{"recommendations":"nope"}', movies), []);
});

test("fallback: most booked + well rated movie ranks first", () => {
  const result = fallbackRecommendations(movies);
  assert.equal(result[0].movieId, "b2");
  assert.match(result[0].reason, /120 tickets/);
});

test("fallback: with no bookings at all, rating decides", () => {
  const noSales = movies.map((m) => ({ ...m, recentTickets: 0 }));
  const result = fallbackRecommendations(noSales);
  assert.equal(result[0].movieId, "c3");
  assert.match(result[0].reason, /9\.0\/10/);
});

test("prompt: contains ticket counts and ratings only (no free text from users)", () => {
  const prompt = buildUserPrompt(movies);
  assert.match(prompt, /"tickets14d":120/);
  assert.match(prompt, /"rating":8.2/);
});