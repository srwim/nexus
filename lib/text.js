// Dependency-free text helpers shared by server scripts and the browser.

const NAMED_ENTITIES = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ",
  rsquo: "’", lsquo: "‘", rdquo: "”", ldquo: "“",
  ndash: "–", mdash: "—", hellip: "…", copy: "©",
  reg: "®", trade: "™", deg: "°", eacute: "é",
};

// Some feeds double-encode entities ("Birdfy&#8217;s"). Decode numeric and
// common named entities so titles display correctly everywhere.
export function decodeEntities(s) {
  return String(s || "")
    .replace(/&#(\d+);/g, (_, n) => safeCodePoint(+n))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => safeCodePoint(parseInt(n, 16)))
    .replace(/&([a-z]+);/gi, (m, name) => NAMED_ENTITIES[name.toLowerCase()] ?? m);
}

function safeCodePoint(n) {
  try {
    return String.fromCodePoint(n);
  } catch {
    return "";
  }
}

export function stripHtml(s) {
  return String(s || "").replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim();
}

// Obituaries and death notices dominate local Google News results; filter
// them out of local coverage (national outlets covering a death still pass).
const OBIT_RE = /\bobituar(y|ies)\b|\bdeath notices?\b|\bin memoriam\b|\bfuneral (home|services?|notice)\b/i;

export function filterObituaries(items) {
  return items.filter((it) => !OBIT_RE.test(`${it.title} ${it.summary || ""} ${it.source || ""}`));
}
