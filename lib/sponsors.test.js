import { test } from "node:test";
import assert from "node:assert/strict";
import { selectSponsors, mergeSponsors, describeSponsors, PLACEMENTS } from "./sponsors.js";

const house = {
  id: "sol-tek",
  house: true,
  placements: ["top", "primary", "footer"],
  title: "Sol-Tek",
  linkText: "sol-tek.us",
  url: "https://sol-tek.us/",
};
const data = (campaigns) => ({ house: "sol-tek", campaigns });
const paid = (id, over = {}) => ({
  id,
  placements: ["primary"],
  title: `${id} headline`,
  url: `https://${id}.example/`,
  ...over,
});

// ── the house ad ─────────────────────────────────────────────────────────────

test("an unsold placement runs the house ad rather than sitting empty", () => {
  const s = selectSponsors(data([house]), "2026-09-01");
  for (const p of PLACEMENTS) {
    assert.equal(s[p].title, "Sol-Tek", `${p} should fall back to the house ad`);
    assert.equal(s[p].house, true);
  }
});

test("a sold placement displaces the house ad, and only that placement", () => {
  const s = selectSponsors(data([house, paid("acme")]), "2026-09-01");
  assert.equal(s.primary.title, "acme headline");
  assert.equal(s.primary.house, false);
  assert.equal(s.top.title, "Sol-Tek", "top was not sold, so the house ad still runs");
  assert.equal(s.footer.title, "Sol-Tek");
});

test("a draft campaign never reaches the newsletter", () => {
  const s = selectSponsors(data([house, paid("acme", { draft: true })]), "2026-09-01");
  assert.equal(s.primary.title, "Sol-Tek", "the draft is ignored and the house ad runs");
});

test("a house ad with no title yields nothing rather than an empty box", () => {
  const s = selectSponsors(data([{ ...house, title: "" }]), "2026-09-01");
  assert.equal(s.top, null);
  assert.equal(s.primary, null);
});

// ── scheduling ───────────────────────────────────────────────────────────────

test("a campaign runs on its start and end dates and not outside them", () => {
  const d = data([house, paid("acme", { start: "2026-09-10", end: "2026-09-12" })]);
  assert.equal(selectSponsors(d, "2026-09-09").primary.title, "Sol-Tek", "not yet");
  assert.equal(selectSponsors(d, "2026-09-10").primary.title, "acme headline", "first day, inclusive");
  assert.equal(selectSponsors(d, "2026-09-12").primary.title, "acme headline", "last day, inclusive");
  assert.equal(selectSponsors(d, "2026-09-13").primary.title, "Sol-Tek", "expired");
});

test("a campaign with no dates is always on", () => {
  const d = data([house, paid("acme")]);
  assert.equal(selectSponsors(d, "2027-01-01").primary.title, "acme headline");
});

test("an open-ended campaign honours the bound it does have", () => {
  const d = data([house, paid("acme", { start: "2026-09-10" })]);
  assert.equal(selectSponsors(d, "2026-09-09").primary.title, "Sol-Tek");
  assert.equal(selectSponsors(d, "2030-01-01").primary.title, "acme headline");
});

// ── rotation ─────────────────────────────────────────────────────────────────

test("two sponsors on one placement alternate by day instead of one taking the run", () => {
  const d = data([house, paid("acme"), paid("globex")]);
  const seen = new Set();
  for (const day of ["2026-09-01", "2026-09-02", "2026-09-03", "2026-09-04"]) {
    seen.add(selectSponsors(d, day).primary.id);
  }
  assert.deepEqual([...seen].sort(), ["acme", "globex"], "both ran across four days");
});

test("the pick is stable within a single day", () => {
  const d = data([house, paid("acme"), paid("globex")]);
  const a = selectSponsors(d, "2026-09-01").primary.id;
  const b = selectSponsors(d, "2026-09-01").primary.id;
  assert.equal(a, b, "two renders of the same day's email must not disagree");
});

// ── link tagging ─────────────────────────────────────────────────────────────

test("sponsor links carry attribution the sponsor can verify themselves", () => {
  const u = new URL(selectSponsors(data([house, paid("acme")]), "2026-09-01").primary.url);
  assert.equal(u.searchParams.get("utm_source"), "nexus");
  assert.equal(u.searchParams.get("utm_medium"), "email");
  assert.equal(u.searchParams.get("utm_campaign"), "acme");
  assert.equal(u.searchParams.get("utm_content"), "primary");
});

test("tagging preserves a link that already has query parameters", () => {
  const c = paid("acme", { url: "https://acme.example/landing?ref=x" });
  const u = new URL(selectSponsors(data([house, c]), "2026-09-01").primary.url);
  assert.equal(u.searchParams.get("ref"), "x", "the sponsor's own parameters survive");
  assert.equal(u.searchParams.get("utm_campaign"), "acme");
});

test("the same campaign is tagged per placement, so slots are distinguishable", () => {
  const c = paid("acme", { placements: ["top", "footer"] });
  const s = selectSponsors(data([house, c]), "2026-09-01");
  assert.equal(new URL(s.top.url).searchParams.get("utm_content"), "top");
  assert.equal(new URL(s.footer.url).searchParams.get("utm_content"), "footer");
});

test("a malformed sponsor URL degrades instead of throwing", () => {
  const c = paid("acme", { url: "not a url" });
  assert.doesNotThrow(() => selectSponsors(data([house, c]), "2026-09-01"));
  assert.equal(selectSponsors(data([house, c]), "2026-09-01").primary.url, "not a url");
});

// ── Sponsy coexistence ───────────────────────────────────────────────────────

test("Sponsy fills a placement nobody bought locally", () => {
  const d = data([house]);
  const local = selectSponsors(d, "2026-09-01");
  const merged = mergeSponsors(local, { primary: { title: "From Sponsy" } }, d, "2026-09-01");
  assert.equal(merged.primary.title, "From Sponsy", "beats the house ad");
  assert.equal(merged.top.title, "Sol-Tek");
});

test("Sponsy never displaces a placement that was actually sold", () => {
  const d = data([house, paid("acme")]);
  const local = selectSponsors(d, "2026-09-01");
  const merged = mergeSponsors(local, { primary: { title: "From Sponsy" } }, d, "2026-09-01");
  assert.equal(merged.primary.title, "acme headline", "a paying sponsor outranks the old system");
});

test("no Sponsy result leaves the local selection untouched", () => {
  const d = data([house]);
  const local = selectSponsors(d, "2026-09-01");
  assert.deepEqual(mergeSponsors(local, null, d, "2026-09-01"), local);
});

// ── logging ──────────────────────────────────────────────────────────────────

test("the send log records which ad ran and whether it was house", () => {
  const s = selectSponsors(data([house, paid("acme")]), "2026-09-01");
  const line = describeSponsors(s);
  assert.equal(line, 'top="Sol-Tek" (house) primary="acme headline" footer="Sol-Tek" (house)');
  // Asserting the whole line rather than matching within it: a loose `.*`
  // pattern here happily ran from "primary=" into the footer's "(house)".
});

test("empty placements are shown as empty, not omitted", () => {
  assert.equal(describeSponsors(selectSponsors(data([]), "2026-09-01")), "top=— primary=— footer=—");
});
