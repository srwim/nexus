// Sports selection, per league. Pure — no network, no Node-only imports — so
// the browser bundle can use it without dragging rss-parser along. The live
// fetching half lives in lib/sportsLive.js and is Node-only.
//
// Sports is prebuilt into data/sports.json (one array per league) rather than
// fetched in the browser, because publisher RSS is not CORS-enabled: a browser
// fetch of Autosport returns nothing at all. That prebuild is the only reason a
// league can have real beat coverage instead of just ESPN.
import { SPORTS_LEAGUES, normalizeLeagues } from "./topics.js";
import { mergeChunks } from "./rank.js";

export { SPORTS_LEAGUES, normalizeLeagues };
// Interleaving leagues and capping any one publisher is the same problem every
// grouped topic has, so it lives in rank.js alongside diversify().
export { mergeChunks as merge };

// data: the parsed data/sports.json — { leagues: { f1: [...], nfl: [...] } }.
export function fetchSportsFrom(data, leagues, limit = 12) {
  const picks = normalizeLeagues(leagues);
  return mergeChunks(
    picks.map((k) => data?.leagues?.[k] || []),
    limit
  );
}
