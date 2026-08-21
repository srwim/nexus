// Live sports fetching: ESPN's JSON wire plus each league's own outlets.
// Node-only (imports rss-parser via lib/rss.js) — used by the data build, the
// newsletter's full-fetch path, and eval case capture. The browser reads the
// prebuilt data/sports.json through lib/sports.js instead.
import { SPORTS_LEAGUES, normalizeLeagues, merge } from "./sports.js";
import { fetchFeeds } from "./rss.js";
import { filterStale } from "./text.js";

// ESPN keeps serving a league's last stories indefinitely — the IndyCar
// endpoint was handing back July articles in late August. An empty offseason
// section is honest; six-week-old news presented as today's is not.
const MAX_AGE_DAYS = 14;

const ESPN = "https://site.api.espn.com/apis/site/v2/sports";

async function fetchEspn(league, limit) {
  if (!league.espn) return [];
  try {
    const res = await fetch(`${ESPN}/${league.espn}/news`);
    if (!res.ok) {
      console.warn(`  espn failed: ${league.espn} (${res.status})`);
      return [];
    }
    const data = await res.json();
    return (data.articles || []).slice(0, limit).map((a) => ({
      title: a.headline || "",
      link: a.links?.web?.href || a.links?.mobile?.href || "",
      source: `ESPN ${league.label}`,
      date: a.published || a.lastModified || null,
      summary: a.description || "",
    }));
  } catch (e) {
    console.warn(`  espn failed: ${league.espn} (${e?.message || "error"})`);
    return [];
  }
}

// One league. Exported so the data build can write each league separately.
export async function fetchLeagueLive(key, limit = 12) {
  const league = SPORTS_LEAGUES[key];
  if (!league) return [];
  const [espn, rss] = await Promise.all([
    fetchEspn(league, limit),
    fetchFeeds(league.feeds || [], limit * 2),
  ]);
  return merge([filterStale(espn, MAX_AGE_DAYS), filterStale(rss, MAX_AGE_DAYS)], limit);
}

export async function fetchSportsLive(leagues, limit = 12) {
  const chunks = await Promise.all(
    normalizeLeagues(leagues).map((k) => fetchLeagueLive(k, limit))
  );
  return merge(chunks, limit);
}
