import { test } from "node:test";
import assert from "node:assert/strict";
import { OUTLETS, LEAN_ORDER, LEAN_LABELS, outletFor, sourceLabel, CHECKED } from "./sources.js";

const at = (url) => ({ link: url, source: "Test" });

// ── resolution ───────────────────────────────────────────────────────────────

test("the outlet is resolved from the link, www and all", () => {
  assert.equal(outletFor(at("https://www.theguardian.com/world/x")).owner, "Scott Trust");
  assert.equal(outletFor(at("https://theguardian.com/world/x")).owner, "Scott Trust");
});

test("subdomains resolve to their parent without an entry each", () => {
  // These are real link shapes from the sports feeds.
  assert.equal(outletFor(at("https://profootballtalk.nbcsports.com/a")).owner, "Comcast");
  assert.equal(outletFor(at("https://sports.yahoo.com/nfl/a")).owner, "Yahoo");
  assert.equal(outletFor(at("https://golfweek.usatoday.com/a")).owner, "Gannett");
});

test("an outlet we haven't rated shows nothing at all", () => {
  assert.equal(outletFor(at("https://some-blog.example/a")), null);
  assert.equal(sourceLabel(at("https://some-blog.example/a")), null);
  assert.equal(sourceLabel({ source: "No link at all" }), null);
});

test("walking up the hostname can't fall off the end", () => {
  assert.doesNotThrow(() => outletFor(at("https://localhost/a")));
  assert.equal(outletFor(at("https://localhost/a")), null);
  assert.equal(outletFor({ link: "not a url", source: "x" }), null);
});

// ── the label the reader sees ────────────────────────────────────────────────

test("a rated outlet reports owner, lean and a scale position", () => {
  const l = sourceLabel(at("https://www.npr.org/2026/08/20/x"));
  assert.equal(l.owner, "Nonprofit");
  assert.equal(l.leanLabel, "Lean left");
  assert.equal(l.leanIndex, LEAN_ORDER.indexOf("lean-left"));
  assert.match(l.title, /Political lean: Lean left/);
  assert.match(l.title, new RegExp(CHECKED), "the reader can see how fresh the rating is");
});

test("ownership alone is enough to earn a label", () => {
  const l = sourceLabel(at("https://www.polygon.com/a"));
  assert.equal(l.owner, "Valnet");
  assert.equal(l.leanLabel, null, "a gaming site gets no political score");
  assert.equal(l.leanIndex, -1);
});

test("an entry with neither fact shows nothing rather than an empty chip", () => {
  assert.equal(OUTLETS["crash.net"].lean, undefined);
  assert.equal(OUTLETS["crash.net"].owner, undefined);
  assert.equal(sourceLabel(at("https://www.crash.net/motogp/a")), null);
});

// ── editorial guardrails ─────────────────────────────────────────────────────

test("every lean is one of the five published steps", () => {
  for (const [host, o] of Object.entries(OUTLETS)) {
    if (o.lean === undefined) continue;
    assert.ok(LEAN_ORDER.includes(o.lean), `${host}: "${o.lean}" is not a rating step`);
    assert.ok(LEAN_LABELS[o.lean], `${host}: no label for ${o.lean}`);
  }
});

test("a lean always maps to a real position on the scale", () => {
  for (const lean of LEAN_ORDER) {
    const i = LEAN_ORDER.indexOf(lean);
    assert.ok(i >= 0 && i < 5, `${lean} must sit on the five-step ruler`);
  }
});

test("no political lean is asserted for outlets that don't do politics", () => {
  // Sports, gaming and crypto get ownership only. A "Lean left" on a MotoGP
  // report is noise, and worse, it's a claim nobody rated.
  const apolitical = [
    "espn.com",
    "polygon.com",
    "kotaku.com",
    "motorsport.com",
    "autosport.com",
    "coindesk.com",
    "gamespot.com",
    "skysports.com",
  ];
  for (const host of apolitical) {
    assert.equal(OUTLETS[host]?.lean, undefined, `${host} must not carry a political rating`);
  }
});

test("owner strings stay short enough to sit on one metadata line", () => {
  for (const [host, o] of Object.entries(OUTLETS)) {
    if (!o.owner) continue;
    assert.ok(o.owner.length <= 22, `${host}: "${o.owner}" will wrap the meta row`);
  }
});

test("the rating table is dated, so a stale label is visible as stale", () => {
  assert.match(CHECKED, /^\d{4}-\d{2}$/);
});
