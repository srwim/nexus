import { test } from "node:test";
import assert from "node:assert/strict";
import { CONSENT_TEXT, CONSENT_VERSION, CONSENT_NOTICE, consentRecord } from "./consent.js";
import { buildSubmissionBody } from "./hubspotPayload.js";

const consent = consentRecord(new Date("2026-08-21T15:04:05.000Z"));

// ── the statement itself ─────────────────────────────────────────────────────

test("the consent statement names the controller, the purpose and the exit", () => {
  assert.match(CONSENT_TEXT, /AROK AI/, "who is processing the data");
  assert.match(CONSENT_TEXT, /email address/, "what data");
  assert.match(CONSENT_TEXT, /Daily Brief/, "what they will receive");
  assert.match(CONSENT_TEXT, /withdraw/i, "that consent can be withdrawn");
  assert.match(CONSENT_TEXT, /unsubscribe/i, "and how");
});

test("it is phrased as an affirmative act, not a notice of what already happened", () => {
  assert.match(CONSENT_TEXT, /^I agree/, "first person opt-in, not 'by submitting you agree'");
  assert.ok(!/by submitting/i.test(CONSENT_TEXT), "implied consent is what this replaced");
});

test("the version is dated so a record can be tied to the words it was given under", () => {
  // Optional .N suffix for more than one revision in a day.
  assert.match(CONSENT_VERSION, /^\d{4}-\d{2}-\d{2}(\.\d+)?$/);
});

test("consent names the legal entity, not only the brand", () => {
  // "AROK AI" is a trade name; the controller people are consenting to is the
  // LLC, and it is the LLC's address that appears in every email footer.
  assert.match(CONSENT_TEXT, /Consolidated Technologies LLC/);
});

test("the notice explains mechanics without being part of the agreement", () => {
  assert.match(CONSENT_NOTICE, /unsubscribe/i);
  assert.ok(!/I agree/.test(CONSENT_NOTICE), "only the checkbox label is agreed to");
});

// ── the record ───────────────────────────────────────────────────────────────

test("a record captures the exact text, its version, and when it was given", () => {
  assert.equal(consent.text, CONSENT_TEXT, "the words as shown, not a summary");
  assert.equal(consent.version, CONSENT_VERSION);
  assert.equal(consent.at, "2026-08-21T15:04:05.000Z");
});

test("timestamps are UTC ISO, not a locale string", () => {
  assert.match(consentRecord().at, /^\d{4}-\d{2}-\d{2}T.*Z$/);
});

// ── what actually reaches HubSpot ────────────────────────────────────────────

const body = (over = {}) =>
  buildSubmissionBody({ email: "a@b.com", pageUri: "https://arok.ai/nexus/settings/", ...over });

test("consent travels in HubSpot's own consent mechanism, not a loose field", () => {
  const b = body({ consent });
  assert.equal(b.legalConsentOptions.consent.consentToProcess, true);
  assert.equal(b.legalConsentOptions.consent.text, CONSENT_TEXT, "the agreed words are what get stored");
});

test("no consent means no legalConsentOptions at all", () => {
  assert.equal(body().legalConsentOptions, undefined, "never assert consent that wasn't given");
});

test("an unconfigured subscription type drops the communications entry rather than sending a broken one", () => {
  // nexus.config.json has no hubspot.subscriptionTypeId, and HubSpot rejects
  // the whole submission if one is present but invalid.
  assert.deepEqual(body({ consent }).legalConsentOptions.consent.communications, []);
});

test("the email is always present and settings are optional", () => {
  const b = body({ consent });
  assert.deepEqual(b.fields.find((f) => f.name === "email"), {
    objectTypeId: "0-1",
    name: "email",
    value: "a@b.com",
  });
  assert.equal(b.fields.find((f) => f.name === "nexus_prefs"), undefined);
});

test("settings ride along when supplied, without disturbing the consent record", () => {
  const b = body({ consent, prefs: { theme: "dark", ratings: {}, leagues: ["f1"], countries: ["jp"] } });
  assert.ok(b.fields.find((f) => f.name === "nexus_prefs")?.value, "prefs are serialised");
  assert.equal(b.fields.find((f) => f.name === "nexus_theme").value, "dark");
  assert.equal(b.legalConsentOptions.consent.text, CONSENT_TEXT);
});

test("the page the consent was given on is recorded", () => {
  assert.equal(body({ consent }).context.pageUri, "https://arok.ai/nexus/settings/");
});
