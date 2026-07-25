# Evals

The daily brief selects ~28 stories from ~300 and decides what a reader sees.
These evals measure that selection, and gate the send on the result.

## The three metrics

| Metric | Type | Gates? |
| --- | --- | --- |
| Must-include recall | deterministic | reported only |
| Must-exclude violations | deterministic | **hard fail** |
| Rubric score (0–5) | model-graded | threshold |

**Must-include recall** — share of items labeled essential that survived
selection. Reported, not gated: a miss is a judgment call worth reviewing, not
proof of a bug.

**Must-exclude violations** — items labeled off-topic, spam, or duplicate that
reached the brief. Any violation is disqualifying. This is the only hard
failure, because it is the only metric where the correct value is knowably zero.

**Rubric score** — a second model call grading the brief against
[`rubric.md`](../evals/rubric.md): factual fidelity to the source items, no
invented detail, respects the star config, readable in under 60 seconds.

### Why three and not four

Each metric answers a question the others can't: *did we keep what matters*
(recall), *did we let through what must never appear* (violations), *is the
result any good* (rubric). A fourth would overlap one of those, and every metric
added is one more thing to keep honest. Coverage, safety, quality — that is the
whole surface.

## Running them

```bash
npm test                      # unit tests: ranking + scorer + gate
npm run evals                 # deterministic metrics only — free, no API key
node evals/run.js             # also attempts the rubric metric
node evals/run.js --gate      # send-vs-review verdict for the daily workflow
```

`--no-rubric` (what `npm run evals` uses) needs no network and no key, so the
deterministic metrics can be iterated on for free. Only the rubric costs money.

Exit codes differ by mode on purpose:

- `--no-rubric` exits **non-zero** on any violation — a bad change fails the PR.
- `--gate` always exits **zero** and reports its verdict through
  `$GITHUB_OUTPUT` — a broken eval must route the brief to a human, never
  silently cancel the day's newsletter.

Results are written to `evals/results/<git-sha>.json`.

## Cases

A case is a frozen `public/data` snapshot plus a star config plus hand labels:

```jsonc
{
  "id": "2026-07-25T18-38-52Z",
  "config": { "zip": "", "ratings": { "politics": 3, ... }, "leagues": [...] },
  "data":   { "politics": { "updatedAt": "...", "items": [...] }, ... },
  "labels": {
    "must_include": ["https://…"],   // links that MUST appear
    "must_exclude": ["https://…"]    // links that must NOT appear
  }
}
```

Items are identified by `link` — unique and stable across runs.

**Cases can only be captured live.** `public/data/` is gitignored and rewritten
every 30 minutes by the site build, so nothing is recoverable after the fact.
Run the **Capture eval case** workflow from the Actions tab; it commits an
unlabeled case. Add links to `must_include` / `must_exclude` by hand.

Every topic is captured regardless of its star rating, so one case can be
re-scored under a different star config later.

## What the evals actually run

`evals/run.js` calls `rankFromData()` from [`lib/rank.js`](../lib/rank.js) — the
same function the newsletter uses. Fetching lives in `publishedDigest.js`;
ranking lives in `rank.js`; the eval replays frozen data through it. An eval
score therefore describes the shipping code path, not a reimplementation of it.

## Current scores

No labeled cases yet. This table gets filled in as cases land.

| Date | Cases | Recall | Violations | Rubric |
| --- | --- | --- | --- | --- |
| — | 0 | — | — | not wired |

## Threshold changelog

The send/review threshold lives in one place: `THRESHOLD` in
[`evals/gate.js`](../evals/gate.js). Lower it only when eval history earns it,
and record the move here.

| Date | Threshold | Rationale |
| --- | --- | --- |
| 2026-07-25 | 5 | Initial. Everything gates; no rubric wired, so `score` is `null` and every brief routes to review by design. |

## Not wired yet

The rubric metric needs a model call and `ANTHROPIC_API_KEY`. Until then
`score` is `null`, and `decide()` routes every brief to review — autonomy is
earned by evidence, and there is none yet. Lowering `THRESHOLD` will not change
that; wiring the rubric will.
