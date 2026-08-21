"use client";
// The one way a static site can write to HubSpot: the Forms API is built for
// browser submission and takes no secret. Same endpoint the signup box has
// always used — it now also carries the reader's settings.
import config from "../nexus.config.json";
import { encodePrefs } from "./prefsPayload.js";

// HubSpot rejects a whole submission if it contains a field the form doesn't
// define. Sending settings must therefore never be able to break signing up, so
// a rejection retries with just the identity fields.
export async function submitSubscription({ email, name, prefs }) {
  const hs = config.hubspot || {};
  if (!hs.portalId || !hs.formId) return { ok: false, prefsSaved: false };
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
      return res.ok;
    } catch {
      return false;
    }
  };

  if (await post(withPrefs)) return { ok: true, prefsSaved: !!prefs };
  if (withPrefs === identity) return { ok: false, prefsSaved: false };
  // Settings fields aren't on the form yet — still get them subscribed.
  return { ok: await post(identity), prefsSaved: false };
}
