// Build the newsletter digest from the ALREADY-PUBLISHED site data instead of
// re-fetching every RSS feed. The 30-minute site build already fetches, dedupes
// (lexical + semantic), and publishes public/data/*.json to the site, so the
// newsletter just reads those small JSON files — seconds instead of minutes —
// and inherits all the dedup work. Sports isn't prebuilt (it's fetched live in
// visitors' browsers), so it still comes straight from ESPN's fast JSON API.
import { TOPICS, STORY_BUDGET } from "./topics.js";
import { fetchSports } from "./espn.js";
import { makeDeduper } from "./text.js";

async function getJson(url) {
  try {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

export async function buildPublishedDigest(prefs, siteUrl) {
  const base = String(siteUrl || "").replace(/\/?$/, "/"); // ensure one trailing slash
  const ratings = prefs.ratings || {};
  const active = Object.keys(TOPICS)
    .filter((t) => (ratings[t] || 0) > 0)
    .sort((a, b) => (ratings[b] || 0) - (ratings[a] || 0));

  const raw = await Promise.all(
    active.map(async (key) => {
      const rating = ratings[key] || 0;
      const budget = STORY_BUDGET[rating] ?? 4;
      const b = { key, label: TOPICS[key].label, icon: TOPICS[key].icon, rating, budget };

      if (key === "weather") {
        return { ...b, type: "weather", weather: await getJson(`${base}data/weather.json`) };
      }
      if (key === "local") {
        const d = await getJson(`${base}data/local.json`);
        return { ...b, type: "news", place: d?.place || null, items: d?.items || [] };
      }
      if (key === "sports") {
        return { ...b, type: "news", items: await fetchSports(prefs.leagues, Math.max(budget * 2, 15)) };
      }
      const d = await getJson(`${base}data/${key}.json`);
      return { ...b, type: "news", items: d?.items || [] };
    })
  );

  // Cross-section de-dup (rating order), then trim each section to its budget.
  const keep = makeDeduper();
  const sections = raw.map((s) =>
    s.type !== "news" ? s : { ...s, items: (s.items || []).filter((it) => keep(it)).slice(0, s.budget) }
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
    sections,
  };
}
