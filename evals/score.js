// Deterministic scoring. No API key, no network, no cost — so these can be run
// on every commit and iterated on for free.
//
// Two metrics, and only two:
//   recall     — share of must-include items that survived selection. Soft.
//   violations — must-exclude items that got through. HARD: any is a failure.
//
// Both are scored against item `link`, which is unique and stable across runs.
import { selectedLinks } from "../lib/rank.js";

export function scoreCase(kase, sections) {
  const chosen = selectedLinks(sections);
  const include = kase.labels?.must_include || [];
  const exclude = kase.labels?.must_exclude || [];

  const hit = include.filter((l) => chosen.has(l));
  const missed = include.filter((l) => !chosen.has(l));
  const violations = exclude.filter((l) => chosen.has(l));

  return {
    id: kase.id,
    selected: chosen.size,
    // null, not 1, when nothing is labeled — an unlabeled case has no opinion
    // to average in, and scoring it 100% would flatter the aggregate.
    recall: include.length ? hit.length / include.length : null,
    hit: hit.length,
    labeled: include.length,
    missed,
    violations,
  };
}

export function aggregate(results) {
  const scored = results.filter((r) => r.recall !== null);
  const recall = scored.length ? scored.reduce((n, r) => n + r.recall, 0) / scored.length : null;
  return {
    cases: results.length,
    scored: scored.length,
    recall,
    violations: results.reduce((n, r) => n + r.violations.length, 0),
  };
}
