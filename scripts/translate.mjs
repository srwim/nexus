// Build-time translation for Foreign Reporting.
//
// The cost model is the whole design. Workers AI gives 10,000 neurons a day and
// bills beyond that, and the site rebuilds every half hour, so translating
// every headline every build would turn a $0 project into a metered one within
// a week.
//
// Two things prevent that:
//   1. A cache keyed by the source text, seeded from the PREVIOUSLY PUBLISHED
//      foreign.json. Headlines persist across builds, so a warm run translates
//      only what is genuinely new. No extra storage: the last build's output is
//      the cache.
//   2. A hard per-run budget. A cold start translates a slice and leaves the
//      rest in their original language rather than blowing the daily allowance
//      in one go; the next build picks up where this one stopped.
//
// Untranslated is a supported state, never a dropped story.
import { createHash } from "node:crypto";

export const MAX_PER_RUN = 120;

// The per-run budget assumed a build every 30 minutes. GitHub's scheduler ran
// them every 6 to 9 hours instead (Nov 2026), so each run translated the newest
// ~6 stories per country and everything that arrived before them was never
// reached: coverage sat near 50% for every busy country. A run now gets one
// MAX_PER_RUN for each half hour since the last published build.
//
// This doesn't raise total spend: the cache means each string is translated
// once whenever it happens, so daily neurons track how much news arrives, not
// how often we build. It only lets a late build catch up in one go instead of
// never. Capped at MAX_SCALE so one very late build can't run long; a cold
// start (no prior build to measure from) gets the base budget, as before.
export const MAX_SCALE = 4;
export function budgetFor(lastBuiltAt, now = Date.now()) {
  const gapMinutes = (now - Date.parse(lastBuiltAt)) / 60000;
  if (!Number.isFinite(gapMinutes) || gapMinutes <= 0) return MAX_PER_RUN;
  return MAX_PER_RUN * Math.min(MAX_SCALE, Math.max(1, Math.ceil(gapMinutes / 30)));
}

// Wall-clock limit for one run's translation. A bigger budget means more
// sequential batches, and build-data has a 12-minute hard cap that exits with
// partial data. Past this, remaining strings simply wait for the next build.
export const TRANSLATE_DEADLINE_MS = 4 * 60 * 1000;

// Trimmed here, not by callers: the cache used to be seeded from the untrimmed
// original while lookups trimmed, so any feed that pads its text (La Jornada
// pads every title) missed the cache and was re-translated every half hour.
const key = (lang, text) => `${lang}:${createHash("sha1").update(String(text).trim()).digest("hex").slice(0, 16)}`;

// Some "foreign" text is already English: wire copy, quoted statements, a
// bilingual feed. Sending it costs neurons and the model just echoes it back.
// ponytail: unambiguous English function words, not language ID. A headline
// with none of them ("Trump hails China deal") still goes to the model; that
// costs a few neurons, never a mislabel. Words shared with a source language
// (in, on, a, as, was, will, has) are left out on purpose.
const EN_WORDS = new Set("the of and to is are for with that this from by at it its be have after says said".split(" "));
export function looksEnglish(text) {
  const letters = (text.match(/\p{L}/gu) || []).length;
  const ascii = (text.match(/[a-z]/gi) || []).length;
  const words = text.toLowerCase().match(/[a-z']+/g) || [];
  const hits = words.filter((w) => EN_WORDS.has(w)).length;
  return letters > 0 && ascii / letters > 0.97 && hits >= 2 && hits / words.length >= 0.1;
}

// Names M2M100 mangles ("POSCO Future M" came back "Fosco Fujitsu EM", "LG
// Energy Solution" as "LGEnergy Solutions"). Each source spelling is swapped
// for a code the model copies through like a model number, then swapped back.
export const GLOSSARY = {
  "포스코퓨처엠": "POSCO Future M",
  "POSCO Future M": "POSCO Future M",
  "LG에너지솔루션": "LG Energy Solution",
  "LG Energy Solution": "LG Energy Solution",
};

export function protect(text) {
  const names = [];
  for (const [src, en] of Object.entries(GLOSSARY)) {
    if (!text.includes(src)) continue;
    text = text.replaceAll(src, `NX${names.length}`);
    names.push(en);
  }
  return { text, names };
}

// Highest code first so NX1 never eats the front of NX10. A translation that
// lost a code is dropped rather than published without the name in it.
export function restore(text, names) {
  for (let i = names.length - 1; i >= 0; i--) {
    if (!text.includes(`NX${i}`)) return null;
    text = text.replaceAll(`NX${i}`, names[i]);
  }
  return text;
}

// Rebuild the cache from the last published foreign.json. Items carry both the
// original and the translation, so the file is its own cache.
export function cacheFromPublished(published) {
  const cache = new Map();
  for (const items of Object.values(published?.countries || {})) {
    for (const it of items || []) {
      if (it?.titleOriginal && it.title && it.title !== it.titleOriginal) {
        cache.set(key(it.lang, it.titleOriginal), it.title);
      }
      if (it?.summaryOriginal && it.summary && it.summary !== it.summaryOriginal) {
        cache.set(key(it.lang, it.summaryOriginal), it.summary);
      }
    }
  }
  return cache;
}

// Collect every string that still needs translating, ordered so that a run which
// hits the budget spends it evenly rather than alphabetically.
//
// This used to walk country by country and push titles and summaries together.
// Ten countries at fourteen stories each is up to 280 strings against a budget
// of 120, so the walk never reached the end of the list: Japan, Germany, Korea,
// China and France consumed the entire budget every build, and Mexico,
// Argentina and Brazil (positions 8, 9 and 10) were never reached at all. They
// weren't failing to translate, they were never being offered for translation,
// and because each build brought fresh headlines for the early countries the
// queue never drained enough to reach the tail. Brazilian and Argentine stories
// sat in Portuguese and Spanish indefinitely.
//
// Countries are woven round-robin, the same way lib/rank.js weaves feeds and
// for the same reason: a fixed order means whoever is last is always last.
//
// Within a country, an item's summary travels right behind its own title. It
// used to queue behind every title in the run, so a tight budget translated the
// headline and left an Arabic or French snippet under it for days. Pairing
// costs some headline throughput on a cold start; a summary that still misses
// the budget is dropped at apply time rather than shown untranslated.
export function pendingStrings(byCountry, cache) {
  const seen = new Set();
  const perCountry = [];

  for (const [country, { lang, items }] of Object.entries(byCountry)) {
    const units = [];
    for (const it of items) {
      const unit = [];
      for (const field of ["title", "summary"]) {
        const text = (it[field] || "").trim();
        if (!text || looksEnglish(text)) continue;
        const k = key(lang, text);
        if (cache.has(k) || seen.has(k)) continue;
        seen.add(k);
        unit.push({ country, lang, text, k });
      }
      if (unit.length) units.push(unit);
    }
    perCountry.push(units);
  }

  return weave(perCountry).flat();
}

// One from each list in turn until every list is empty.
function weave(lists) {
  const out = [];
  for (let i = 0; ; i++) {
    let added = false;
    for (const list of lists) {
      if (i < list.length) {
        out.push(list[i]);
        added = true;
      }
    }
    if (!added) return out;
  }
}

// A field is in English if it is empty, was translated, or was English at source.
const inEnglish = (text, translation) => !(text || "").trim() || Boolean(translation) || looksEnglish(text);

// Apply the cache to the fetched items, keeping the original alongside.
//
// A translated title never sits over an untranslated snippet: if the summary
// missed translation, it is dropped (summaryOriginal keeps it). An item whose
// title is still untranslated stays whole in its own language.
//
// translated: every shown field is in English (the UI's "original language"
// flag). machineTranslated: some field was actually translated, which is what
// the "Translated from <language>" tag needs; English-at-source is neither.
export function applyTranslations(byCountry, cache) {
  const out = {};
  for (const [country, { lang, items }] of Object.entries(byCountry)) {
    out[country] = items.map((it) => {
      const title = cache.get(key(lang, it.title || ""));
      let summary = cache.get(key(lang, it.summary || ""));
      const titleEnglish = inEnglish(it.title, title);
      const dropSummary = titleEnglish && !inEnglish(it.summary, summary);
      if (dropSummary) summary = "";
      return {
        ...it,
        country,
        lang,
        title: title || it.title,
        titleOriginal: it.title,
        summary: dropSummary ? "" : summary || it.summary,
        summaryOriginal: it.summary,
        translated: titleEnglish && (dropSummary || inEnglish(it.summary, summary)),
        machineTranslated: Boolean(title || summary),
      };
    });
  }
  return out;
}

// Items that say `translated: true` while a field is still in its source
// language. Should always be empty; the check that catches a regression.
export function mislabeled(published) {
  return Object.values(published?.countries || {})
    .flat()
    .filter(
      (it) =>
        it?.translated &&
        [["title", "titleOriginal"], ["summary", "summaryOriginal"]].some(
          ([f, o]) => (it[o] || "").trim() && it[f] === it[o] && !looksEnglish(it[o])
        )
    );
}

// Fill the cache in place. Returns how many strings were actually translated.
export async function translatePending(
  pending,
  cache,
  { endpoint, apiKey, budget = MAX_PER_RUN, deadlineMs = TRANSLATE_DEADLINE_MS, now = Date.now }
) {
  const startedAt = now();
  if (!endpoint || !apiKey) {
    console.log("  translate: skipped (no proxy URL or TRANSLATE_KEY): foreign items stay in their original language");
    return 0;
  }
  const slice = pending.slice(0, budget);
  if (pending.length > slice.length) {
    console.log(`  translate: ${pending.length} new strings, doing ${slice.length} this run (budget)`);
  }

  // Batched per language, which is how the model wants it anyway.
  const byLang = new Map();
  for (const p of slice) {
    if (!byLang.has(p.lang)) byLang.set(p.lang, []);
    byLang.get(p.lang).push(p);
  }

  let done = 0;
  let stopped = false;
  for (const [lang, group] of byLang) {
    for (let i = 0; i < group.length; i += 30) {
      if (now() - startedAt > deadlineMs) {
        if (!stopped) console.log(`  translate: time limit reached after ${done} strings; the rest wait for the next build`);
        stopped = true;
        break;
      }
      const batch = group.slice(i, i + 30);
      const sent = batch.map((b) => protect(b.text));
      try {
        const res = await fetch(`${endpoint.replace(/\/+$/, "")}/translate`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-translate-key": apiKey },
          body: JSON.stringify({ source: lang, texts: sent.map((s) => s.text) }),
        });
        if (!res.ok) {
          console.warn(`  translate: ${lang} batch failed (${res.status})`);
          continue;
        }
        const { translations } = await res.json();
        batch.forEach((b, n) => {
          const t = translations?.[n] && restore(translations[n], sent[n].names);
          if (t) {
            cache.set(b.k, t);
            done++;
          }
        });
      } catch (e) {
        console.warn(`  translate: ${lang} batch errored (${e?.message || "error"})`);
      }
    }
  }
  return done;
}
