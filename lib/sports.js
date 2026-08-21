// Sports selection, per league. Pure — no network, no Node-only imports — so
// the browser bundle can use it without dragging rss-parser along. The live
// fetching half lives in lib/sportsLive.js and is Node-only.
//
// Sports is prebuilt into data/sports.json (one array per league) rather than
// fetched in the browser, because publisher RSS is not CORS-enabled: a browser
// fetch of Autosport returns nothing at all. That prebuild is the only reason a
// league can have real beat coverage instead of just ESPN.
import { SPORTS_LEAGUES, normalizeLeagues } from "./topics.js";
import { dedupeByTitle } from "./text.js";
import { diversify } from "./rank.js";

export { SPORTS_LEAGUES, normalizeLeagues };

// Interleave, dedupe, then cap any one publisher — the same treatment every
// other topic gets. Without the cap a single high-cadence outlet (Motorsport.com
// files all day) owns the section no matter how many feeds are configured.
export function merge(chunks, limit) {
  const woven = [];
  for (let i = 0; woven.length < limit * 3; i++) {
    let added = false;
    for (const chunk of chunks) {
      if (i < chunk.length) {
        woven.push(chunk[i]);
        added = true;
      }
    }
    if (!added) break;
  }
  return diversify(dedupeByTitle(woven), limit);
}

// data: the parsed data/sports.json — { leagues: { f1: [...], nfl: [...] } }.
export function fetchSportsFrom(data, leagues, limit = 12) {
  const picks = normalizeLeagues(leagues);
  return merge(
    picks.map((k) => data?.leagues?.[k] || []),
    limit
  );
}
