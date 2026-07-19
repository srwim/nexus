"use client";
// Client-side access to the prebuilt JSON written by scripts/build-data.mjs.
export const BASE = process.env.NEXT_PUBLIC_BASE_PATH || "";

export async function getData(name) {
  try {
    const res = await fetch(`${BASE}/data/${name}.json`, { cache: "no-store" });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}
