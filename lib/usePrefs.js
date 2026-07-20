"use client";
import { useEffect, useState } from "react";
import { DEFAULT_PREFS } from "./topics";

const KEY = "nexus-prefs";

export function loadPrefs() {
  if (typeof window === "undefined") return DEFAULT_PREFS;
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return DEFAULT_PREFS;
    const saved = JSON.parse(raw);
    return {
      ...DEFAULT_PREFS,
      ...saved,
      ratings: { ...DEFAULT_PREFS.ratings, ...(saved.ratings || {}) },
    };
  } catch {
    return DEFAULT_PREFS;
  }
}

export function savePrefs(prefs) {
  localStorage.setItem(KEY, JSON.stringify(prefs));
}

// If the URL carries shared settings (?p=<base64>), apply them once and
// clean the address bar. Lets anyone share their exact setup with a link.
function applySharedLink(prefs) {
  try {
    const p = new URLSearchParams(window.location.search).get("p");
    if (!p) return prefs;
    const shared = JSON.parse(atob(p));
    const next = {
      ...prefs,
      ...(shared.zip !== undefined ? { zip: String(shared.zip).replace(/\D/g, "").slice(0, 5) } : {}),
      ...(Array.isArray(shared.leagues) ? { leagues: shared.leagues.filter((l) => typeof l === "string") } : {}),
      ratings: { ...prefs.ratings, ...(shared.ratings || {}) },
    };
    savePrefs(next);
    window.history.replaceState({}, "", window.location.pathname);
    return next;
  } catch {
    return prefs;
  }
}

// Build a shareable link for the current prefs (never includes email).
export function shareLink(prefs) {
  const payload = { zip: prefs.zip || "", ratings: prefs.ratings, leagues: prefs.leagues };
  const base = window.location.origin + window.location.pathname.replace(/settings\/?$/, "");
  return `${base}?p=${btoa(JSON.stringify(payload))}`;
}

export function usePrefs() {
  const [prefs, setPrefs] = useState(DEFAULT_PREFS);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    setPrefs(applySharedLink(loadPrefs()));
    setReady(true);
  }, []);
  const update = (next) => {
    setPrefs(next);
    savePrefs(next);
  };
  return { prefs, update, ready };
}
