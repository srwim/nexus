import { test } from "node:test";
import assert from "node:assert/strict";
import { decide, AUTO, REVIEW, THRESHOLD } from "./gate.js";

// This is the most safety-critical logic in the repo: it decides whether mail
// goes out without a human. Every branch that could wrongly return AUTO is
// covered — a false REVIEW costs a click, a false AUTO sends a bad brief.

test("clean suite at or above threshold sends unattended", () => {
  assert.equal(decide({ score: THRESHOLD, violations: 0, cases: 3 }), AUTO);
  assert.equal(decide({ score: THRESHOLD + 1, violations: 0, cases: 1 }), AUTO);
});

test("a single must-exclude violation forces review, however good the score", () => {
  assert.equal(decide({ score: 5, violations: 1, cases: 3 }), REVIEW);
});

test("an unscored brief never sends itself", () => {
  assert.equal(decide({ score: null, violations: 0, cases: 3 }), REVIEW);
});

test("a score below threshold forces review", () => {
  assert.equal(decide({ score: THRESHOLD - 0.1, violations: 0, cases: 3 }), REVIEW);
});

test("no labeled cases means no evidence, so review", () => {
  assert.equal(decide({ score: 5, violations: 0, cases: 0 }), REVIEW);
});

test("missing or malformed signals default to review, never to auto", () => {
  assert.equal(decide(), REVIEW, "no argument at all");
  assert.equal(decide({}), REVIEW, "empty object");
  assert.equal(decide({ cases: 3 }), REVIEW, "cases but no score");
});
