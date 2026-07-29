"use client";
// Per-visitor local news, fetched in the browser through the Cloudflare Worker
// (workers/local-news-proxy.js), which calls a news API server-side with a
// hidden key. Returns null when the proxy isn't configured or anything fails —
// callers fall back to prebuilt data.
import config from "../nexus.config.json";
import { decodeEntities, filterObituaries, dedupeByTitle, filterStale } from "./text.js";

// How far back local news may reach. Raise it and a quiet town fills up with
// stale stories; lower it and small markets show an empty section. Applied here
// as well as in the worker so freshness holds even before the worker is
// redeployed, and regardless of what the API decides to return.
// Measured against a real Salt Lake City response: 4 days returned 1 item,
// 7 returned 4 — which is exactly the Local budget at 3 stars.
const MAX_AGE_DAYS = 7;

// Prefer the build-time repo variable (NEXT_PUBLIC_LOCAL_NEWS_PROXY, injected
// by the GitHub Action) and fall back to the value in nexus.config.json.
// Tolerate a value entered without a scheme (e.g. "foo.workers.dev").
const RAW = process.env.NEXT_PUBLIC_LOCAL_NEWS_PROXY || config.localNewsProxy || "";
const PROXY = RAW && !/^https?:\/\//i.test(RAW) ? `https://${RAW}` : RAW;

export async function getLocalNewsClient(zip, limit = 10) {
  if (!PROXY || !/^\d{5}$/.test(zip || "")) return null;
  try {
    const res = await fetch(`${PROXY.replace(/\/$/, "")}/?zip=${zip}`);
    if (!res.ok) return null;
    const data = await res.json();
    if (!Array.isArray(data.items)) return null;

    let items = data.items.map((it) => ({
      title: decodeEntities(it.title || ""),
      link: it.link || "",
      source: decodeEntities(it.source || "News"),
      date: it.date || null,
      summary: decodeEntities(it.summary || ""),
    }));

    items = filterStale(filterObituaries(items), MAX_AGE_DAYS);
    items.sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));
    items = dedupeByTitle(items);
    return { place: data.place || null, items: items.slice(0, limit) };
  } catch {
    return null;
  }
}
