// Build the newsletter digest from the ALREADY-PUBLISHED site data instead of
// re-fetching every RSS feed. The 30-minute site build already fetches, dedupes
// (lexical + semantic), and publishes public/data/*.json to the site, so the
// newsletter just reads those small JSON files — seconds instead of minutes —
// and inherits all the dedup work.
//
// Fetching and ranking are separate on purpose: the send personalizes per
// subscriber, and every subscriber ranks the SAME published pool. Fetching once
// and ranking many times keeps a hundred readers at one pass over the data
// rather than a hundred.
//
// Ranking itself lives in lib/rank.js, which the eval harness replays against
// frozen snapshots — so an eval score describes the code that actually ships.
import { TOPICS } from "./topics.js";
import { fetchSportsFrom } from "./sports.js";
import { foreignFrom } from "./foreign.js";
import { rankFromData } from "./rank.js";

// `cache: "no-store"` only governs THIS process's cache — it does not stop an
// intermediary CDN (arok.ai sits behind Cloudflare) from serving an edge-cached
// copy of a URL it already holds. A unique query string is the only reliable
// bypass, and stale news is the one failure this pipeline cannot tolerate.
async function getJson(url) {
  try {
    const res = await fetch(`${url}?t=${Date.now()}`, { cache: "no-store" });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

// Every topic, not just the active ones: subscribers activate different topics,
// and this pool is shared across all of them.
export async function fetchPublishedData(siteUrl) {
  const base = String(siteUrl || "").replace(/\/?$/, "/"); // ensure one trailing slash
  const entries = await Promise.all(
    Object.keys(TOPICS).map(async (key) => [key, await getJson(`${base}data/${key}.json`)])
  );
  return Object.fromEntries(entries);
}

// data: the pool from fetchPublishedData. prefs: one subscriber's settings.
export function digestFromData(data, prefs) {
  // ponytail: flat 20-item over-fetch for sports — comfortably above the
  // largest star budget (8), so cross-section dedup always has headroom.
  const resolved = {
    ...data,
    sports: { items: fetchSportsFrom(data.sports, prefs.leagues, 20) },
    foreign: { items: foreignFrom(data.foreign, prefs.countries, 20) },
  };
  return {
    generatedAt: new Date().toISOString(),
    dateLabel: new Date().toLocaleDateString("en-US", {
      timeZone: "America/Denver",
      weekday: "long",
      month: "long",
      day: "numeric",
      year: "numeric",
    }),
    sections: rankFromData(resolved, prefs),
  };
}

export async function buildPublishedDigest(prefs, siteUrl) {
  return digestFromData(await fetchPublishedData(siteUrl), prefs);
}
