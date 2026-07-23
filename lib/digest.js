import { TOPICS, STORY_BUDGET, feedsForTopic } from "./topics.js";
import { fetchFeeds, filterObituaries } from "./rss.js";
import { lookupZip, getWeather } from "./weather.js";
import { fetchSports } from "./espn.js";
import { makeDeduper } from "./text.js";

export { getWeather };

export async function getLocalNews(zip, limit = 10) {
  const place = zip ? await lookupZip(zip) : null;
  if (!place) return { place: null, items: [] };
  const q = encodeURIComponent(`"${place.city}" "${place.state}"`);
  const url = `https://news.google.com/rss/search?q=${q}&hl=en-US&gl=US&ceid=US:en`;
  // Over-fetch, then drop obituaries/death notices before trimming to limit.
  const items = filterObituaries(await fetchFeeds([url], limit * 2)).slice(0, limit);
  return { place, items };
}

// Build the full personalized digest from prefs:
// { ratings: {topic: 0-5}, zip, leagues: [] }
export async function buildDigest(prefs) {
  const ratings = prefs.ratings || {};
  const active = Object.keys(TOPICS)
    .filter((t) => (ratings[t] || 0) > 0)
    .sort((a, b) => (ratings[b] || 0) - (ratings[a] || 0));

  const raw = await Promise.all(
    active.map(async (topicKey) => {
      const rating = ratings[topicKey] || 0;
      const budget = STORY_BUDGET[rating] ?? 4;
      const over = Math.max(budget * 2, 15); // headroom for cross-section dedup
      const base = { key: topicKey, label: TOPICS[topicKey].label, icon: TOPICS[topicKey].icon, rating, budget };

      if (topicKey === "weather") {
        const weather = await getWeather(prefs.zip);
        return { ...base, type: "weather", weather };
      }
      if (topicKey === "local") {
        const { place, items } = await getLocalNews(prefs.zip, over);
        return { ...base, type: "news", place, items };
      }
      if (topicKey === "sports") {
        const items = await fetchSports(prefs.leagues, over);
        return { ...base, type: "news", items };
      }
      const urls = feedsForTopic(topicKey);
      const items = await fetchFeeds(urls, over);
      return { ...base, type: "news", items };
    })
  );

  // Cross-section de-dup in rating order, then trim to each section's budget.
  const keep = makeDeduper();
  const sections = raw.map((s) => {
    if (s.type !== "news") return s;
    return { ...s, items: (s.items || []).filter((it) => keep(it.title)).slice(0, s.budget) };
  });

  return {
    generatedAt: new Date().toISOString(),
    dateLabel: new Date().toLocaleDateString("en-US", {
      weekday: "long",
      month: "long",
      day: "numeric",
      year: "numeric",
    }),
    sections,
  };
}
