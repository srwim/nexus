// Zipcode-driven fetching: the two pieces of the brief that can't be prebuilt
// for everyone, because they depend on where the reader is.
//
// There used to be a buildDigest() here that fetched every feed live and ranked
// them. It has been removed: the data build and the newsletter both rank from
// the published pool through lib/publishedDigest.js, and a second ranking path
// could only ever drift from the one that ships.
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
