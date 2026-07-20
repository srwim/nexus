"use client";
// Per-visitor local news, fetched in the browser through the Cloudflare
// Worker proxy (workers/local-news-proxy.js). Returns null when the proxy
// isn't configured or anything fails — callers fall back to prebuilt data.
import config from "../nexus.config.json";
import { decodeEntities, filterObituaries } from "./text.js";

export async function getLocalNewsClient(zip, limit = 10) {
  const proxy = config.localNewsProxy;
  if (!proxy || !/^\d{5}$/.test(zip || "")) return null;
  try {
    const res = await fetch(`${proxy.replace(/\/$/, "")}/?zip=${zip}`);
    if (!res.ok) return null;
    const { place, xml } = await res.json();
    const doc = new DOMParser().parseFromString(xml, "text/xml");
    let items = [...doc.querySelectorAll("item")].map((it) => ({
      title: decodeEntities(it.querySelector("title")?.textContent || ""),
      link: it.querySelector("link")?.textContent || "",
      source: it.querySelector("source")?.textContent || "Google News",
      date: it.querySelector("pubDate")?.textContent || null,
      summary: "",
    }));
    const seen = new Set();
    items = filterObituaries(items).filter((it) => {
      const key = it.title.toLowerCase().slice(0, 80);
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    items.sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));
    return { place, items: items.slice(0, limit) };
  } catch {
    return null;
  }
}
