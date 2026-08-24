// Sponsor selection, from sponsors.json in the repo.
//
// Replaces the Sponsy API for day-to-day use. A sponsor slot is a title, a
// line of copy and a link — that never needed a third-party service or a
// monthly fee, and a JSON file edited through GitHub's web UI gives versioning
// and a one-click revert for free.
//
// Pure and browser-safe: the same selection runs in the nightly send, in the
// build's newsletter preview, and in /preview, so all three agree.
export const PLACEMENTS = ["top", "primary", "footer"];

// Dates are inclusive and compared as YYYY-MM-DD strings against the Denver
// date the send already computes. String comparison rather than Date maths
// keeps a campaign from starting a few hours early for readers in other zones.
function isActive(c, today) {
  if (!c || c.draft) return false;
  if (!c.title) return false; // an untitled campaign renders as nothing anyway
  if (today && c.start && today < c.start) return false;
  if (today && c.end && today > c.end) return false;
  return true;
}

const isHouse = (c, data) => Boolean(c.house || (data?.house && c.id === data.house));

// Stable within a day, different across days. Two sponsors who bought the same
// placement for the same week get alternating days rather than one taking the
// whole run because it happens to be first in the file.
function dayIndex(today) {
  const t = Date.parse(`${today}T00:00:00Z`);
  return Number.isFinite(t) ? Math.floor(t / 86400000) : 0;
}

// Only ever http(s). A sponsor link is attacker-adjacent input — it arrives by
// email from whoever sold us a slot — and "javascript:", "data:" and friends
// are how a link in a trusted newsletter becomes an attack. Anything that isn't
// a well-formed http(s) URL renders as plain text instead of an anchor, so a
// bad entry degrades to unclickable rather than dangerous.
//
// This is the first of three layers. The second is the same check in the click
// worker; the third is that the worker resolves destinations by campaign id and
// never accepts a URL as a parameter, so arok.ai cannot be used as an open
// redirect even if something bad reaches sponsors.json.
export function safeUrl(raw) {
  if (!raw) return null;
  try {
    const u = new URL(String(raw));
    return u.protocol === "https:" || u.protocol === "http:" ? u : null;
  } catch {
    return null; // relative, protocol-relative and malformed all land here
  }
}

// Sponsors get attribution they can verify in their own analytics without us
// running any tracking of our own.
function tagUrl(url, id, placement) {
  const u = safeUrl(url);
  if (!u) return "";
  u.searchParams.set("utm_source", "nexus");
  u.searchParams.set("utm_medium", "email");
  u.searchParams.set("utm_campaign", id);
  u.searchParams.set("utm_content", placement);
  return u.toString();
}

// When click counting is switched on, the link points at our worker, which
// resolves the destination from the campaign id. The id travels; the URL never
// does. See workers/local-news-proxy.js.
function clickUrl(trackBase, id, placement) {
  const base = safeUrl(trackBase);
  if (!base) return "";
  return `${String(trackBase).replace(/\/+$/, "")}/c?id=${encodeURIComponent(id)}&p=${encodeURIComponent(placement)}`;
}

// The shape lib/email.js already renders. Deliberately unchanged so this is a
// drop-in replacement for what fetchSponsors() returned.
function shape(c, placement, trackBase) {
  const direct = tagUrl(c.url, c.id || "sponsor", placement);
  // Only route through the counter if the destination itself is valid. A
  // tracking link that resolves to nothing is worse than no link.
  const tracked = direct && trackBase ? clickUrl(trackBase, c.id || "sponsor", placement) : "";
  return {
    id: c.id,
    house: Boolean(c.house),
    title: c.title || "",
    cta: c.cta || "",
    body: c.body || "",
    bodyHtml: c.bodyHtml || "",
    linkText: c.linkText || "",
    url: tracked || direct,
  };
}

// data: parsed sponsors.json. today: "YYYY-MM-DD" (Denver).
// trackBase: the worker origin, only when data.trackClicks is on.
// Returns { top, primary, footer }, any of which may be null.
export function selectSponsors(data, today, trackBase = "") {
  const track = data?.trackClicks ? trackBase : "";
  const active = (data?.campaigns || []).filter((c) => isActive(c, today));
  const out = {};
  for (const placement of PLACEMENTS) {
    const eligible = active.filter((c) => (c.placements || []).includes(placement));
    const paid = eligible.filter((c) => !isHouse(c, data));
    if (paid.length) {
      out[placement] = shape(paid[dayIndex(today) % paid.length], placement, track);
    } else {
      // Nobody bought it, so the house ad runs rather than the slot sitting
      // empty. A blank slot looks like a bug; a house ad looks like a choice.
      const house = eligible.find((c) => isHouse(c, data));
      out[placement] = house ? shape(house, placement, track) : null;
    }
  }
  return out;
}

// Merge in whatever another source (Sponsy) returned, without letting it
// displace a placement that has actually been sold. Order of precedence:
// paid local campaign, then the other source, then the house ad.
export function mergeSponsors(local, other, data, today) {
  if (!other) return local;
  const active = (data?.campaigns || []).filter((c) => isActive(c, today));
  const out = { ...local };
  for (const placement of PLACEMENTS) {
    const soldLocally = active.some(
      (c) => !isHouse(c, data) && (c.placements || []).includes(placement)
    );
    if (!soldLocally && other[placement]?.title) out[placement] = other[placement];
  }
  return out;
}

// One line for the send log, so which ad ran on a given day is answerable
// later without re-deriving it.
export function describeSponsors(sponsors) {
  return PLACEMENTS.map((p) => {
    const s = sponsors?.[p];
    if (!s?.title) return `${p}=—`;
    return `${p}="${s.title}"${s.house ? " (house)" : ""}`;
  }).join(" ");
}
