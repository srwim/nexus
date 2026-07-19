import { TOPICS, STORY_BUDGET, feedsForTopic } from "./topics.js";
import { fetchFeeds, filterObituaries } from "./rss.js";
import { lookupZip } from "./geo.js";

const NWS_HEADERS = {
  "User-Agent": "NEXUS/1.0 (personal news reader)",
  Accept: "application/geo+json",
};

export async function getWeather(zip) {
  const out = { local: null, alerts: [] };
  try {
    const place = zip ? await lookupZip(zip) : null;
    if (place) {
      const ptRes = await fetch(`https://api.weather.gov/points/${place.lat},${place.lon}`, {
        headers: NWS_HEADERS,
      });
      if (ptRes.ok) {
        const pt = await ptRes.json();
        const fcRes = await fetch(pt.properties.forecast, { headers: NWS_HEADERS });
        if (fcRes.ok) {
          const fc = await fcRes.json();
          out.local = {
            city: place.city,
            state: place.state,
            periods: (fc.properties.periods || []).slice(0, 4).map((p) => ({
              name: p.name,
              temp: `${p.temperature}°${p.temperatureUnit}`,
              short: p.shortForecast,
              detailed: p.detailedForecast,
            })),
          };
        }
      }
    }
    const alertRes = await fetch(
      "https://api.weather.gov/alerts/active?severity=Extreme,Severe&limit=8",
      { headers: NWS_HEADERS }
    );
    if (alertRes.ok) {
      const alerts = await alertRes.json();
      out.alerts = (alerts.features || []).slice(0, 8).map((f) => ({
        title: f.properties.headline || f.properties.event,
        area: f.properties.areaDesc,
        severity: f.properties.severity,
        link: f.properties["@id"] || "https://www.weather.gov/alerts",
      }));
    }
  } catch {
    /* weather never breaks the digest */
  }
  return out;
}

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
