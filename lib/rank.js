// The selection logic the brief is judged on: which items make the cut.
//
// Pure and I/O-free on purpose — the newsletter feeds it freshly fetched data,
// the eval harness feeds it a frozen snapshot, and both get identical results.
// That equivalence is the whole point: evals grade the shipping code path, not
// a reimplementation of it.
import { TOPICS, STORY_BUDGET } from "./topics.js";
import { makeDeduper, dedupeByTitle } from "./text.js";

// Topics the reader actually wants, best-rated first. Zero stars drops out.
export function activeTopics(ratings = {}) {
  return Object.keys(TOPICS)
    .filter((t) => (ratings[t] || 0) > 0)
    .sort((a, b) => (ratings[b] || 0) - (ratings[a] || 0));
}

export function budgetFor(rating) {
  return STORY_BUDGET[rating] ?? 4;
}

// Publisher identity, taken from the link rather than the RSS <source> title —
// feeds report themselves inconsistently (" Polygon.com " vs "Polygon"), but the
// domain is stable.
export function publisherOf(item) {
  try {
    return new URL(item.link).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return String(item?.source || "").trim().toLowerCase();
  }
}

// Trim to budget WITHOUT letting one publisher take the section.
//
// Sorting purely by recency and slicing hands the whole section to whoever
// posts most often — Polygon filed nine stories in a row and owned all eight
// Gaming slots. So each publisher gets at most a third of the budget, and only
// if the cap would leave the section short do we backfill from the remainder:
// eight stories from one outlet still beats three stories.
//
// ponytail: a flat fraction, not a scoring model — revisit only if a section
// still reads monotonous once the feed roster is wide.
export function diversify(items, budget) {
  if (budget <= 0) return [];
  const cap = Math.max(1, Math.ceil(budget / 3));
  const used = new Map();
  const picked = [];
  const spare = new Map(); // publisher -> items that exceeded the cap

  for (const it of items) {
    const p = publisherOf(it);
    const n = used.get(p) || 0;
    if (picked.length < budget && n < cap) {
      picked.push(it);
      used.set(p, n + 1);
    } else {
      if (!spare.has(p)) spare.set(p, []);
      spare.get(p).push(it);
    }
  }

  // Backfill from whoever has been used least, not in raw feed order. Taking
  // spares in order would hand every leftover slot back to the loudest
  // publisher — with only two outlets available that produced 5/3 instead of
  // the 4/4 the cap was trying to achieve.
  while (picked.length < budget) {
    let next = null;
    let fewest = Infinity;
    for (const [p, list] of spare) {
      if (!list.length) continue;
      const n = used.get(p) || 0;
      if (n < fewest) {
        fewest = n;
        next = p;
      }
    }
    if (!next) break; // nothing left anywhere
    picked.push(spare.get(next).shift());
    used.set(next, (used.get(next) || 0) + 1);
  }

  // Selection is by variety; presentation stays chronological.
  return picked.sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));
}

// Combine several already-sorted lists into one section: round-robin so a
// prolific source can't bury a quiet one, then dedupe, then cap per publisher.
//
// Used by any topic whose items arrive pre-split into groups — sports by league,
// foreign reporting by country. Merging by date alone would let one busy group
// take the whole section before the others are considered.
export function mergeChunks(chunks, limit) {
  const woven = [];
  for (let i = 0; woven.length < limit * 3; i++) {
    let added = false;
    for (const chunk of chunks) {
      if (i < chunk.length) {
        woven.push(chunk[i]);
        added = true;
      }
    }
    if (!added) break;
  }
  return diversify(dedupeByTitle(woven), limit);
}

// One de-duplicator walks every section in rating order, so a story that ran in
// a higher-rated section can't reappear lower down. Then each section is cut to
// its star budget — dedup first, trim second, or the trim would hide duplicates.
export function selectSections(sections) {
  const keep = makeDeduper();
  return sections.map((s) =>
    s.type !== "news" ? s : { ...s, items: diversify((s.items || []).filter((it) => keep(it)), s.budget) }
  );
}

// data: { [topicKey]: { items?, place?, local?, alerts? } } — whatever the
// topic's JSON holds. Returns finished sections.
export function rankFromData(data = {}, prefs = {}) {
  const ratings = prefs.ratings || {};
  const sections = activeTopics(ratings).map((key) => {
    const rating = ratings[key] || 0;
    const topic = TOPICS[key];
    const d = data[key];
    const base = { key, label: topic.label, icon: topic.icon, rating, budget: budgetFor(rating) };
    if (key === "weather") return { ...base, type: "weather", weather: d || null };
    return { ...base, type: "news", place: d?.place || null, items: d?.items || [] };
  });
  return selectSections(sections);
}

// Every link that survived selection — the brief's actual contents, and what
// the must-include / must-exclude labels are scored against.
export function selectedLinks(sections) {
  return new Set(sections.flatMap((s) => (s.items || []).map((i) => i.link)).filter(Boolean));
}
