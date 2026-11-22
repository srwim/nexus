// The translation budget against the build schedule GitHub actually ran.
import { test } from "node:test";
import assert from "node:assert/strict";
import { budgetFor, translatePending, MAX_PER_RUN, MAX_SCALE } from "./translate.mjs";

const NOW = Date.parse("2026-11-22T01:01:50Z");
const ago = (minutes) => new Date(NOW - minutes * 60000).toISOString();

test("a build on the intended 30-minute schedule gets the base budget", () => {
  assert.equal(budgetFor(ago(30), NOW), MAX_PER_RUN);
  assert.equal(budgetFor(ago(5), NOW), MAX_PER_RUN, "a quick rebuild never gets less than the base");
});

test("a late build gets more, in proportion to the gap", () => {
  assert.equal(budgetFor(ago(45), NOW), MAX_PER_RUN * 2);
  assert.equal(budgetFor(ago(90), NOW), MAX_PER_RUN * 3);
});

test("the real gaps of Nov 2026 (4 to 9 hours) hit the cap instead of running unbounded", () => {
  for (const minutes of [253, 357, 519]) {
    assert.equal(budgetFor(ago(minutes), NOW), MAX_PER_RUN * MAX_SCALE, `${minutes} min`);
  }
});

test("a cold start, or an unreadable timestamp, gets only the base budget", () => {
  // No previous build means no cache, so everything is pending: this is the
  // case the per-run budget exists to protect.
  for (const bad of [undefined, null, "", "not a date"]) assert.equal(budgetFor(bad, NOW), MAX_PER_RUN);
  assert.equal(budgetFor(ago(-60), NOW), MAX_PER_RUN, "a clock running backwards is not a reason to spend more");
});

test("translation stops at the time limit and leaves the rest for the next build", async () => {
  const pending = Array.from({ length: 90 }, (_, i) => ({ lang: "fr", text: `texte ${i}`, k: `fr:${i}` }));
  const cache = new Map();
  let clock = 0;
  let calls = 0;
  const realFetch = globalThis.fetch;
  const realLog = console.log;
  console.log = () => {};
  globalThis.fetch = async (_url, init) => {
    calls++;
    clock += 1000; // each batch takes a "second"
    const { texts } = JSON.parse(init.body);
    return new Response(JSON.stringify({ translations: texts.map((t) => `EN ${t}`) }));
  };
  try {
    const done = await translatePending(pending, cache, {
      endpoint: "https://w.example",
      apiKey: "k",
      budget: 90,
      deadlineMs: 1500, // room for two one-second batches, not three
      now: () => clock,
    });
    assert.equal(calls, 2, "a third batch would have started after the deadline");
    assert.equal(done, 60);
    assert.equal(cache.size, 60, "what was translated is kept");
  } finally {
    globalThis.fetch = realFetch;
    console.log = realLog;
  }
});
