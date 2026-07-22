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

// Fingerprint a headline for cross-source de-duplication. The same wire story
// (AP/Reuters) republished by many outlets arrives as "Headline - KSL",
// "Headline | The Tribune", etc. — so strip a trailing spaced "- Source" /
// "| Source" segment, then drop punctuation and spacing so those collapse to
// one key. Distinct headlines still produce distinct keys.
export function titleKey(title) {
  return String(title || "")
    .toLowerCase()
    .replace(/\s+[|–—-]\s+.+$/, "") // remove trailing " - Source" style suffix
    .replace(/[^a-z0-9]+/g, "")
    .slice(0, 100);
}

// Significant words of a headline (drop tiny/stop words) for overlap scoring.
const STOP = new Set([
  "the", "a", "an", "of", "to", "in", "on", "for", "and", "with", "as", "at",
  "by", "from", "is", "are", "be", "was", "were", "its", "his", "her", "their",
  "new", "says", "say", "said", "after", "over", "amid", "will", "how", "what",
  "why", "who", "amp",
]);

function sigWords(title) {
  return new Set(
    String(title || "")
      .toLowerCase()
      .replace(/[^a-z0-9 ]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 2 && !STOP.has(w))
  );
}

// Jaccard overlap of two significant-word sets (0–1).
function overlap(a, b) {
  if (!a.size || !b.size) return 0;
  let inter = 0;
  for (const w of a) if (b.has(w)) inter++;
  return inter / (a.size + b.size - inter);
}

// De-duplicate a list of {title,...} items, keeping the first (newest, once
// sorted) occurrence. Two passes: (1) exact fingerprint match — same wire story
// from different outlets; (2) high word overlap — the same event written up
// with slightly different headlines (e.g. one adds a word like "MAGA"). The
// threshold is deliberately high so genuinely distinct stories are kept.
export function dedupeByTitle(items, threshold = 0.8) {
  const keys = new Set();
  const wordSets = [];
  const out = [];
  for (const it of items) {
    const key = titleKey(it.title);
    if (!key || keys.has(key)) continue;
    const ws = sigWords(it.title);
    if (wordSets.some((prev) => overlap(ws, prev) >= threshold)) continue;
    keys.add(key);
    wordSets.push(ws);
    out.push(it);
  }
  return out;
}
