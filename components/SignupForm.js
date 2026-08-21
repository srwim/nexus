"use client";
// Public newsletter signup. Posts straight to HubSpot's Forms API (built for
// browser submission, no secrets involved). Renders nothing until hubspot
// portalId/formId are set in nexus.config.json.
import { useState } from "react";
import config from "../nexus.config.json";
import { loadPrefs, savePrefs } from "../lib/usePrefs";
import { submitSubscription } from "../lib/hubspotForm";

export function SignupForm() {
  const hs = config.hubspot || {};
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [status, setStatus] = useState("idle"); // idle | sending | done | error

  if (!hs.portalId || !hs.formId) return null;

  // Signing up carries the reader's current settings with it, so their first
  // brief already matches the site they were just reading — rather than the
  // publication default until they remember to sync.
  //
  // Read at submit time, not through usePrefs: this form also renders on the
  // Settings page, where a hook copy taken at mount would send whatever the
  // ratings were before the reader started changing them.
  const submit = async (e) => {
    e.preventDefault();
    if (!/.+@.+\..+/.test(email)) return;
    setStatus("sending");
    const prefs = loadPrefs();
    const { ok } = await submitSubscription({ email, name, prefs });
    if (ok) savePrefs({ ...prefs, email });
    setStatus(ok ? "done" : "error");
  };

  if (status === "done") {
    return (
      <div className="card" style={{ textAlign: "center" }}>
        <b style={{ color: "var(--accent)" }}>You&apos;re in.</b>
        <div style={{ color: "var(--muted)", fontSize: 13, marginTop: 6 }}>
          The Daily Brief lands in your inbox each morning.
        </div>
      </div>
    );
  }

  return (
    <div className="card">
      <div className="section-head"><h2>✉️ Get the Daily Brief by email</h2></div>
      <form onSubmit={submit} style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 12 }}>
        <input
          type="text"
          placeholder="First name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          style={{ flex: "1 1 140px" }}
        />
        <input
          type="email"
          required
          placeholder="you@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          style={{ flex: "1 1 200px" }}
        />
        <button className="btn" disabled={status === "sending"}>
          {status === "sending" ? "Signing you up…" : "Subscribe free"}
        </button>
      </form>
      {status === "error" ? (
        <div style={{ color: "var(--danger)", fontSize: 13, marginTop: 8 }}>
          That didn&apos;t go through — try again in a moment.
        </div>
      ) : (
        <div style={{ color: "var(--muted)", fontSize: 12, marginTop: 8 }}>
          One email a day. Unsubscribe anytime.
        </div>
      )}
    </div>
  );
}
