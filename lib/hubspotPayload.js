// Builds the HubSpot Forms API body. Pure — no config import, no network — so
// the consent record, which is the part that has to stand up to an audit, can
// be tested directly.
import { encodePrefs } from "./prefsPayload.js";

// `legalConsentOptions` is HubSpot's own consent mechanism: it writes the agreed
// text and a timestamp into the contact's consent history. That history is what
// "demonstrate consent" means in practice — a boolean stored on our side proves
// nothing about what the person actually saw.
export function buildSubmissionBody({ email, name, prefs, consent, pageUri, subscriptionTypeId }) {
  const fields = [{ objectTypeId: "0-1", name: "email", value: email }];
  if (name?.trim()) fields.push({ objectTypeId: "0-1", name: "firstname", value: name.trim() });
  if (prefs) {
    fields.push({ objectTypeId: "0-1", name: "nexus_prefs", value: encodePrefs(prefs) });
    fields.push({ objectTypeId: "0-1", name: "nexus_theme", value: prefs.theme === "dark" ? "dark" : "light" });
  }

  const body = { fields, context: { pageUri, pageName: "NEXUS" } };

  if (consent) {
    body.legalConsentOptions = {
      consent: {
        consentToProcess: true,
        text: consent.text,
        // HubSpot rejects the whole submission if a subscriptionTypeId is
        // present but not valid for the portal, so an unconfigured one drops
        // the entry rather than shipping a broken reference.
        communications: subscriptionTypeId
          ? [{ value: true, subscriptionTypeId, text: consent.text }]
          : [],
      },
    };
  }
  return body;
}
