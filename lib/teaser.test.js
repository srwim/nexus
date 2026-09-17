import { test } from "node:test";
import assert from "node:assert/strict";
import { buildTeaser, cleanHeadline } from "./teaser.js";

test("a headline that fits is passed through, with a period added", () => {
  assert.equal(cleanHeadline("Fed raises interest rates"), "Fed raises interest rates.");
});

test("existing terminal punctuation is not doubled", () => {
  assert.equal(cleanHeadline("Is the Fed done hiking?"), "Is the Fed done hiking?");
  assert.equal(cleanHeadline("It's over."), "It's over.");
});

test("a trailing ' - Publisher' tail is stripped", () => {
  assert.equal(cleanHeadline("Bitcoin holds $76,000 - CoinDesk"), "Bitcoin holds $76,000.");
});

// The regression this file exists for. Cutting a long headline at a word
// boundary and appending a period produced a grammatical sentence that made a
// claim the headline never made.
test("a long headline with no clause break is left whole, never truncated mid-claim", () => {
  const title = "D.C. airspace is complicated. Experts say Trump's arch would add one more risk";
  const out = cleanHeadline(title);
  assert.equal(out, `${title}.`, "no natural break inside the cap, so nothing is cut");
  assert.ok(!/would\.$/.test(out), "must not amputate the claim and call it a sentence");
});

test("another real case: the headline keeps its object", () => {
  const out = cleanHeadline("OpenAI flags 6 new incidents of 'concerning' behavior and unveils plan to track it");
  assert.ok(out.endsWith("track it."), `expected the full headline, got ${out}`);
});

test("a long headline IS cut at a natural clause break", () => {
  const out = cleanHeadline("Trump threatens EU with serious tariffs, after proposal to make Canada an associate member");
  assert.equal(out, "Trump threatens EU with serious tariffs.");
});

test("a break too early in the line is ignored rather than leaving a stub", () => {
  const out = cleanHeadline("Japan: the prime minister rearranges her government while retaining top ministers");
  assert.ok(out.length > 24, "a 6-character stub is not a teaser");
  assert.ok(out.startsWith("Japan:"), `expected the whole headline, got ${out}`);
});

test("empty and missing input never throws", () => {
  assert.equal(cleanHeadline(""), ".");
  assert.equal(cleanHeadline(undefined), ".");
});

test("buildTeaser takes the lead story from the first sections and skips weather", () => {
  const sections = [
    { type: "news", items: [{ title: "First story", link: "a" }, { title: "ignored", link: "x" }] },
    { type: "weather", weather: {} },
    { type: "news", items: [] }, // an empty section contributes nothing
    { type: "news", items: [{ title: "Second story", link: "b" }] },
    { type: "news", items: [{ title: "Third story", link: "c" }] },
    { type: "news", items: [{ title: "Fourth story", link: "d" }] },
  ];
  assert.deepEqual(buildTeaser(sections), [
    { title: "First story.", link: "a" },
    { title: "Second story.", link: "b" },
    { title: "Third story.", link: "c" },
  ]);
});

test("buildTeaser on no usable sections returns nothing rather than throwing", () => {
  assert.deepEqual(buildTeaser([]), []);
  assert.deepEqual(buildTeaser(undefined), []);
  assert.deepEqual(buildTeaser([{ type: "news", items: [{ link: "a" }] }]), [], "an item with no title is skipped");
});
