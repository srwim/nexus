// ESPN public JSON news API — CORS-enabled and works in both the browser and
// Node. Used for the Sports topic because ESPN's RSS feeds block datacenter IPs
// (the GitHub Actions build got nothing), while this API serves fresh results.
import { SPORTS_LEAGUES } from "./topics.js";
import { titleKey } from "./text.js";

const BASE = "https://site.api.espn.com/apis/site/v2/sports";

async function fetchLeague(leagueKey, limit) {
  const league = SPORTS_LEAGUES[leagueKey];
  if (!league?.espn) return [];
  try {
    const res = await fetch(`${BASE}/${league.espn}/news`);
    if (!res.ok) return [];
    const data = await res.json();
    return (data.articles || []).slice(0, limit).map((a) => ({
      title: a.headline || "",
      link: a.links?.web?.href || a.links?.mobile?.href || "",
      source: `ESPN ${league.label}`,
      date: a.published || a.lastModified || null,
      summary: a.description || "",
    }));
  } catch {
    return [];
  }
}

// Fetch news across the given leagues, merge, dedupe by title, newest first.
export async function fetchSports(leagues, limit = 12) {
  const picks = leagues?.length ? leagues : ["nfl", "nba"];
  const chunks = await Promise.all(picks.map((l) => fetchLeague(l, limit)));
  const seen = new Set();
  const merged = [];
  for (const items of chunks) {
    for (const item of items) {
      const key = titleKey(item.title);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      merged.push(item);
    }
  }
  merged.sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));
  return merged.slice(0, limit);
}
