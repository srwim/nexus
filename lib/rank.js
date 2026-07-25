// The selection logic the brief is judged on: which items make the cut.
//
// Pure and I/O-free on purpose — the newsletter feeds it freshly fetched data,
// the eval harness feeds it a frozen snapshot, and both get identical results.
// That equivalence is the whole point: evals grade the shipping code path, not
// a reimplementation of it.
import { TOPICS, STORY_BUDGET } from "./topics.js";
import { makeDeduper } from "./text.js";

// Topics the reader actually wants, best-rated first. Zero stars drops out.
export function activeTopics(ratings = {}) {
  return Object.keys(TOPICS)
    .filter((t) => (ratings[t] || 0) > 0)
    .sort((a, b) => (ratings[b] || 0) - (ratings[a] || 0));
}

export function budgetFor(rating) {
  return STORY_BUDGET[rating] ?? 4;
}

// One de-duplicator walks every section in rating order, so a story that ran in
// a higher-rated section can't reappear lower down. Then each section is cut to
// its star budget — dedup first, trim second, or the trim would hide duplicates.
export function selectSections(sections) {
  const keep = makeDeduper();
  return sections.map((s) =>
    s.type !== "news" ? s : { ...s, items: (s.items || []).filter((it) => keep(it)).slice(0, s.budget) }
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
