"use client";
// Assemble the personalized feed in the browser from prebuilt static JSON,
// using the visitor's saved ratings/leagues.
import { TOPICS, STORY_BUDGET } from "./topics.js";
import { getData } from "./data.js";

export async function assembleDigest(prefs) {
  const ratings = prefs.ratings || {};
  const active = Object.keys(TOPICS)
    .filter((t) => (ratings[t] || 0) > 0)
    .sort((a, b) => (ratings[b] || 0) - (ratings[a] || 0));

  let updatedAt = null;

  const sections = await Promise.all(
    active.map(async (key) => {
      const rating = ratings[key] || 0;
      const budget = STORY_BUDGET[rating] ?? 4;
      const base = { key, label: TOPICS[key].label, icon: TOPICS[key].icon, rating };

      if (key === "weather") {
        const data = await getData("weather");
        if (data?.updatedAt) updatedAt = data.updatedAt;
        return { ...base, type: "weather", weather: data };
      }
      if (key === "local") {
        const data = await getData("local");
        return { ...base, type: "news", place: data?.place || null, items: (data?.items || []).slice(0, budget) };
      }
      if (key === "sports") {
        const leagues = prefs.leagues?.length ? prefs.leagues : ["nfl", "nba"];
        const chunks = await Promise.all(leagues.map((l) => getData(`sports-${l}`)));
        const merged = chunks
          .flatMap((c) => c?.items || [])
          .sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));
        return { ...base, type: "news", items: merged.slice(0, budget) };
      }
      const data = await getData(key);
      if (data?.updatedAt) updatedAt = data.updatedAt;
      return { ...base, type: "news", items: (data?.items || []).slice(0, budget) };
    })
  );

  return {
    updatedAt,
    dateLabel: new Date().toLocaleDateString("en-US", {
      weekday: "long",
      month: "long",
      day: "numeric",
      year: "numeric",
    }),
    sections,
  };
}
