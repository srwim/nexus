// Build-time translation for Foreign Reporting.
//
// The cost model is the whole design. Workers AI gives 10,000 neurons a day and
// bills beyond that, and the site rebuilds every half hour — so translating
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

const key = (lang, text) => `${lang}:${createHash("sha1").update(text).digest("hex").slice(0, 16)}`;

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

// Collect every string that still needs translating, newest stories first so a
// truncated run spends its budget on what a reader is most likely to see.
export function pendingStrings(byCountry, cache) {
  const pending = [];
  const seen = new Set();
  for (const [country, { lang, items }] of Object.entries(byCountry)) {
    for (const it of items) {
      for (const field of ["title", "summary"]) {
        const text = (it[field] || "").trim();
        if (!text) continue;
        const k = key(lang, text);
        if (cache.has(k) || seen.has(k)) continue;
        seen.add(k);
        pending.push({ country, lang, text, k });
      }
    }
  }
  return pending;
}

// Apply the cache to the fetched items, keeping the original alongside.
// `translated: false` is what the UI shows as "original language".
export function applyTranslations(byCountry, cache) {
  const out = {};
  for (const [country, { lang, items }] of Object.entries(byCountry)) {
    out[country] = items.map((it) => {
      const title = cache.get(key(lang, (it.title || "").trim()));
      const summary = cache.get(key(lang, (it.summary || "").trim()));
      return {
        ...it,
        country,
        lang,
        title: title || it.title,
        titleOriginal: it.title,
        summary: summary || it.summary,
        summaryOriginal: it.summary,
        translated: Boolean(title),
      };
    });
  }
  return out;
}

// Fill the cache in place. Returns how many strings were actually translated.
export async function translatePending(pending, cache, { endpoint, apiKey, budget = MAX_PER_RUN }) {
  if (!endpoint || !apiKey) {
    console.log("  translate: skipped (no proxy URL or TRANSLATE_KEY) — foreign items stay in their original language");
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
  for (const [lang, group] of byLang) {
    for (let i = 0; i < group.length; i += 30) {
      const batch = group.slice(i, i + 30);
      try {
        const res = await fetch(`${endpoint.replace(/\/+$/, "")}/translate`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-translate-key": apiKey },
          body: JSON.stringify({ source: lang, texts: batch.map((b) => b.text) }),
        });
        if (!res.ok) {
          console.warn(`  translate: ${lang} batch failed (${res.status})`);
          continue;
        }
        const { translations } = await res.json();
        batch.forEach((b, n) => {
          const t = translations?.[n];
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
