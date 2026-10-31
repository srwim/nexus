import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  pendingStrings,
  cacheFromPublished,
  applyTranslations,
  translatePending,
  mislabeled,
  looksEnglish,
  protect,
  restore,
  MAX_PER_RUN,
} from "./translate.mjs";

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

// ── the summary bug: a translated title over an untranslated snippet ─────────

test("translated is true only when every non-empty field is", () => {
  const pool = { fr: { lang: "fr", items: [{ title: "Titre", summary: "Résumé du jour" }, { title: "Seul", summary: "" }] } };
  const cache = cacheFromPublished({
    countries: { fr: [{ lang: "fr", title: "Title", titleOriginal: "Titre" }, { lang: "fr", title: "Alone", titleOriginal: "Seul" }] },
  });
  const [half, whole] = applyTranslations(pool, cache).fr;
  assert.equal(half.title, "Title");
  assert.equal(half.summary, "Résumé du jour");
  assert.equal(half.translated, false, "a French snippet under an English title is not translated");
  assert.equal(whole.translated, true, "an empty summary has nothing to translate");
});

test("mislabeled catches what the old flag shipped, and passes what the new one does", () => {
  const shipped = {
    countries: {
      fr: [{ lang: "fr", translated: true, title: "Title", titleOriginal: "Titre", summary: "Résumé du jour", summaryOriginal: "Résumé du jour" }],
    },
  };
  assert.equal(mislabeled(shipped).length, 1);

  const pool = { fr: { lang: "fr", items: [{ title: "Titre", summary: "Résumé du jour" }] } };
  assert.deepEqual(mislabeled({ countries: applyTranslations(pool, cacheFromPublished(shipped)) }), []);
});

test("padded source text still hits the cache", () => {
  const published = { countries: { mx: [{ lang: "es", title: "Title", titleOriginal: "  Título \n", summary: "", summaryOriginal: "" }] } };
  const pool = { mx: { lang: "es", items: [{ title: "  Título \n", summary: "" }] } };
  assert.deepEqual(pendingStrings(pool, cacheFromPublished(published)), [], "La Jornada's padding no longer costs a re-translation");
});

// ── English at source ────────────────────────────────────────────────────────

test("English text is recognised, foreign text is not", () => {
  assert.ok(looksEnglish("US approves sale of 500 Patriot missiles to Kiev"));
  assert.ok(looksEnglish("The minister said the deal is done and will be signed this week."));
  for (const foreign of [
    "Cette vente d’armement, équivalente à plus de 2 milliards de dollars, doit être entérinée",
    "Washington aprueba la venta de 500 misiles Patriot a Kiev",
    "Se for aprovado, o projeto vai para o Senado",
    "Was will die Regierung in Berlin jetzt tun?",
    "LG에너지솔루션 the deal is done, 발표했다 오늘 서울에서 기자회견을 열고",
    "東京都予算が可決",
    "Gift",
  ]) {
    assert.equal(looksEnglish(foreign), false, foreign);
  }
});

test("English fields cost nothing and are not mislabeled", () => {
  const pool = { fr: { lang: "fr", items: [{ title: "US approves sale of 500 Patriot missiles to Kiev", summary: "Résumé du jour" }] } };
  const pending = pendingStrings(pool, new Map());
  assert.deepEqual(pending.map((p) => p.text), ["Résumé du jour"], "only the French field is sent");
  const cache = new Map([[pending[0].k, "Summary of the day"]]);
  const [it] = applyTranslations(pool, cache).fr;
  assert.equal(it.translated, true);
  assert.deepEqual(mislabeled({ countries: { fr: [it] } }), []);
});

// ── glossary ─────────────────────────────────────────────────────────────────

test("glossary names are hidden from the model and restored after", () => {
  const { text, names } = protect("포스코퓨처엠과 LG에너지솔루션이 합의했다");
  assert.equal(text, "NX0과 NX1이 합의했다");
  assert.equal(restore("NX0 and NX1 agreed", names), "POSCO Future M and LG Energy Solution agreed");
  assert.equal(restore("Fosco and NX1 agreed", names), null, "a lost name drops the translation");
  assert.deepEqual(protect("평범한 기사"), { text: "평범한 기사", names: [] });
});

// ── the Worker contract, with fetch stubbed ──────────────────────────────────

function stubWorker(reply = (t) => `EN ${t}`) {
  const calls = [];
  globalThis.fetch = async (url, init) => {
    const { texts } = JSON.parse(init.body);
    calls.push(texts);
    return { ok: true, json: async () => ({ translations: texts.map(reply) }) };
  };
  return calls;
}

test("the Worker sees codes, the cache gets real names", async (t) => {
  const real = globalThis.fetch;
  t.after(() => (globalThis.fetch = real));
  const calls = stubWorker();
  const pool = { kr: { lang: "ko", items: [{ title: "포스코퓨처엠 실적", summary: "" }] } };
  const cache = new Map();
  await translatePending(pendingStrings(pool, cache), cache, { endpoint: "https://w.example", apiKey: "k" });
  assert.deepEqual(calls, [["NX0 실적"]]);
  assert.equal(applyTranslations(pool, cache).kr[0].title, "EN POSCO Future M 실적");
});

test("a second run with unchanged input makes zero Worker calls", async (t) => {
  const real = globalThis.fetch;
  t.after(() => (globalThis.fetch = real));
  const calls = stubWorker();
  const pool = {
    mx: { lang: "es", items: [{ title: " Título con espacios ", summary: "Resumen del día " }] },
    kr: { lang: "ko", items: [{ title: "LG에너지솔루션 실적", summary: "US approves sale of 500 Patriot missiles to Kiev" }] },
  };
  const opts = { endpoint: "https://w.example", apiKey: "k" };

  const first = new Map();
  await translatePending(pendingStrings(pool, first), first, opts);
  assert.ok(calls.length > 0);
  // Exactly what build-data does: publish, read the file back, rebuild the cache.
  const published = JSON.parse(JSON.stringify({ countries: applyTranslations(pool, first) }));
  assert.deepEqual(mislabeled(published), []);

  calls.length = 0;
  const second = cacheFromPublished(published);
  assert.deepEqual(pendingStrings(pool, second), []);
  assert.equal(await translatePending(pendingStrings(pool, second), second, opts), 0);
  assert.equal(calls.length, 0, "warm run spent neurons");
});

// Point this at a real file to audit it: FOREIGN_JSON=path/to/foreign.json npm test
test("a published foreign.json has no mislabeled items", { skip: !process.env.FOREIGN_JSON && "set FOREIGN_JSON" }, () => {
  const bad = mislabeled(JSON.parse(readFileSync(process.env.FOREIGN_JSON, "utf8")));
  assert.equal(bad.length, 0, `${bad.length} items say translated but are not, e.g. ${bad[0]?.source}: ${bad[0]?.summary?.slice(0, 60)}`);
});
