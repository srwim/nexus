"use client";
// The one way a static site can write to HubSpot: the Forms API is built for
// browser submission and takes no secret. Same endpoint the signup box has
// always used — it now also carries the reader's settings.
import config from "../nexus.config.json";
import { encodePrefs } from "./prefsPayload.js";

// HubSpot rejects a whole submission if it contains a field the form doesn't
// define. Sending settings must therefore never be able to break signing up, so
// a rejection retries with just the identity fields.
//
// Returns { ok, prefsSaved, error } — `error` is HubSpot's own message, not a
// paraphrase. A generic "that didn't go through" is useless to whoever has to
// fix the form, and HubSpot's messages name the offending field directly.
export async function submitSubscription({ email, name, prefs }) {
  const hs = config.hubspot || {};
  if (!hs.portalId || !hs.formId) {
    return { ok: false, prefsSaved: false, error: "No HubSpot portalId/formId in nexus.config.json" };
  }
  const url = `https://api.hsforms.com/submissions/v3/integration/submit/${hs.portalId}/${hs.formId}`;

  const identity = [{ objectTypeId: "0-1", name: "email", value: email }];
  if (name?.trim()) identity.push({ objectTypeId: "0-1", name: "firstname", value: name.trim() });

  const withPrefs = prefs
    ? [
        ...identity,
        { objectTypeId: "0-1", name: "nexus_prefs", value: encodePrefs(prefs) },
        { objectTypeId: "0-1", name: "nexus_theme", value: prefs.theme === "dark" ? "dark" : "light" },
      ]
    : identity;

  const post = async (fields) => {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fields, context: { pageUri: window.location.href, pageName: "NEXUS" } }),
      });
      if (res.ok) return { ok: true };
      // HubSpot replies with JSON naming the field it objected to.
      let detail = `HTTP ${res.status}`;
      try {
        const body = await res.json();
        detail = body?.errors?.[0]?.message || body?.message || detail;
      } catch {
        /* non-JSON error body — the status is all we get */
      }
      return { ok: false, error: detail };
    } catch (e) {
      // A throw here is the network or CORS, not HubSpot.
      return { ok: false, error: `Could not reach HubSpot (${e?.message || "network error"})` };
    }
  };

  const full = await post(withPrefs);
  if (full.ok) return { ok: true, prefsSaved: !!prefs, error: null };
  if (withPrefs === identity) return { ok: false, prefsSaved: false, error: full.error };

  // Settings fields aren't on the form yet — still get them subscribed.
  const basic = await post(identity);
  if (basic.ok) return { ok: true, prefsSaved: false, error: full.error };
  return { ok: false, prefsSaved: false, error: basic.error };
}
