// The exact words a subscriber agreed to, in one place.
//
// This is the point of the module: under GDPR you must be able to show not just
// THAT someone consented but WHAT they consented to. If the wording lived
// inline in two components it could drift between them, and a record pointing
// at text that no longer exists is not a record.
//
// Change the text and you must bump CONSENT_VERSION in the same edit. Existing
// records keep their old version string, so an audit can reconstruct what any
// given subscriber actually saw. A ".N" suffix distinguishes revisions made on
// the same day.
//
// ponytail: a constant, not a versioned document store. Sufficient while the
// text changes once a year; revisit if consent language starts moving often.
//
// .2 named the legal entity behind the AROK AI brand. Consent has to identify
// the actual data controller, and "AROK AI" alone is a trade name.
export const CONSENT_VERSION = "2026-08-21.2";

// The checkbox label. Affirmative, specific, and naming the controller — the
// three things a consent statement has to do.
//
// Written as a literal, never interpolated from config: the whole point of the
// record is that the stored words are fixed, and a value assembled at runtime
// could change without anyone bumping the version.
export const CONSENT_TEXT =
  "I agree that AROK AI (Consolidated Technologies LLC) may store my email address and send me " +
  "the NEXUS Daily Brief. I can withdraw this consent at any time using the unsubscribe link in any email.";

// Shown under the checkbox. Not part of what is agreed to; it explains the
// mechanics, which is what stops the checkbox reading as a dark pattern.
export const CONSENT_NOTICE =
  "One email a day. We never sell or share your address, and every email carries " +
  "a one-click unsubscribe link.";

// A consent record, stamped at the moment the box was ticked.
export function consentRecord(now = new Date()) {
  return { version: CONSENT_VERSION, text: CONSENT_TEXT, at: now.toISOString() };
}
