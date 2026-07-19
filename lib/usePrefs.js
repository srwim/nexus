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

export function usePrefs() {
  const [prefs, setPrefs] = useState(DEFAULT_PREFS);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    setPrefs(loadPrefs());
    setReady(true);
  }, []);
  const update = (next) => {
    setPrefs(next);
    savePrefs(next);
  };
  return { prefs, update, ready };
}
