import { test } from "node:test";
import assert from "node:assert/strict";
import { SPORTS_LEAGUES, leaguesBySport, normalizeLeagues, DEFAULT_PREFS } from "./topics.js";
import { fetchSportsFrom, merge } from "./sports.js";
import { publisherOf } from "./rank.js";

// Headlines must be lexically distinct: merge() runs dedupeByTitle at a 0.8
// word-overlap threshold, so "motorsport.com report 1" and "motorsport.com
// report 2" are one story as far as the pipeline is concerned — and a fixture
// built that way tests the de-duplicator instead of the thing under test.
const HEADLINES = [
  "Ducati unveils blank-sheet chassis",
  "Silverstone qualifying washed out",
  "Rookie signs multiyear extension",
  "Aragon tarmac resurfaced overnight",
  "Engine freeze debate returns",
  "Paddock passes hit by fraud",
  "Broadcaster orders documentary series",
  "Steward penalties draw criticism",
  "Aerodynamic upgrade clears scrutineering",
  "Title lead narrows to nine",
  "Team principal departs abruptly",
  "Sprint format trialled again",
  "Tyre supplier extends contract",
  "Wind tunnel allocation reduced",
  "Home fixture moves cities",
  "Regional rights sold separately",
  "Junior academy expands scouting",
  "Budget cap breach investigated",
  "Fuel regulations delayed twelve months",
  "Grandstand capacity doubles",
  "Simulator driver promoted",
  "Pit crew record tumbles",
  "Safety procedures rewritten",
  "Circuit licence renewed",
  "Livery revealed before testing",
  "Injury forces late substitution",
];

// `n` indexes HEADLINES and must be unique per item within a test.
const from = (host, n, hoursAgo) => ({
  title: HEADLINES[n],
  link: `https://www.${host}/${n}`,
  source: host,
  date: new Date(Date.parse("2026-08-21T00:00:00Z") - hoursAgo * 3600000).toISOString(),
});

// ── registry ─────────────────────────────────────────────────────────────────

test("every league carries its own outlets, not just ESPN", () => {
  for (const [key, league] of Object.entries(SPORTS_LEAGUES)) {
    assert.ok(league.sport, `${key} must belong to a sport`);
    assert.ok(league.label, `${key} must have a label`);
    assert.ok(
      (league.feeds || []).length >= 2,
      `${key} has ${(league.feeds || []).length} feed(s) — one source per league is what this change exists to end`
    );
    for (const url of league.feeds) {
      assert.ok(url.startsWith("https://"), `${key}: ${url} must be https`);
    }
  }
});

test("Motor Racing expands to the four series, and Racing is gone", () => {
  assert.equal(SPORTS_LEAGUES.racing, undefined, "the old catch-all key must not linger");
  const motor = leaguesBySport().find(([sport]) => sport === "Motor Racing");
  assert.ok(motor, "Motor Racing is a sport in the picker");
  assert.deepEqual(
    motor[1].map(([key]) => key),
    ["f1", "nascar", "motogp", "indycar"]
  );
  assert.deepEqual(
    motor[1].map(([, l]) => l.label),
    ["Formula 1", "NASCAR", "MotoGP", "IndyCar"]
  );
});

test("MotoGP has no ESPN endpoint and must not pretend otherwise", () => {
  assert.equal(SPORTS_LEAGUES.motogp.espn, undefined);
  assert.ok(SPORTS_LEAGUES.motogp.feeds.length >= 3, "so its RSS roster has to carry it alone");
});

test("every league appears exactly once in the grouped picker", () => {
  const flat = leaguesBySport().flatMap(([, leagues]) => leagues.map(([key]) => key));
  assert.deepEqual([...flat].sort(), Object.keys(SPORTS_LEAGUES).sort());
  assert.equal(new Set(flat).size, flat.length, "no league listed under two sports");
});

// ── league key migration ─────────────────────────────────────────────────────

test('a saved "racing" pref becomes Formula 1 rather than vanishing', () => {
  assert.deepEqual(normalizeLeagues(["racing"]), ["f1"]);
  assert.deepEqual(normalizeLeagues(["nfl", "racing"]), ["nfl", "f1"]);
});

test("aliasing can't produce a duplicate", () => {
  assert.deepEqual(normalizeLeagues(["racing", "f1"]), ["f1"]);
});

test("unknown or empty league lists fall back to the defaults, never to nothing", () => {
  assert.deepEqual(normalizeLeagues(["quidditch"]), DEFAULT_PREFS.leagues);
  assert.deepEqual(normalizeLeagues([]), DEFAULT_PREFS.leagues);
  assert.deepEqual(normalizeLeagues(undefined), DEFAULT_PREFS.leagues);
});

// ── merge ────────────────────────────────────────────────────────────────────

test("the F1 case: no single outlet owns the section", () => {
  // Motorsport.com files all day; the beat sites file a few times.
  const data = {
    leagues: {
      f1: merge(
        [
          Array.from({ length: 12 }, (_, i) => from("motorsport.com", i, i)),
          Array.from({ length: 3 }, (_, i) => from("autosport.com", 12 + i, i)),
          Array.from({ length: 2 }, (_, i) => from("planetf1.com", 15 + i, i)),
          Array.from({ length: 2 }, (_, i) => from("racefans.net", 17 + i, i)),
        ],
        12
      ),
    },
  };
  const picked = fetchSportsFrom(data, ["f1"], 8);
  const counts = {};
  for (const it of picked) counts[publisherOf(it)] = (counts[publisherOf(it)] || 0) + 1;
  assert.equal(picked.length, 8, "still fills the budget");
  assert.ok(Object.keys(counts).length >= 3, `expected a mix, got ${JSON.stringify(counts)}`);
  assert.ok(counts["motorsport.com"] <= 3, "the loudest outlet is capped at a third");
});

test("a quiet league is not buried by a busy one", () => {
  const data = {
    leagues: {
      nfl: Array.from({ length: 12 }, (_, i) => from("espn.com", i, i)),
      motogp: Array.from({ length: 4 }, (_, i) => from("crash.net", 12 + i, 20 + i)),
    },
  };
  const picked = fetchSportsFrom(data, ["nfl", "motogp"], 8);
  assert.ok(
    picked.some((it) => publisherOf(it) === "crash.net"),
    "MotoGP survives an in-season NFL feed even though every NFL item is newer"
  );
});

test("the same story filed by two leagues is only shown once", () => {
  const shared = from("motorsport.com", 1, 1);
  const data = { leagues: { f1: [shared, from("planetf1.com", 2, 2)], indycar: [shared] } };
  const picked = fetchSportsFrom(data, ["f1", "indycar"], 8);
  assert.equal(picked.filter((it) => it.link === shared.link).length, 1);
});

test("a league with no prebuilt data yields nothing, not a crash", () => {
  assert.deepEqual(fetchSportsFrom(null, ["f1"], 8), []);
  assert.deepEqual(fetchSportsFrom({ leagues: {} }, ["f1"], 8), []);
});

test("output stays newest-first for the reader", () => {
  const data = {
    leagues: {
      f1: [from("a.com", 1, 5), from("b.com", 2, 1), from("c.com", 3, 9)],
    },
  };
  const dates = fetchSportsFrom(data, ["f1"], 8).map((i) => Date.parse(i.date));
  assert.deepEqual(dates, [...dates].sort((a, b) => b - a));
});
