import { test } from "node:test";
import assert from "node:assert/strict";
import { COUNTRIES, COUNTRY_KEYS, DEFAULT_COUNTRIES, normalizeCountries, foreignFrom } from "./foreign.js";
import { DEFAULT_PREFS, TOPICS } from "./topics.js";
import { cacheFromPublished, pendingStrings, applyTranslations } from "../scripts/translate.mjs";

// M2M100 source-language codes. A typo here means a whole country silently
// stops translating, which looks identical to "no news today".
const M2M100 = new Set(["ja", "de", "ko", "zh", "ar", "fr", "es", "pt"]);

const story = (n, title, summary = "") => ({
  title,
  summary,
  link: `https://example.com/${n}`,
  source: "Test",
  date: `2026-08-2${n % 10}T09:00:00.000Z`,
});

// ── registry ─────────────────────────────────────────────────────────────────

test("every country the reader was promised is present", () => {
  for (const c of ["jp", "de", "kr", "cn", "fr", "ma", "eg", "mx", "ar", "br"]) {
    assert.ok(COUNTRIES[c], `${c} is missing from the registry`);
  }
});

test("each country declares a translatable language and real feeds", () => {
  for (const [key, c] of Object.entries(COUNTRIES)) {
    assert.ok(c.label, `${key} needs a label`);
    assert.ok(c.language, `${key} needs a human-readable language name`);
    assert.ok(M2M100.has(c.lang), `${key}: "${c.lang}" is not an M2M100 source code`);
    assert.ok(c.feeds.length >= 2, `${key} has too few feeds to be a view of a country`);
    for (const url of c.feeds) assert.match(url, /^https?:\/\//, `${key}: ${url}`);
  }
});

test("Foreign Reporting is a real topic with a default rating", () => {
  assert.equal(TOPICS.foreign.label, "Foreign Reporting");
  assert.equal(TOPICS.foreign.feeds.length, 0, "it is prebuilt per country, not per topic");
  assert.ok(DEFAULT_PREFS.ratings.foreign > 0, "on by default, as asked");
});

test("the default country list in topics.js matches lib/foreign.js", () => {
  // They are deliberately duplicated to avoid an import cycle; this is the
  // thing that keeps the duplication honest.
  assert.deepEqual(DEFAULT_PREFS.countries, DEFAULT_COUNTRIES);
  for (const c of DEFAULT_COUNTRIES) assert.ok(COUNTRIES[c], `${c} is not a country`);
});

// ── selection ────────────────────────────────────────────────────────────────

test("unknown countries are dropped and an empty pick falls back", () => {
  assert.deepEqual(normalizeCountries(["jp", "atlantis"]), ["jp"]);
  assert.deepEqual(normalizeCountries([]), DEFAULT_COUNTRIES);
  assert.deepEqual(normalizeCountries(undefined), DEFAULT_COUNTRIES);
  assert.deepEqual(normalizeCountries(["jp", "jp"]), ["jp"]);
});

test("only the countries a reader picked appear", () => {
  const data = {
    countries: {
      jp: [story(1, "Tokyo budget passes")],
      de: [story(2, "Bundestag debates energy")],
      br: [story(3, "Amazon deforestation falls")],
    },
  };
  const links = (picks) => foreignFrom(data, picks, 10).map((i) => i.link);
  assert.deepEqual(links(["jp"]), ["https://example.com/1"]);
  assert.equal(links(["jp", "br"]).length, 2);
  assert.ok(!links(["jp", "br"]).includes("https://example.com/2"), "Germany was not selected");
});

test("a busy country cannot bury a quiet one", () => {
  const data = {
    countries: {
      de: Array.from({ length: 12 }, (_, i) =>
        story(i, ["Bundestag debates energy", "Rhine shipping halted", "Bavarian election looms", "Rail strike widens"][i % 4] + ` ${i}`)
      ),
      eg: [story(99, "Suez traffic reroutes around delay")],
    },
  };
  const picked = foreignFrom(data, ["de", "eg"], 6);
  assert.ok(picked.some((i) => i.link === "https://example.com/99"), "Egypt survives a loud German feed");
});

test("no country data yields an empty section, not a crash", () => {
  assert.deepEqual(foreignFrom(null, ["jp"], 8), []);
  assert.deepEqual(foreignFrom({ countries: {} }, ["jp"], 8), []);
});

// ── translation cache ────────────────────────────────────────────────────────

const fetched = {
  jp: { lang: "ja", items: [story(1, "東京都予算が可決", "都議会は本日可決した")] },
  de: { lang: "de", items: [story(2, "Bundestag debattiert Energie")] },
};

test("a cold start leaves every string pending", () => {
  const cache = cacheFromPublished(null);
  assert.equal(cache.size, 0);
  assert.equal(pendingStrings(fetched, cache).length, 3, "two titles and one summary");
});

test("the last published file is the cache, so a warm build pays for nothing", () => {
  const published = {
    countries: {
      jp: [
        {
          lang: "ja",
          title: "Tokyo budget passes",
          titleOriginal: "東京都予算が可決",
          summary: "The assembly passed it today",
          summaryOriginal: "都議会は本日可決した",
        },
      ],
      de: [{ lang: "de", title: "Bundestag debates energy", titleOriginal: "Bundestag debattiert Energie" }],
    },
  };
  const cache = cacheFromPublished(published);
  assert.equal(pendingStrings(fetched, cache).length, 0, "nothing new to translate");

  const applied = applyTranslations(fetched, cache);
  assert.equal(applied.jp[0].title, "Tokyo budget passes");
  assert.equal(applied.jp[0].titleOriginal, "東京都予算が可決");
  assert.equal(applied.jp[0].translated, true);
  assert.equal(applied.jp[0].country, "jp");
});

test("an untranslated story keeps its original text and says so", () => {
  const applied = applyTranslations(fetched, new Map());
  assert.equal(applied.jp[0].title, "東京都予算が可決", "never dropped, never blank");
  assert.equal(applied.jp[0].translated, false);
  assert.equal(applied.de[0].translated, false);
});

test("a partially filled cache translates what it can and flags the rest", () => {
  const cache = cacheFromPublished({
    countries: { de: [{ lang: "de", title: "Bundestag debates energy", titleOriginal: "Bundestag debattiert Energie" }] },
  });
  const applied = applyTranslations(fetched, cache);
  assert.equal(applied.de[0].translated, true);
  assert.equal(applied.jp[0].translated, false);
});

test("identical strings are only queued once", () => {
  const twice = {
    jp: { lang: "ja", items: [story(1, "同じ見出し"), story(2, "同じ見出し")] },
  };
  assert.equal(pendingStrings(twice, new Map()).length, 1);
});

test("a translation cache never crosses languages", () => {
  // "Gift" means poison in German. Same bytes, different source language, and
  // reusing one for the other would be a real mistranslation.
  const cache = cacheFromPublished({
    countries: { de: [{ lang: "de", title: "Poison", titleOriginal: "Gift" }] },
  });
  const english = { en: { lang: "en", items: [story(1, "Gift")] } };
  assert.equal(pendingStrings(english, cache).length, 1, "the English 'Gift' is still pending");
});

// ── non-Latin scripts ────────────────────────────────────────────────────────

test("untranslated headlines survive de-duplication whatever the script", () => {
  // The de-duplicator used to fingerprint titles as [a-z0-9] only, so every
  // Arabic, Japanese, Chinese and Korean headline reduced to the same empty key
  // and the whole section collapsed to one story.
  const data = {
    countries: {
      eg: [story(1, "سوق القاهرة يرتفع"), story(2, "وزير الخارجية يزور باريس")],
      jp: [story(3, "東京都予算が可決"), story(4, "日銀が金利を据え置き")],
      cn: [story(5, "上海港口吞吐量增长"), story(6, "北京发布新政策")],
      kr: [story(7, "서울 부동산 대책 발표"), story(8, "한국은행 금리 동결")],
    },
  };
  const picked = foreignFrom(data, ["eg", "jp", "cn", "kr"], 20);
  assert.equal(picked.length, 8, `all eight distinct headlines must survive, got ${picked.length}`);
});

test("genuine duplicates in a non-Latin script are still caught", () => {
  const data = { countries: { jp: [story(1, "東京都予算が可決"), story(2, "東京都予算が可決")] } };
  assert.equal(foreignFrom(data, ["jp"], 20).length, 1);
});

test("every country key is unique and lowercase", () => {
  for (const k of COUNTRY_KEYS) assert.match(k, /^[a-z]{2}$/);
  assert.equal(new Set(COUNTRY_KEYS).size, COUNTRY_KEYS.length);
});
