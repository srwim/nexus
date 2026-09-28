// When a SCHEDULED newsletter run is allowed to mail. One definition, used by
// both scripts/build-brief.js and scripts/send-newsletter.mjs, because the two
// disagreeing is how a run builds a brief and then refuses to send it.
//
// The window used to be 4 to 8 AM Denver. GitHub's scheduler, though, fires one
// of the eight cron slots per day, three to five hours late: every run in the
// week of 21 Sep 2026 landed between 8:13 and 10:19 AM. The ones after 8:59
// exited in twenty seconds, reported success, and mailed nobody. The window
// meant to tolerate the scheduler's delays was the thing turning them into
// silent misses.
//
// So it now runs from 4 AM to 5:59 PM. A late brief is far better than none,
// and duplicates are impossible regardless: the send's per-recipient, per-day
// Idempotency-Key means only the first run of the Denver day mails anyone.
// The evening cutoff stays because a "daily brief" arriving at 11 PM reads as
// broken; after 6 PM the next morning's edition is the better one to wait for.
//
// Manual runs (workflow_dispatch, including the Cloudflare cron trigger) are
// never gated: whoever pressed the button meant it.
export const WINDOW = { startHour: 4, endHour: 17 }; // inclusive, Denver local

export function denverHour(now = new Date()) {
  return Number(
    new Intl.DateTimeFormat("en-US", { timeZone: "America/Denver", hour: "numeric", hourCycle: "h23" }).format(now)
  );
}

export function inSendWindow(now = new Date()) {
  const h = denverHour(now);
  return h >= WINDOW.startHour && h <= WINDOW.endHour;
}

// The line both scripts print when they skip, so the log says which rule fired.
export function skipMessage(now = new Date()) {
  const h = denverHour(now);
  return `Denver hour ${h} is outside the ${WINDOW.startHour} AM to ${WINDOW.endHour - 12}:59 PM send window: skipping this slot.`;
}
