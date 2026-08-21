// The subscriber's settings as carried in the HubSpot "nexus_prefs" contact
// property: one JSON string, written by the browser through HubSpot's public
// Forms API and read back by the nightly send.
//
// One property rather than one per setting, because a HubSpot custom property
// is a schema change — a property per topic would mean editing the portal every
// time a topic is added, and the topic list moves.
//
// decode() is a trust boundary: this is third-party data re-entering the send
// loop, so it validates rather than trusts, and never throws. A malformed value
// yields null and that subscriber quietly gets the publication default.
import { DEFAULT_PREFS, TOPICS, normalizeLeagues } from "./topics.js";

// Ours run ~400 bytes. Anything near this is not something we wrote.
const MAX_BYTES = 4000;

const asZip = (z) => (/^\d{5}$/.test(String(z ?? "")) ? String(z) : "");
const asTheme = (t) => (t === "dark" ? "dark" : "light");

// Every known topic gets a value. A topic added after the subscriber last saved
// falls back to its default instead of vanishing from their brief.
function cleanRatings(ratings) {
  const out = {};
  for (const key of Object.keys(TOPICS)) {
    const n = Number(ratings?.[key]);
    out[key] = Number.isFinite(n) ? Math.min(5, Math.max(0, Math.round(n))) : DEFAULT_PREFS.ratings[key];
  }
  return out;
}

export function encodePrefs(prefs = {}) {
  return JSON.stringify({
    v: 1,
    zip: asZip(prefs.zip),
    theme: asTheme(prefs.theme),
    leagues: normalizeLeagues(prefs.leagues),
    ratings: cleanRatings(prefs.ratings),
  });
}

export function decodePrefs(raw) {
  if (typeof raw !== "string" || !raw.trim() || raw.length > MAX_BYTES) return null;
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
  return {
    zip: asZip(parsed.zip),
    theme: asTheme(parsed.theme),
    leagues: normalizeLeagues(
      Array.isArray(parsed.leagues) ? parsed.leagues.filter((l) => typeof l === "string") : []
    ),
    ratings: cleanRatings(parsed.ratings),
  };
}

// Recipients sharing a signature share a digest, so the send builds one brief
// per distinct set of settings rather than one per person.
export function prefsSignature(prefs) {
  return prefs ? encodePrefs(prefs) : "default";
}
