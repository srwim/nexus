import Parser from "rss-parser";
import { decodeEntities, stripHtml, titleKey } from "./text.js";

export { decodeEntities, filterObituaries } from "./text.js";

// Some publishers (notably ESPN) return 403/empty to non-browser User-Agents,
// so present a realistic desktop browser UA. Universally accepted by feeds.
const parser = new Parser({
  timeout: 10000,
  headers: {
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
    Accept: "application/rss+xml, application/xml, text/xml;q=0.9, */*;q=0.8",
  },
});

// Simple in-memory cache (per process). TTL 10 minutes.
const cache = new Map();
const TTL = 10 * 60 * 1000;

async function fetchFeed(url) {
  const hit = cache.get(url);
  if (hit && Date.now() - hit.at < TTL) return hit.items;
  try {
    const feed = await parser.parseURL(url);
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
    return []; // a dead feed never breaks the page
  }
}

// Fetch several feeds in parallel, merge, dedupe by title, sort newest first.
export async function fetchFeeds(urls, limit = 20) {
  const results = await Promise.all(urls.map(fetchFeed));
  const seen = new Set();
  const merged = [];
  for (const items of results) {
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
