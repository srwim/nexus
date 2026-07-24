import Parser from "rss-parser";
import { decodeEntities, stripHtml, dedupeByTitle } from "./text.js";

export { decodeEntities, filterObituaries } from "./text.js";

// We do the network ourselves (global fetch + AbortController) and hand the raw
// XML to rss-parser. rss-parser's own `timeout` option only guards socket
// inactivity and doesn't reliably fire on slow-trickle or stalled responses —
// which let a single hung publisher feed stall the whole build until the job's
// hard cap. A real AbortController bounds every feed to FEED_TIMEOUT, body read
// included, so one bad feed can never drag the data build out.
const parser = new Parser();

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";
const FEED_TIMEOUT = 9000;

// Simple in-memory cache (per process). TTL 10 minutes.
const cache = new Map();
const TTL = 10 * 60 * 1000;

async function fetchFeed(url) {
  const hit = cache.get(url);
  if (hit && Date.now() - hit.at < TTL) return hit.items;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FEED_TIMEOUT);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      redirect: "follow",
      headers: {
        // Some publishers return 403/empty to non-browser agents.
        "User-Agent": UA,
        Accept: "application/rss+xml, application/xml, text/xml;q=0.9, */*;q=0.8",
      },
    });
    if (!res.ok) return [];
    const xml = await res.text();
    const feed = await parser.parseString(xml);
    const items = (feed.items || []).slice(0, 25).map((it) => ({
      title: decodeEntities(it.title || ""),
      link: it.link || "",
      source: decodeEntities(feed.title || new URL(url).hostname),
      date: it.isoDate || it.pubDate || null,
      summary: decodeEntities(stripHtml(it.contentSnippet || it.content || "")).slice(0, 300),
    }));
    cache.set(url, { at: Date.now(), items });
    return items;
  } catch {
    return []; // a dead/slow feed never breaks the page or stalls the build
  } finally {
    clearTimeout(timer);
  }
}

// Fetch several feeds in parallel, merge, dedupe by title, sort newest first.
export async function fetchFeeds(urls, limit = 20) {
  const results = await Promise.all(urls.map(fetchFeed));
  const merged = results.flat();
  merged.sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));
  return dedupeByTitle(merged).slice(0, limit);
}
