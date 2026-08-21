import { test } from "node:test";
import assert from "node:assert/strict";
import { encodePrefs, decodePrefs, prefsSignature } from "./prefsPayload.js";
import { DEFAULT_PREFS, TOPICS } from "./topics.js";
import { digestFromData } from "./publishedDigest.js";

const MINE = {
  zip: "84101",
  theme: "dark",
  leagues: ["f1", "nascar"],
  ratings: { ...DEFAULT_PREFS.ratings, sports: 5, gaming: 0, politics: 0 },
};

// ── round trip ───────────────────────────────────────────────────────────────

test("what the browser writes is what the newsletter reads", () => {
  const back = decodePrefs(encodePrefs(MINE));
  assert.equal(back.zip, "84101");
  assert.equal(back.theme, "dark");
  assert.deepEqual(back.leagues, ["f1", "nascar"]);
  assert.equal(back.ratings.sports, 5);
  assert.equal(back.ratings.gaming, 0, "a topic turned off must survive the trip");
});

test("the payload stays small enough to live in a contact property", () => {
  assert.ok(encodePrefs(MINE).length < 2000, "one HubSpot text property, not a document");
});

// ── decode is a trust boundary ───────────────────────────────────────────────

test("junk from HubSpot yields null, never an exception", () => {
  for (const junk of ["", "   ", "not json", "[]", "null", "42", '"a string"', undefined, null, 7, {}]) {
    assert.doesNotThrow(() => decodePrefs(junk));
    assert.equal(decodePrefs(junk), null, `${JSON.stringify(junk)} must not be trusted`);
  }
});

test("an absurdly large value is rejected before parsing", () => {
  assert.equal(decodePrefs(JSON.stringify({ zip: "x".repeat(50000) })), null);
});

test("out-of-range ratings are clamped, not passed through", () => {
  const r = decodePrefs(JSON.stringify({ ratings: { politics: 99, world: -4, tech: 2.6 } })).ratings;
  assert.equal(r.politics, 5);
  assert.equal(r.world, 0);
  assert.equal(r.tech, 3, "fractional ratings round rather than breaking budgetFor");
});

test("non-numeric and unknown ratings can't poison the digest", () => {
  const r = decodePrefs(JSON.stringify({ ratings: { politics: "lots", nonsense: 5 } })).ratings;
  assert.equal(r.politics, DEFAULT_PREFS.ratings.politics, "garbage falls back to the default");
  assert.equal(r.nonsense, undefined, "a topic we don't have is dropped");
  assert.deepEqual(Object.keys(r).sort(), Object.keys(TOPICS).sort());
});

test("a topic added after the reader last synced gets its default, not zero", () => {
  // An old payload predating several topics.
  const old = JSON.stringify({ v: 1, ratings: { politics: 5 } });
  const r = decodePrefs(old).ratings;
  assert.equal(r.politics, 5, "what they chose is kept");
  assert.equal(r.space, DEFAULT_PREFS.ratings.space, "what they never saw defaults on");
});

test("a bad zip or theme falls back rather than reaching the weather API", () => {
  const p = decodePrefs(JSON.stringify({ zip: "8410", theme: "neon" }));
  assert.equal(p.zip, "");
  assert.equal(p.theme, "light");
  assert.equal(decodePrefs(JSON.stringify({ zip: "'; DROP--" })).zip, "");
});

test("the retired racing league still resolves for anyone who synced before the split", () => {
  assert.deepEqual(decodePrefs(JSON.stringify({ leagues: ["racing"] })).leagues, ["f1"]);
});

test("a non-array leagues value is ignored instead of crashing", () => {
  assert.deepEqual(decodePrefs(JSON.stringify({ leagues: "f1" })).leagues, DEFAULT_PREFS.leagues);
  assert.deepEqual(decodePrefs(JSON.stringify({ leagues: [1, null, "f1"] })).leagues, ["f1"]);
});

// ── grouping ─────────────────────────────────────────────────────────────────

test("identical settings share one signature, so one brief is built for both", () => {
  assert.equal(prefsSignature(MINE), prefsSignature({ ...MINE }));
  assert.notEqual(prefsSignature(MINE), prefsSignature({ ...MINE, theme: "light" }));
  assert.equal(prefsSignature(null), "default");
});

// ── the actual complaint: settings must change the brief ─────────────────────

const story = (n) => ({
  title: ["Senate passes package", "Wildfires spread", "Quantum chip beats threshold", "Comet brightens"][n],
  link: `https://example.com/${n}`,
  source: "Test",
  date: "2026-08-20T12:00:00.000Z",
});

test("two subscribers reading the same pool get different briefs", () => {
  const pool = {
    politics: { items: [story(0), story(1)] },
    tech: { items: [story(2), story(3)] },
    sports: { leagues: {} },
  };
  const reader = digestFromData(pool, { ratings: { politics: 0, tech: 3 }, leagues: ["f1"] });
  const wonk = digestFromData(pool, { ratings: { politics: 3, tech: 0 }, leagues: ["f1"] });

  assert.deepEqual(reader.sections.map((s) => s.key), ["tech"]);
  assert.deepEqual(wonk.sections.map((s) => s.key), ["politics"]);
});

test("a subscriber's league choice reaches their sports section", () => {
  const pool = {
    sports: {
      leagues: {
        f1: [{ title: "Aragon tarmac resurfaced", link: "https://autosport.com/1", date: "2026-08-20T10:00:00Z" }],
        nfl: [{ title: "Rookie signs extension", link: "https://espn.com/2", date: "2026-08-20T11:00:00Z" }],
      },
    },
  };
  const links = (leagues) =>
    digestFromData(pool, { ratings: { sports: 3 }, leagues }).sections[0].items.map((i) => i.link);

  assert.deepEqual(links(["f1"]), ["https://autosport.com/1"], "picking Formula 1 must not deliver NFL");
  assert.deepEqual(links(["nfl"]), ["https://espn.com/2"]);
});
