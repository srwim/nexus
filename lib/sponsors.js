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

// Sponsors get attribution they can verify in their own analytics without us
// running any tracking of our own.
function tagUrl(url, id, placement) {
  if (!url) return "";
  try {
    const u = new URL(url);
    u.searchParams.set("utm_source", "nexus");
    u.searchParams.set("utm_medium", "email");
    u.searchParams.set("utm_campaign", id);
    u.searchParams.set("utm_content", placement);
    return u.toString();
  } catch {
    return url; // a malformed URL is the sponsor's problem, not a crash
  }
}

// The shape lib/email.js already renders. Deliberately unchanged so this is a
// drop-in replacement for what fetchSponsors() returned.
function shape(c, placement) {
  return {
    id: c.id,
    house: Boolean(c.house),
    title: c.title || "",
    cta: c.cta || "",
    body: c.body || "",
    bodyHtml: c.bodyHtml || "",
    linkText: c.linkText || "",
    url: tagUrl(c.url, c.id || "sponsor", placement),
  };
}

// data: parsed sponsors.json. today: "YYYY-MM-DD" (Denver).
// Returns { top, primary, footer }, any of which may be null.
export function selectSponsors(data, today) {
  const active = (data?.campaigns || []).filter((c) => isActive(c, today));
  const out = {};
  for (const placement of PLACEMENTS) {
    const eligible = active.filter((c) => (c.placements || []).includes(placement));
    const paid = eligible.filter((c) => !isHouse(c, data));
    if (paid.length) {
      out[placement] = shape(paid[dayIndex(today) % paid.length], placement);
    } else {
      // Nobody bought it, so the house ad runs rather than the slot sitting
      // empty. A blank slot looks like a bug; a house ad looks like a choice.
      const house = eligible.find((c) => isHouse(c, data));
      out[placement] = house ? shape(house, placement) : null;
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
