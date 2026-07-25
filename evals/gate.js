// The autonomy policy — the one place the send/review decision is made.
//
// Autonomy is earned, not assumed: the brief sends itself only when the eval
// suite is clean AND the rubric clears the bar. Anything less routes to a human.
// Lower THRESHOLD as eval history earns it; log every change in docs/EVALS.md.
//
// ponytail: a single number, not a policy engine — a second dimension only
// earns its own field when there's a second dimension worth gating on.
export const THRESHOLD = 5;

export const AUTO = "auto"; // an environment with no reviewers: sends unattended
export const REVIEW = "digest-send"; // an environment gated on a required reviewer

// score: 0–5 rubric grade, or null when the rubric hasn't run.
// violations: must-exclude items that reached the brief. Any is disqualifying.
// cases: labeled cases the suite actually scored.
export function decide({ score = null, violations = 0, cases = 0 } = {}) {
  if (cases === 0) return REVIEW; // nothing proven yet
  if (violations > 0) return REVIEW; // hard failure
  if (score === null || score < THRESHOLD) return REVIEW; // unproven or below bar
  return AUTO;
}
