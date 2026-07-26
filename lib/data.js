"use client";
// Client-side access to the prebuilt JSON written by scripts/build-data.mjs.
export const BASE = process.env.NEXT_PUBLIC_BASE_PATH || "";

// The cache-buster matters as much here as in the newsletter: `no-store` is a
// request directive and won't stop a CDN edge from serving its own cached copy,
// which would show visitors yesterday's news. Rounded to the 5-minute mark so
// repeat visits within a window still hit the browser cache.
export async function getData(name) {
  try {
    const bust = Math.floor(Date.now() / 300000);
    const res = await fetch(`${BASE}/data/${name}.json?t=${bust}`, { cache: "no-store" });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}
