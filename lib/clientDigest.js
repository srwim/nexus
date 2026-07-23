"use client";
// Assemble the personalized feed in the browser from prebuilt static JSON,
// using the visitor's saved ratings/leagues. Weather and local news go live
// per-visitor when a zipcode is set: weather straight from the National
// Weather Service (CORS-friendly), local news via the Worker proxy — with
// the prebuilt site-default data as fallback.
//
// Sections are fetched with headroom, then a single shared de-duplicator runs
// across them in rating order so the same story never shows in two sections
// (e.g. a TechCrunch AI item in both Tech and AI); each section is then trimmed
// to its star budget.
import { TOPICS, STORY_BUDGET } from "./topics.js";
import { getData } from "./data.js";
import { getWeather } from "./weather.js";
import { getLocalNewsClient } from "./clientLocal.js";
import { fetchSports } from "./espn.js";
import { makeDeduper } from "./text.js";

export async function assembleDigest(prefs) {
  const ratings = prefs.ratings || {};
  const zip = /^\d{5}$/.test(prefs.zip || "") ? prefs.zip : null;
  const active = Object.keys(TOPICS)
    .filter((t) => (ratings[t] || 0) > 0)
    .sort((a, b) => (ratings[b] || 0) - (ratings[a] || 0));

  let updatedAt = null;

  // Fetch phase — full lists with headroom (order preserved = rating desc).
  const raw = await Promise.all(
    active.map(async (key) => {
      const rating = ratings[key] || 0;
      const budget = STORY_BUDGET[rating] ?? 4;
      const over = Math.max(budget * 2, 15); // headroom so cross-dedup can still fill the budget
      const base = { key, label: TOPICS[key].label, icon: TOPICS[key].icon, rating, budget };

      if (key === "weather") {
        let weather = null;
        if (zip) {
          const live = await getWeather(zip);
          if (live?.local) weather = live;
        }
        if (!weather) {
          const data = await getData("weather");
          if (data?.updatedAt) updatedAt = data.updatedAt;
          weather = data;
        }
        return { ...base, type: "weather", weather };
      }
      if (key === "local") {
        if (zip) {
          const live = await getLocalNewsClient(zip, over);
          if (live?.items?.length) return { ...base, type: "news", place: live.place, items: live.items };
        }
        const data = await getData("local");
        return { ...base, type: "news", place: data?.place || null, items: data?.items || [] };
      }
      if (key === "sports") {
        const items = await fetchSports(prefs.leagues, over);
        return { ...base, type: "news", items };
      }
      const data = await getData(key);
      if (data?.updatedAt) updatedAt = data.updatedAt;
      return { ...base, type: "news", items: data?.items || [] };
    })
  );

  // Cross-section de-dup in rating order, then trim each section to its budget.
  const keep = makeDeduper();
  const sections = raw.map((s) => {
    if (s.type !== "news") return s;
    const items = (s.items || []).filter((it) => keep(it.title)).slice(0, s.budget);
    return { ...s, items };
  });

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
