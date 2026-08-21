// Who published this, who owns them, and where independent raters place them.
//
// THESE ARE NOT NEXUS'S JUDGMENTS. `lean` reflects where the published
// media-bias services broadly agree an outlet sits (AllSides, Ad Fontes Media,
// Media Bias/Fact Check). Where they disagree, or where an outlet doesn't do
// political reporting at all, `lean` is omitted and nothing is shown. Ownership
// is a matter of record; it is also omitted when it isn't clearly established.
//
// Both facts rot. Ownership changes hands (Politico to Axel Springer, The Hill
// to Nexstar, CBS to Skydance) and raters re-review (AllSides moved AP to Lean
// Left in May 2026). CHECKED is the last time this table was reviewed against
// the sources, and it is shown to the reader rather than hidden.
//
// ponytail: a hand-maintained table, not a live rating API. There is no free
// bias-rating API, and a stale label the reader can date-check beats an
// expensive dependency. Re-review roughly quarterly.
import { publisherOf } from "./rank.js";

export const CHECKED = "2026-08";
export const RATING_BASIS = "AllSides, Ad Fontes Media and Media Bias/Fact Check";

// Position on the published left/right scale. Deliberately five coarse steps:
// the raters themselves don't agree to finer resolution, so pretending to it
// would be false precision.
export const LEAN_LABELS = {
  left: "Left",
  "lean-left": "Lean left",
  center: "Center",
  "lean-right": "Lean right",
  right: "Right",
};
export const LEAN_ORDER = ["left", "lean-left", "center", "lean-right", "right"];

// Keyed by the article link's hostname. Subdomains resolve to their parent, so
// `profootballtalk.nbcsports.com` finds `nbcsports.com`.
export const OUTLETS = {
  // ── wires and general news ────────────────────────────────────────────────
  "apnews.com": { lean: "lean-left", owner: "Nonprofit co-op" },
  "reuters.com": { lean: "center", owner: "Thomson Reuters" },
  "npr.org": { lean: "lean-left", owner: "Nonprofit" },
  "bbc.com": { lean: "center", owner: "UK public" },
  "bbc.co.uk": { lean: "center", owner: "UK public" },
  "theguardian.com": { lean: "left", owner: "Scott Trust" },
  "aljazeera.com": { lean: "lean-left", owner: "Qatar state" },
  "dw.com": { lean: "center", owner: "Germany public" },
  "sky.com": { lean: "center", owner: "Comcast" },
  "nbcnews.com": { lean: "lean-left", owner: "Comcast" },
  "abcnews.go.com": { lean: "lean-left", owner: "Disney" },
  "go.com": { lean: "lean-left", owner: "Disney" },
  "cbsnews.com": { lean: "lean-left", owner: "Paramount Skydance" },

  // ── politics ──────────────────────────────────────────────────────────────
  "politico.com": { lean: "lean-left", owner: "Axel Springer" },
  "thehill.com": { lean: "center", owner: "Nexstar" },
  "washingtonpost.com": { lean: "lean-left", owner: "Jeff Bezos" },
  "vox.com": { lean: "left", owner: "Vox Media" },

  // ── business ──────────────────────────────────────────────────────────────
  "cnbc.com": { lean: "center", owner: "Comcast" },
  "marketwatch.com": { lean: "center", owner: "News Corp" },
  "wsj.com": { lean: "center", owner: "News Corp" },
  "fortune.com": { lean: "center" },
  "businessinsider.com": { lean: "lean-left", owner: "Axel Springer" },

  // ── conflict and defense ──────────────────────────────────────────────────
  "reliefweb.int": { lean: "center", owner: "UN OCHA" },
  "defenseone.com": { lean: "center", owner: "Atlantic Media" },
  "breakingdefense.com": { lean: "center" },
  "warontherocks.com": { lean: "center" },
  "stripes.com": { lean: "center", owner: "US DoD" },
  "militarytimes.com": { lean: "center", owner: "Sightline Media" },

  // ── science, health, climate ──────────────────────────────────────────────
  "nature.com": { lean: "center", owner: "Springer Nature" },
  "sciencedaily.com": { lean: "center" },
  "phys.org": { lean: "center" },
  "newscientist.com": { lean: "center" },
  "statnews.com": { lean: "center", owner: "Boston Globe Media" },
  "kffhealthnews.org": { lean: "center", owner: "Nonprofit (KFF)" },
  "medpagetoday.com": { lean: "center", owner: "Everyday Health" },
  "insideclimatenews.org": { lean: "lean-left", owner: "Nonprofit" },
  "grist.org": { lean: "left", owner: "Nonprofit" },
  "carbonbrief.org": { lean: "center", owner: "Nonprofit" },
  "yaleclimateconnections.org": { lean: "center", owner: "Yale" },
  "yale.edu": { lean: "center", owner: "Yale" },

  // ── technology ────────────────────────────────────────────────────────────
  // Lean is shown for tech titles that regularly cover policy; the rest are
  // ownership only. A political score on a GPU review is noise.
  "theverge.com": { lean: "lean-left", owner: "Vox Media" },
  "wired.com": { lean: "lean-left", owner: "Condé Nast" },
  "arstechnica.com": { lean: "center", owner: "Condé Nast" },
  "techcrunch.com": { lean: "center" },
  "theregister.com": { lean: "center" },
  "engadget.com": {},
  "venturebeat.com": {},
  "technologyreview.com": { owner: "MIT" },
  "spectrum.ieee.org": { owner: "IEEE" },
  "ieee.org": { owner: "IEEE" },
  "the-decoder.com": {},
  "artificialintelligence-news.com": {},

  // ── cybersecurity ─────────────────────────────────────────────────────────
  "krebsonsecurity.com": { owner: "Independent" },
  "bleepingcomputer.com": {},
  "thehackernews.com": {},
  "darkreading.com": { owner: "Informa" },
  "securityweek.com": { owner: "Wired Business Media" },
  "therecord.media": { owner: "Recorded Future" },

  // ── space ─────────────────────────────────────────────────────────────────
  "nasa.gov": { owner: "US government" },
  "space.com": { owner: "Future plc" },
  "spacenews.com": {},
  "universetoday.com": { owner: "Independent" },
  "skyandtelescope.org": { owner: "AAS" },

  // ── gaming ────────────────────────────────────────────────────────────────
  "polygon.com": { owner: "Valnet" },
  "eurogamer.net": { owner: "IGN Entertainment" },
  "kotaku.com": { owner: "Keleops" },
  "gamespot.com": { owner: "Fandom" },
  "pcgamer.com": { owner: "Future plc" },
  "rockpapershotgun.com": { owner: "IGN Entertainment" },
  "gamesindustry.biz": { owner: "IGN Entertainment" },

  // ── crypto ────────────────────────────────────────────────────────────────
  // A sector where who owns the outlet is the more useful disclosure: several
  // are owned by firms with positions in what they cover.
  "coindesk.com": { owner: "Bullish" },
  "cointelegraph.com": {},
  "decrypt.co": {},
  "theblock.co": { owner: "Foresight Ventures" },
  "bitcoinmagazine.com": { owner: "BTC Inc" },
  "cryptoslate.com": {},

  // ── culture ───────────────────────────────────────────────────────────────
  "variety.com": { owner: "Penske Media" },
  "rollingstone.com": { lean: "left", owner: "Penske Media" },
  "hollywoodreporter.com": { owner: "Penske Media" },
  "avclub.com": { owner: "Paste Media" },
  "pitchfork.com": { owner: "Condé Nast" },

  // ── sports ────────────────────────────────────────────────────────────────
  "espn.com": { owner: "Disney" },
  "nbcsports.com": { owner: "Comcast" },
  "cbssports.com": { owner: "Paramount Skydance" },
  "yahoo.com": { owner: "Yahoo" },
  "si.com": { owner: "Minute Media" },
  "skysports.com": { owner: "Comcast" },
  "goal.com": { owner: "Footballco" },
  "hoopshype.com": { owner: "USA Today Network" },
  "usatoday.com": { owner: "Gannett" },
  "mlbtraderumors.com": { owner: "Independent" },
  "golfdigest.com": { owner: "Discovery Golf" },
  "motorsport.com": { owner: "Motorsport Network" },
  "autosport.com": { owner: "Motorsport Network" },
  "planetf1.com": { owner: "Planet Sport" },
  "racefans.net": { owner: "Independent" },
  "crash.net": {},
  "motorsportweek.com": {},
  "frontstretch.com": { owner: "Independent" },
  "racer.com": {},
};

// Walk the hostname up its parents so subdomains resolve without an entry each.
export function outletFor(item) {
  let host = publisherOf(item);
  while (host) {
    const hit = OUTLETS[host];
    if (hit) return { host, lean: hit.lean || null, owner: hit.owner || null };
    const dot = host.indexOf(".");
    if (dot < 0) return null;
    host = host.slice(dot + 1);
  }
  return null;
}

// What the reader actually sees, or null when we know nothing worth showing.
// Silence beats a confident label we can't stand behind.
export function sourceLabel(item) {
  const o = outletFor(item);
  if (!o || (!o.lean && !o.owner)) return null;
  return {
    owner: o.owner,
    lean: o.lean,
    leanLabel: o.lean ? LEAN_LABELS[o.lean] : null,
    leanIndex: o.lean ? LEAN_ORDER.indexOf(o.lean) : -1,
    title: [
      o.owner ? `Owner: ${o.owner}` : null,
      o.lean ? `Political lean: ${LEAN_LABELS[o.lean]} (${RATING_BASIS}, checked ${CHECKED})` : null,
    ]
      .filter(Boolean)
      .join(" · "),
  };
}
