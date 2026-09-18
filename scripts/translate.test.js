import { test } from "node:test";
import assert from "node:assert/strict";
import { pendingStrings, cacheFromPublished, applyTranslations, MAX_PER_RUN } from "./translate.mjs";

// Ten countries at fourteen stories each: the real shape of a cold build.
const COUNTRIES = [
  ["jp", "ja"], ["de", "de"], ["kr", "ko"], ["cn", "zh"], ["fr", "fr"],
  ["ma", "ar"], ["eg", "ar"], ["mx", "es"], ["ar", "es"], ["br", "pt"],
];
const fullPool = (perCountry = 14) =>
  Object.fromEntries(
    COUNTRIES.map(([c, lang]) => [
      c,
      { lang, items: Array.from({ length: perCountry }, (_, i) => ({ title: `${c} title ${i}`, summary: `${c} summary ${i}` })) },
    ])
  );

const countriesIn = (rows) => [...new Set(rows.map((r) => r.country))];

// The regression. A country-major walk spent the whole budget on the first five
// countries, so the last three were never offered for translation at all.
test("every country gets budget, not just the ones early in the list", () => {
  const served = countriesIn(pendingStrings(fullPool(), new Map()).slice(0, MAX_PER_RUN));
  for (const [c] of COUNTRIES) {
    assert.ok(served.includes(c), `${c} got no share of the budget`);
  }
});

test("the budget is shared roughly evenly", () => {
  const slice = pendingStrings(fullPool(), new Map()).slice(0, MAX_PER_RUN);
  const counts = COUNTRIES.map(([c]) => slice.filter((r) => r.country === c).length);
  assert.ok(Math.max(...counts) - Math.min(...counts) <= 1, `uneven split: ${counts.join(",")}`);
});

test("titles are translated before any summary is attempted", () => {
  const slice = pendingStrings(fullPool(), new Map()).slice(0, MAX_PER_RUN);
  const firstSummary = slice.findIndex((r) => r.text.includes("summary"));
  const lastTitle = slice.map((r) => r.text.includes("title")).lastIndexOf(true);
  if (firstSummary !== -1) assert.ok(lastTitle < firstSummary, "a summary jumped ahead of a title");
});

test("a small pool is returned whole, titles first", () => {
  const pool = { br: { lang: "pt", items: [{ title: "t1", summary: "s1" }, { title: "t2", summary: "s2" }] } };
  assert.deepEqual(
    pendingStrings(pool, new Map()).map((r) => r.text),
    ["t1", "t2", "s1", "s2"]
  );
});

test("cached and duplicate strings are skipped", () => {
  const pool = {
    br: { lang: "pt", items: [{ title: "same", summary: "" }, { title: "same", summary: "" }] },
    mx: { lang: "es", items: [{ title: "cached", summary: "" }] },
  };
  const cache = new Map();
  const [onlyBr] = pendingStrings({ mx: pool.mx }, new Map());
  cache.set(onlyBr.k, "already done");
  const out = pendingStrings(pool, cache);
  assert.deepEqual(out.map((r) => r.text), ["same"], "duplicate dropped, cached one skipped");
});

test("the same text in two languages is translated separately", () => {
  const pool = {
    mx: { lang: "es", items: [{ title: "No", summary: "" }] },
    br: { lang: "pt", items: [{ title: "No", summary: "" }] },
  };
  assert.equal(pendingStrings(pool, new Map()).length, 2, "language is part of the cache key");
});

test("the published file round-trips as the cache", () => {
  const published = {
    countries: {
      br: [{ lang: "pt", title: "English title", titleOriginal: "Título", summary: "English body", summaryOriginal: "Corpo" }],
    },
  };
  const cache = cacheFromPublished(published);
  const pool = { br: { lang: "pt", items: [{ title: "Título", summary: "Corpo" }] } };
  assert.deepEqual(pendingStrings(pool, cache), [], "nothing left to translate");

  const applied = applyTranslations(pool, cache);
  assert.equal(applied.br[0].title, "English title");
  assert.equal(applied.br[0].titleOriginal, "Título");
  assert.equal(applied.br[0].translated, true);
});

test("an untranslated item keeps its original text and is marked untranslated", () => {
  const pool = { br: { lang: "pt", items: [{ title: "Título", summary: "Corpo" }] } };
  const applied = applyTranslations(pool, new Map());
  assert.equal(applied.br[0].title, "Título");
  assert.equal(applied.br[0].translated, false, "untranslated is a supported state, not a dropped story");
});

test("empty input never throws", () => {
  assert.deepEqual(pendingStrings({}, new Map()), []);
  assert.deepEqual(pendingStrings({ br: { lang: "pt", items: [] } }, new Map()), []);
});
