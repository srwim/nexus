"use client";
// The one way a static site can write to HubSpot: the Forms API is built for
// browser submission and takes no secret. Same endpoint the signup box has
// always used — it now carries the reader's settings and their consent record.
import config from "../nexus.config.json";
import { consentRecord } from "./consent.js";
import { buildSubmissionBody } from "./hubspotPayload.js";

// Returns { ok, prefsSaved, consentSaved, error }. `error` is HubSpot's own
// message, not a paraphrase — their errors name the offending field, and a
// generic failure string is useless to whoever has to fix the form.
export async function submitSubscription({ email, name, prefs, consented }) {
  const hs = config.hubspot || {};
  if (!hs.portalId || !hs.formId) {
    return { ok: false, prefsSaved: false, consentSaved: false, error: "No HubSpot portalId/formId in nexus.config.json" };
  }
  if (!consented) {
    return { ok: false, prefsSaved: false, consentSaved: false, error: "Consent was not given" };
  }
  const url = `https://api.hsforms.com/submissions/v3/integration/submit/${hs.portalId}/${hs.formId}`;
  const consent = consentRecord();
  const pageUri = typeof window !== "undefined" ? window.location.href : "";

  const post = async (body) => {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (res.ok) return { ok: true };
      let detail = `HTTP ${res.status}`;
      try {
        const parsed = await res.json();
        detail = parsed?.errors?.[0]?.message || parsed?.message || detail;
      } catch {
        /* non-JSON error body — the status is all we get */
      }
      return { ok: false, error: detail };
    } catch (e) {
      return { ok: false, error: `Could not reach HubSpot (${e?.message || "network error"})` };
    }
  };

  // Degrade one capability at a time rather than all-or-nothing, so a form
  // that is missing the settings fields still subscribes the reader — and,
  // importantly, still records their consent.
  const subscriptionTypeId = hs.subscriptionTypeId;
  const make = (opts) => buildSubmissionBody({ email, name, pageUri, subscriptionTypeId, ...opts });
  const rungs = [
    { body: make({ prefs, consent }), prefsSaved: !!prefs, consentSaved: true },
    { body: make({ consent }), prefsSaved: false, consentSaved: true },
    { body: make({}), prefsSaved: false, consentSaved: false },
  ];

  let firstError = null;
  for (const rung of rungs) {
    const res = await post(rung.body);
    if (res.ok) {
      const reconfirmChecked = await checkReturning(email);
      return {
        ok: true,
        prefsSaved: rung.prefsSaved,
        consentSaved: rung.consentSaved,
        reconfirmChecked,
        error: firstError,
      };
    }
    firstError = firstError || res.error;
  }
  return { ok: false, prefsSaved: false, consentSaved: false, reconfirmChecked: false, error: firstError };
}

// A reader who unsubscribed in the past and signs up again stays unsubscribed
// in HubSpot: the new consent doesn't override the old opt-out, and it
// shouldn't, because anyone could type their address into this form. The
// worker checks, and if the address had opted out it emails a confirmation
// link that only its owner can click. See /subscribe-intent in
// workers/local-news-proxy.js.
//
// The worker answers the same way whether or not a link was sent, so this
// returns whether the check ran, not what it found. Sent as text/plain so the
// browser makes a simple request with no preflight.
async function checkReturning(email) {
  const proxy = String(config.localNewsProxy || "").replace(/\/+$/, "");
  if (!proxy) return false;
  try {
    const res = await fetch(`${proxy}/subscribe-intent`, {
      method: "POST",
      headers: { "Content-Type": "text/plain" },
      body: JSON.stringify({ email }),
    });
    return res.ok;
  } catch {
    return false; // the signup itself already succeeded; never fail it on this
  }
}
