import { test } from "node:test";
import assert from "node:assert/strict";
import { mergeRecipients } from "./recipients.js";

const emails = (r) => r.recipients.map((p) => p.email).sort();

test("the configured address is mailed when HubSpot has nothing", () => {
  const r = mergeRecipients({ configTo: "me@example.com" });
  assert.deepEqual(emails(r), ["me@example.com"]);
  assert.equal(r.recipients[0].theme, null, "no list entry means no theme of its own");
});

test("a list entry replaces the config entry, keeping its theme and prefs", () => {
  const r = mergeRecipients({
    configTo: "me@example.com",
    listed: [{ email: "me@example.com", theme: "dark", prefs: { leagues: ["f1"] } }],
  });
  assert.equal(r.recipients.length, 1, "same person, not two");
  assert.equal(r.recipients[0].theme, "dark");
  assert.deepEqual(r.recipients[0].prefs.leagues, ["f1"]);
});

// The regression. An address in BOTH newsletter.to and the dropped set was
// being resurrected by the config entry: mailed after opt-out verification had
// excluded it, and mailed with theme: null instead of its own settings.
test("a verification drop beats the newsletter.to seed", () => {
  const r = mergeRecipients({
    configTo: "me@example.com",
    listed: [],
    dropped: ["me@example.com"],
  });
  assert.deepEqual(r.recipients, [], "must not be resurrected by the config entry");
  assert.deepEqual(r.resurrected, ["me@example.com"], "and the caller is told it happened");
});

test("a verification drop beats a list entry too", () => {
  const r = mergeRecipients({
    listed: [{ email: "reader@example.com", theme: "dark" }],
    dropped: ["reader@example.com"],
  });
  assert.deepEqual(r.recipients, []);
  assert.deepEqual(r.resurrected, [], "nothing was resurrected — it was never seeded from config");
});

test("SUPPRESS_EMAILS wins over everything, including a live list entry", () => {
  const r = mergeRecipients({
    configTo: "me@example.com",
    listed: [{ email: "reader@example.com", theme: "dark" }],
    suppressed: ["reader@example.com", "me@example.com"],
  });
  assert.deepEqual(r.recipients, []);
});

test("matching is case- and whitespace-insensitive", () => {
  const r = mergeRecipients({
    configTo: "Me@Example.com",
    listed: [{ email: "ME@EXAMPLE.COM", theme: "dark" }],
    dropped: ["  me@example.com  "],
  });
  assert.deepEqual(r.recipients, [], "the same address written three ways is one person");
  assert.deepEqual(r.resurrected, ["me@example.com"]);
});

test("an empty HubSpot answer leaves the config address alone", () => {
  // hubspotRecipients() returns empty on every failure path, and a failure to
  // reach HubSpot must not be read as "everyone opted out".
  const r = mergeRecipients({ configTo: "me@example.com", listed: [], dropped: [] });
  assert.deepEqual(emails(r), ["me@example.com"]);
});

test("list entries are kept distinct from the config address", () => {
  const r = mergeRecipients({
    configTo: "me@example.com",
    listed: [{ email: "a@example.com" }, { email: "b@example.com" }],
  });
  assert.deepEqual(emails(r), ["a@example.com", "b@example.com", "me@example.com"]);
});

test("junk input never throws", () => {
  assert.deepEqual(mergeRecipients().recipients, []);
  assert.deepEqual(mergeRecipients({ configTo: "" }).recipients, []);
  assert.deepEqual(mergeRecipients({ listed: [{}, { email: null }] }).recipients, []);
});
