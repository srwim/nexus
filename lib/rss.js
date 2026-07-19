import Parser from "rss-parser";

const parser = new Parser({
  timeout: 10000,
  headers: { "User-Agent": "NEXUS/1.0 (personal news reader)" },
});

// Simple in-memory cache (per process). TTL 10 minutes.
const cache = new Map();
const TTL = 10 * 60 * 1000;

const NAMED_ENTITIES = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ",
  rsquo: "’", lsquo: "‘", rdquo: "”", ldquo: "“",
  ndash: "–", mdash: "—", hellip: "…", copy: "©",
  reg: "®", trade: "™", deg: "°", eacute: "é",
};

// Some feeds double-encode entities ("Birdfy&#8217;s"). Decode numeric and
// common named entities so titles display correctly everywhere.
export function decodeEntities(s) {
  return String(s || "")
    .replace(/&#(\d+);/g, (_, n) => safeCodePoint(+n))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => safeCodePoint(parseInt(n, 16)))
    .replace(/&([a-z]+);/gi, (m, name) => NAMED_ENTITIES[name.toLowerCase()] ?? m);
}

function safeCodePoint(n) {
  try {
    return String.fromCodePoint(n);
  } catch {
    return "";
  }
}

// Obituaries and death notices dominate local Google News results; filter
// them out of local coverage (national outlets covering a death still pass).
const OBIT_RE = /\bobituar(y|ies)\b|\bdeath notices?\b|\bin memoriam\b|\bfuneral (home|services?|notice)\b/i;

export function filterObituaries(items) {
  return items.filter((it) => !OBIT_RE.test(`${it.title} ${it.summary || ""} ${it.source || ""}`));
}

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

function stripHtml(s) {
  return s.replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim();
}

// Fetch several feeds in parallel, merge, dedupe by title, sort newest first.
export async function fetchFeeds(urls, limit = 20) {
  const results = await Promise.all(urls.map(fetchFeed));
  const seen = new Set();
  const merged = [];
  for (const items of results) {
    for (const item of items) {
      const key = item.title.toLowerCase().slice(0, 80);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      merged.push(item);
    }
  }
  merged.sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));
  return merged.slice(0, limit);
}
