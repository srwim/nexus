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

// Distinctive tokens of a headline (from ORIGINAL casing): acronyms (US, NATO),
// mid-headline proper nouns (Saudi, Arabia), and numbers/years. Two stories
// about the same event tend to share several of these even when the phrasing
// differs. Used as a stronger same-event signal than raw word overlap.
function distinctiveTokens(title) {
  const toks = String(title || "").split(/[^A-Za-z0-9]+/).filter(Boolean);
  const out = new Set();
  toks.forEach((w, idx) => {
    if (/^\d{2,}$/.test(w)) out.add(w.toLowerCase()); // numbers (years, counts)
    else if (/^[A-Z]{2,5}$/.test(w)) out.add(w.toLowerCase()); // acronyms, any position
    else if (idx > 0 && w.length > 2 && /^[A-Z][a-z]/.test(w)) out.add(w.toLowerCase()); // proper nouns
  });
  return out;
}

function sharedCount(a, b) {
  let n = 0;
  for (const w of a) if (b.has(w)) n++;
  return n;
}

const NEAR = 0.5; // lower bound for the proper-noun-assisted match

// Fingerprint of a story's summary/body. The same wire story (AP/Reuters)
// republished by different outlets keeps the same body text even when the
// headline is rewritten — so an identical body prefix is a strong duplicate
// signal that headlines alone miss. Only used when the summary is substantial,
// to avoid collapsing items that share a short boilerplate blurb.
// Use a FIXED-length prefix (not a fraction of the summary) so the same body
// text matches even when outlets truncate the blurb to different lengths.
function summaryKey(summary) {
  const t = String(summary || "").toLowerCase().replace(/[^a-z0-9]+/g, "");
  return t.length >= 80 ? t.slice(0, 80) : "";
}

// De-duplicate a list of {title,...} items, keeping the first (newest, once
// sorted) occurrence. Two passes: (1) exact fingerprint match — same wire story
// from different outlets; (2) high word overlap — the same event written up
// with slightly different headlines (e.g. one adds a word like "MAGA"). The
// threshold is deliberately high so genuinely distinct stories are kept.
// A stateful de-duplicator. Call keep(item) with each {title, summary} in
// priority order; it returns true the first time a story is seen and false for
// later duplicates. Reuse ONE instance across multiple sections to stop the same
// story appearing in more than one (e.g. a TechCrunch AI story in both Tech and
// AI), or across a single list for ordinary de-duplication. Duplicates are
// caught by (1) identical body text — same wire story, any headline; (2) exact
// title fingerprint; (3) high title overlap; (4) solid overlap + shared proper
// nouns.
export function makeDeduper(threshold = 0.8) {
  const keys = new Set();
  const summaries = new Set();
  const kept = []; // { words, dist } per surviving headline
  return function keep(item) {
    const title = typeof item === "string" ? item : item?.title;
    const summary = typeof item === "string" ? "" : item?.summary;

    const sk = summaryKey(summary);
    if (sk && summaries.has(sk)) return false; // same wire-story body

    const key = titleKey(title);
    if (!key || keys.has(key)) return false;
    const ws = sigWords(title);
    const dt = distinctiveTokens(title);
    const dup = kept.some((prev) => {
      const ov = overlap(ws, prev.words);
      if (ov >= threshold) return true; // clearly the same wording
      // Same event, different phrasing: solid overlap AND 2+ shared proper nouns.
      return ov >= NEAR && sharedCount(dt, prev.dist) >= 2;
    });
    if (dup) return false;

    keys.add(key);
    if (sk) summaries.add(sk);
    kept.push({ words: ws, dist: dt });
    return true;
  };
}

export function dedupeByTitle(items, threshold = 0.8) {
  const keep = makeDeduper(threshold);
  return items.filter((it) => keep(it));
}
