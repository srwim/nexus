"use client";
// Public newsletter signup. Posts straight to HubSpot's Forms API (built for
// browser submission, no secrets involved). Renders nothing until hubspot
// portalId/formId are set in nexus.config.json.
import { useState } from "react";
import config from "../nexus.config.json";

export function SignupForm() {
  const hs = config.hubspot || {};
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState("idle"); // idle | sending | done | error

  if (!hs.portalId || !hs.formId) return null;

  const submit = async (e) => {
    e.preventDefault();
    if (!/.+@.+\..+/.test(email)) return;
    setStatus("sending");
    try {
      const res = await fetch(
        `https://api.hsforms.com/submissions/v3/integration/submit/${hs.portalId}/${hs.formId}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            fields: [{ objectTypeId: "0-1", name: "email", value: email }],
            context: { pageUri: window.location.href, pageName: "NEXUS" },
          }),
        }
      );
      setStatus(res.ok ? "done" : "error");
    } catch {
      setStatus("error");
    }
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
          type="email"
          required
          placeholder="you@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          style={{ flex: "1 1 220px" }}
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
