import { test } from "node:test";
import assert from "node:assert/strict";
import { inSendWindow, denverHour, skipMessage, WINDOW } from "./sendWindow.js";

// Real timestamps. Denver is UTC-6 in daylight time (Mar to Nov), UTC-7 in winter.
const at = (iso) => new Date(iso);

test("the runs that silently mailed nobody would now send", () => {
  // Every one of these was a real scheduled run that exited early under the
  // old 4 to 8 AM window, reported success, and sent nothing.
  for (const iso of [
    "2026-09-27T15:01:46Z", // 9:01 AM MDT
    "2026-09-25T15:03:40Z", // 9:03 AM MDT
    "2026-09-21T16:19:31Z", // 10:19 AM MDT
  ]) {
    assert.equal(inSendWindow(at(iso)), true, `${iso} must be inside the window`);
  }
});

test("the runs that did send still send", () => {
  for (const iso of ["2026-09-26T14:13:48Z", "2026-09-24T14:43:01Z", "2026-09-22T14:29:05Z"]) {
    assert.equal(inSendWindow(at(iso)), true, iso);
  }
});

test("4:15 AM Denver is inside the window in both summer and winter", () => {
  assert.equal(denverHour(at("2026-07-01T10:15:00Z")), 4, "10:15 UTC is 4:15 MDT");
  assert.equal(inSendWindow(at("2026-07-01T10:15:00Z")), true);
  assert.equal(denverHour(at("2026-01-15T11:15:00Z")), 4, "11:15 UTC is 4:15 MST");
  assert.equal(inSendWindow(at("2026-01-15T11:15:00Z")), true);
});

test("nothing goes out before 4 AM", () => {
  assert.equal(inSendWindow(at("2026-01-15T10:15:00Z")), false, "10:15 UTC in winter is 3:15 AM");
  assert.equal(inSendWindow(at("2026-09-27T09:59:00Z")), false, "3:59 AM MDT");
});

test("nor after 5:59 PM, when tomorrow's edition is the better one to wait for", () => {
  assert.equal(inSendWindow(at("2026-09-27T23:59:00Z")), true, "5:59 PM MDT is the last minute");
  assert.equal(inSendWindow(at("2026-09-28T00:00:00Z")), false, "6:00 PM MDT");
  assert.equal(inSendWindow(at("2026-09-28T05:30:00Z")), false, "11:30 PM MDT");
});

test("midnight reads as hour 0, not 24", () => {
  // Intl with hour12:false renders midnight as "24" in some engines; the old
  // inline guards used it. hourCycle h23 is the unambiguous form.
  assert.equal(denverHour(at("2026-09-27T06:00:00Z")), 0);
});

test("the window is the one both scripts import, and the log line names it", () => {
  assert.deepEqual(WINDOW, { startHour: 4, endHour: 17 });
  assert.match(skipMessage(at("2026-09-28T02:00:00Z")), /Denver hour 20 is outside the 4 AM to 5:59 PM send window/);
});
