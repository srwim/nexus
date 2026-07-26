// Build the newsletter digest from the ALREADY-PUBLISHED site data instead of
// re-fetching every RSS feed. The 30-minute site build already fetches, dedupes
// (lexical + semantic), and publishes public/data/*.json to the site, so the
// newsletter just reads those small JSON files — seconds instead of minutes —
// and inherits all the dedup work. Sports isn't prebuilt (it's fetched live in
// visitors' browsers), so it still comes straight from ESPN's fast JSON API.
//
// Fetching lives here; ranking lives in lib/rank.js, which the eval harness
// replays against frozen snapshots. Same function both ways, so an eval score
// describes the code that actually ships.
import { fetchSports } from "./espn.js";
import { activeTopics, rankFromData } from "./rank.js";

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

export async function buildPublishedDigest(prefs, siteUrl) {
  const base = String(siteUrl || "").replace(/\/?$/, "/"); // ensure one trailing slash

  // ponytail: flat 20-item over-fetch for sports — comfortably above the
  // largest star budget (8), so cross-section dedup always has headroom.
  const entries = await Promise.all(
    activeTopics(prefs.ratings).map(async (key) =>
      key === "sports"
        ? [key, { items: await fetchSports(prefs.leagues, 20) }]
        : [key, await getJson(`${base}data/${key}.json`)]
    )
  );

  return {
    generatedAt: new Date().toISOString(),
    dateLabel: new Date().toLocaleDateString("en-US", {
      timeZone: "America/Denver",
      weekday: "long",
      month: "long",
      day: "numeric",
      year: "numeric",
    }),
    sections: rankFromData(Object.fromEntries(entries), prefs),
  };
}
