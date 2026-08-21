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

// ── publisher diversity ──────────────────────────────────────────────────────
import { diversify, publisherOf } from "./rank.js";

const from = (host, n, hoursAgo) => ({
  title: `${host} story ${n}`,
  link: `https://www.${host}/${n}`,
  source: ` ${host} `,
  date: new Date(Date.parse("2026-08-21T00:00:00Z") - hoursAgo * 3600000).toISOString(),
});

test("publisher is read from the link, not the ragged RSS source title", () => {
  assert.equal(publisherOf({ link: "https://www.polygon.com/a", source: " Polygon.com " }), "polygon.com");
  assert.equal(publisherOf({ link: "https://kotaku.com/b" }), "kotaku.com");
  assert.equal(publisherOf({ source: " Fallback News " }), "fallback news", "no link: fall back to source");
});

test("the real Gaming case: one publisher can no longer take the whole section", () => {
  // Exactly what shipped: 9 consecutive Polygon posts, then Kotaku.
  const items = [
    ...Array.from({ length: 9 }, (_, i) => from("polygon.com", i, i)),
    ...Array.from({ length: 9 }, (_, i) => from("kotaku.com", i, 10 + i)),
  ];
  const picked = diversify(items, 8);
  const hosts = new Set(picked.map(publisherOf));
  assert.equal(picked.length, 8, "still fills the budget");
  assert.ok(hosts.size >= 2, "more than one publisher survives");
  // Only two publishers exist here, so the best achievable split is 4/4 —
  // the point is that no outlet runs away with the section.
  const polygon = picked.filter((i) => publisherOf(i) === "polygon.com").length;
  const kotaku = picked.filter((i) => publisherOf(i) === "kotaku.com").length;
  assert.deepEqual([polygon, kotaku], [4, 4], "even split, not 8-0 or 5-3");
});

test("three publishers share an 8-slot section evenly", () => {
  const items = [
    ...Array.from({ length: 8 }, (_, i) => from("a.com", i, i)),
    ...Array.from({ length: 8 }, (_, i) => from("b.com", i, i)),
    ...Array.from({ length: 8 }, (_, i) => from("c.com", i, i)),
  ];
  const counts = {};
  for (const it of diversify(items, 8)) counts[publisherOf(it)] = (counts[publisherOf(it)] || 0) + 1;
  assert.deepEqual(Object.keys(counts).sort(), ["a.com", "b.com", "c.com"]);
  for (const n of Object.values(counts)) assert.ok(n <= 3, "nobody exceeds the cap");
});

test("a lone publisher still fills the budget rather than starving the section", () => {
  const items = Array.from({ length: 10 }, (_, i) => from("only.com", i, i));
  assert.equal(diversify(items, 8).length, 8, "8 from one outlet beats 3 from one outlet");
});

test("output stays newest-first even though selection is by variety", () => {
  const items = [
    ...Array.from({ length: 6 }, (_, i) => from("loud.com", i, i)),
    from("quiet.com", 0, 20),
  ];
  const picked = diversify(items, 4);
  const dates = picked.map((i) => Date.parse(i.date));
  assert.deepEqual(dates, [...dates].sort((a, b) => b - a), "chronological for the reader");
});

test("an empty budget yields nothing", () => {
  assert.deepEqual(diversify([from("a.com", 1, 1)], 0), []);
});
