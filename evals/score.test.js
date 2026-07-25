import { test } from "node:test";
import assert from "node:assert/strict";
import { scoreCase, aggregate } from "./score.js";

// Minimal stand-in for the shape rankFromData returns.
const sections = (...links) => [
  { type: "news", items: links.map((l) => ({ title: l, link: l })) },
];

const kase = (must_include = [], must_exclude = []) => ({
  id: "case-1",
  labels: { must_include, must_exclude },
});

test("recall is the share of must-include items that survived", () => {
  const r = scoreCase(kase(["a", "b", "c", "d"]), sections("a", "b", "z"));
  assert.equal(r.hit, 2);
  assert.equal(r.labeled, 4);
  assert.equal(r.recall, 0.5);
  assert.deepEqual(r.missed, ["c", "d"], "misses are named so they can be reviewed");
});

test("must-exclude items appearing in the brief are reported as violations", () => {
  const r = scoreCase(kase([], ["spam", "dupe"]), sections("a", "spam"));
  assert.deepEqual(r.violations, ["spam"]);
});

test("no violation when excluded items were correctly left out", () => {
  const r = scoreCase(kase([], ["spam"]), sections("a", "b"));
  assert.deepEqual(r.violations, []);
});

test("an unlabeled case scores null recall, not a free 100%", () => {
  const r = scoreCase(kase(), sections("a", "b"));
  assert.equal(r.recall, null, "unlabeled cases must not inflate the aggregate");
});

test("aggregate averages only labeled cases and sums every violation", () => {
  const agg = aggregate([
    { recall: 1, violations: [] },
    { recall: 0.5, violations: ["x"] },
    { recall: null, violations: ["y", "z"] }, // unlabeled: excluded from the mean
  ]);
  assert.equal(agg.cases, 3);
  assert.equal(agg.scored, 2);
  assert.equal(agg.recall, 0.75, "mean of 1.0 and 0.5, ignoring the unlabeled case");
  assert.equal(agg.violations, 3, "violations count even in unlabeled cases");
});

test("aggregate with nothing labeled reports null rather than NaN", () => {
  const agg = aggregate([{ recall: null, violations: [] }]);
  assert.equal(agg.recall, null);
  assert.equal(agg.violations, 0);
});
