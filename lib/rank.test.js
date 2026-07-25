import { test } from "node:test";
import assert from "node:assert/strict";
import { activeTopics, budgetFor, rankFromData, selectedLinks } from "./rank.js";

// Headlines must be lexically distinct or the de-duplicator will (correctly)
// collapse them: "Story 1"/"Story 2" both reduce to the single significant word
// {story}, scoring a perfect 1.0 word overlap. Real, unrelated headlines are
// the only honest fixture for testing selection.
const HEADLINES = [
  "Senate passes infrastructure package",
  "Wildfires spread across Portugal",
  "Quantum chip beats error threshold",
  "Central lender holds borrowing costs",
  "Archaeologists uncover Roman villa",
  "Comet brightens near Jupiter",
  "Tariffs hit imported steel",
  "Vaccine trial reports strong immunity",
  "Glacier retreat accelerates Greenland",
  "Satellite maps ocean currents",
  "Opera house reopens Vienna",
  "Harvest yields exceed forecasts",
  "Bridge collapse halts freight",
  "Reactor restarts under inspection",
  "Typhoon nears Okinawa coastline",
  "Museum acquires Rembrandt sketch",
  "Antitrust suit targets chipmaker",
  "Migration policy faces court challenge",
  "Telescope detects distant exoplanet",
  "Referendum splits coalition government",
];

const item = (n) => ({
  title: HEADLINES[n],
  link: `https://example.com/${n}`,
  source: "Test",
  date: "2026-07-25T12:00:00.000Z",
  summary: `Detail ${n}`, // under 80 chars, so body-text fingerprinting stays out of it
});

test("zero-star topics drop out, the rest sort by rating desc", () => {
  const order = activeTopics({ tech: 1, politics: 5, world: 3, culture: 0 });
  assert.deepEqual(order, ["politics", "world", "tech"]);
  assert.ok(!order.includes("culture"), "a 0-star topic must never be fetched or shown");
});

test("star rating maps to story budget", () => {
  assert.equal(budgetFor(0), 0);
  assert.equal(budgetFor(3), 4);
  assert.equal(budgetFor(5), 8);
  assert.equal(budgetFor(undefined), 4, "unknown ratings fall back, never crash");
});

test("each section is trimmed to its star budget", () => {
  const sections = rankFromData(
    { politics: { items: Array.from({ length: 20 }, (_, i) => item(i)) } },
    { ratings: { politics: 1 } } // 1 star = 2 stories
  );
  assert.equal(sections[0].items.length, 2);
});

test("a story running in two topics only appears in the higher-rated one", () => {
  const dup = item(0);
  const sections = rankFromData(
    { tech: { items: [dup, item(1)] }, ai: { items: [dup, item(2)] } },
    { ratings: { tech: 5, ai: 3 } }
  );
  const tech = sections.find((s) => s.key === "tech");
  const ai = sections.find((s) => s.key === "ai");
  assert.ok(tech.items.some((i) => i.link === dup.link), "higher-rated topic keeps it");
  assert.ok(!ai.items.some((i) => i.link === dup.link), "lower-rated topic must not repeat it");
});

test("dedup runs before the budget trim, so duplicates can't eat a slot", () => {
  const dup = item(0);
  // ai is 1-star (2 slots). If the trim ran first, `dup` would occupy one.
  const sections = rankFromData(
    { tech: { items: [dup] }, ai: { items: [dup, item(1), item(2)] } },
    { ratings: { tech: 1, ai: 1 } }
  );
  const ai = sections.find((s) => s.key === "ai");
  assert.deepEqual(
    ai.items.map((i) => i.link),
    [item(1).link, item(2).link],
    "ai fills both slots with real stories, not a duplicate"
  );
});

test("weather passes through untrimmed and keeps its payload", () => {
  const weather = { local: { city: "Denver", state: "CO", periods: [] }, alerts: [] };
  const sections = rankFromData({ weather }, { ratings: { weather: 1 } });
  assert.equal(sections[0].type, "weather");
  assert.deepEqual(sections[0].weather, weather);
});

test("missing or empty topic data yields an empty section, not a crash", () => {
  const sections = rankFromData({}, { ratings: { politics: 3 } });
  assert.equal(sections.length, 1);
  assert.deepEqual(sections[0].items, []);
});

test("selectedLinks returns exactly what survived selection", () => {
  const sections = rankFromData(
    { politics: { items: [item(1), item(2), item(3)] } },
    { ratings: { politics: 1 } } // 2 slots
  );
  assert.deepEqual([...selectedLinks(sections)], [item(1).link, item(2).link]);
});
