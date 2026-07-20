import { TOPICS, STORY_BUDGET, feedsForTopic } from "./topics.js";
import { fetchFeeds, filterObituaries } from "./rss.js";
import { lookupZip, getWeather } from "./weather.js";

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

  const sections = await Promise.all(
    active.map(async (topicKey) => {
      const rating = ratings[topicKey] || 0;
      const budget = STORY_BUDGET[rating] ?? 4;
      const base = { key: topicKey, label: TOPICS[topicKey].label, icon: TOPICS[topicKey].icon, rating };

      if (topicKey === "weather") {
        const weather = await getWeather(prefs.zip);
        return { ...base, type: "weather", weather };
      }
      if (topicKey === "local") {
        const { place, items } = await getLocalNews(prefs.zip, budget);
        return { ...base, type: "news", place, items };
      }
      const urls = feedsForTopic(topicKey, prefs);
      const items = await fetchFeeds(urls, budget);
      return { ...base, type: "news", items };
    })
  );

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
