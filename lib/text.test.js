import { test } from "node:test";
import assert from "node:assert/strict";
import { filterStale, filterObituaries } from "./text.js";

const NOW = Date.parse("2026-07-29T12:00:00Z");
const daysAgo = (n) => new Date(NOW - n * 86400000).toISOString();
const item = (n) => ({ title: `Story ${n} days old`, date: daysAgo(n) });

test("keeps items inside the window, drops the rest", () => {
  const kept = filterStale([item(0), item(1), item(3), item(6), item(12)], 4, NOW);
  assert.deepEqual(kept.map((i) => i.title), [
    "Story 0 days old",
    "Story 1 days old",
    "Story 3 days old",
  ]);
});

test("the boundary is inclusive", () => {
  assert.equal(filterStale([item(4)], 4, NOW).length, 1, "exactly at the cutoff still counts");
  assert.equal(filterStale([item(4.01)], 4, NOW).length, 0, "just past it does not");
});

test("items with a missing or unparseable date are dropped", () => {
  const items = [{ title: "no date" }, { title: "junk", date: "not a date" }, { title: "null", date: null }];
  assert.deepEqual(filterStale(items, 4, NOW), [], "unverifiable age fails closed");
});

test("empty and missing input never throws", () => {
  assert.deepEqual(filterStale([], 4, NOW), []);
  assert.deepEqual(filterStale(undefined, 4, NOW), []);
});

test("a quiet market returns few items rather than stale ones", () => {
  // The real Salt Lake City response: only one story inside four days.
  const slc = [0.9, 6, 6, 6, 8, 9, 10, 11, 11, 12].map((d) => item(d));
  const kept = filterStale(slc, 4, NOW);
  assert.equal(kept.length, 1, "three fresh items beat ten stale ones");
});

test("obituary filter still works alongside it", () => {
  const items = [
    { title: "City council meets", date: daysAgo(1) },
    { title: "Obituary: Jane Doe", date: daysAgo(1) },
  ];
  assert.deepEqual(
    filterStale(filterObituaries(items), 4, NOW).map((i) => i.title),
    ["City council meets"]
  );
});
