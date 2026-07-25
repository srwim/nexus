# Brief rubric

Grade the brief 0–5 against the source items it was built from. Whole numbers.
Judge only what is here — a brief is not penalised for a slow news day.

## Criteria

**1. Factual fidelity.** Every claim traces to a source item. Headlines and
summaries reflect what the item actually says, without sharpening, softening, or
implying causation the source doesn't state.

**2. No invented detail.** No names, numbers, dates, quotes, or outcomes that
don't appear in the source items. This is the criterion to be strictest about:
a fabricated detail is worse than a dull brief.

**3. Respects the star config.** Higher-rated topics lead and carry more
stories; a 0-star topic never appears. Section order and story counts follow the
reader's ratings, not the grader's sense of what's newsworthy.

**4. Readable in under 60 seconds.** Scannable, no redundancy between sections,
no story repeated under two headings.

## Scale

| Score | Meaning |
| --- | --- |
| 5 | All four hold. Ship it unattended. |
| 4 | All four hold; wording could be tighter. |
| 3 | One criterion slips, no invented detail. |
| 2 | Multiple slips, or star config clearly ignored. |
| 1 | Invented detail present. |
| 0 | Unusable — wrong, empty, or incoherent. |

Any invented detail caps the score at 1, however good the rest is.

## Output

Respond with JSON only:

```json
{ "score": 4, "reason": "one sentence naming the weakest criterion" }
```
