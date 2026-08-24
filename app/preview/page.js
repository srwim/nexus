"use client";
// The reader's OWN edition, rendered in the browser.
//
// public/newsletter.html is built from nexus.config.json, which makes it the
// publication's house edition — it can never reflect a visitor's settings, and
// pointing "Preview Newsletter" at it meant readers changed their theme, saw no
// difference, and reasonably concluded nothing had saved.
//
// This page runs the same two functions the real send runs: assemble the digest
// from the published data using the visitor's prefs, then render it with the
// email template. What you see here is what the mailer will build for you.
import { useEffect, useState } from "react";
import { usePrefs } from "@/lib/usePrefs";
import { assembleDigest } from "@/lib/clientDigest";
import { renderEmailHtml } from "@/lib/email";
import { selectSponsors } from "@/lib/sponsors";
import { BASE } from "@/lib/data";
import config from "@/nexus.config.json";
import sponsorData from "@/sponsors.json";

export default function PreviewPage() {
  const { prefs, ready } = usePrefs();
  const [theme, setTheme] = useState(null); // null: follow the saved preference
  const [html, setHtml] = useState("");
  const [failed, setFailed] = useState(false);

  const active = theme ?? (prefs.theme === "dark" ? "dark" : "light");

  useEffect(() => {
    if (!ready) return;
    let cancelled = false;
    assembleDigest(prefs)
      .then((digest) => {
        if (cancelled) return;
        const siteUrl = typeof window !== "undefined" ? `${window.location.origin}${BASE}/` : "";
        // Sponsors resolve from the repo file now, so the preview shows the
        // real ads rather than promising they appear later.
        const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Denver" }).format(new Date());
        setHtml(
          renderEmailHtml(digest, {
            theme: active,
            siteUrl,
            sponsors: selectSponsors(sponsorData, today, config.localNewsProxy),
            postalAddress: config.newsletter?.postalAddress,
          })
        );
      })
      .catch(() => !cancelled && setFailed(true));
    return () => {
      cancelled = true;
    };
  }, [ready, active]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!ready || (!html && !failed)) {
    return (
      <div className="loading">
        <div className="spinner" />
        Building your edition…
      </div>
    );
  }

  if (failed) {
    return (
      <div>
        <h1>Preview <em>Your Email</em></h1>
        <div className="card">
          <p style={{ margin: 0 }}>
            Couldn&apos;t build the preview. The published data may still be refreshing — try again in a
            few minutes.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div>
      <h1>Preview <em>Your Email</em></h1>
      <p className="subtitle">
        Built from your settings, the same way tomorrow&apos;s brief will be.
      </p>

      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          flexWrap: "wrap",
          margin: "0 0 14px",
        }}
      >
        <span
          style={{
            fontFamily: "var(--mono)",
            fontSize: 11,
            letterSpacing: ".12em",
            textTransform: "uppercase",
            color: "var(--muted)",
          }}
        >
          Theme
        </span>
        <div className="chips" style={{ marginTop: 0 }}>
          {[
            ["light", "Light"],
            ["dark", "Dark"],
          ].map(([key, label]) => (
            <button
              key={key}
              className={`chip ${active === key ? "on" : ""}`}
              aria-pressed={active === key}
              onClick={() => setTheme(key)}
            >
              {label}
            </button>
          ))}
        </div>
        {theme && theme !== (prefs.theme || "light") ? (
          <span style={{ fontSize: 12, color: "var(--muted)" }}>
            Previewing only. Your saved theme is {prefs.theme || "light"}.
          </span>
        ) : null}
      </div>

      {/* The email is untrusted-ish: its text comes from public feeds. Sandbox
          it so nothing but link-opening is possible. */}
      <iframe
        title="Your Daily Brief, as it will arrive"
        srcDoc={html}
        sandbox="allow-popups allow-popups-to-escape-sandbox"
        style={{
          width: "100%",
          height: "78vh",
          minHeight: 520,
          border: "1px solid var(--border)",
          background: active === "dark" ? "#0b0b0a" : "#f4f2ed",
        }}
      />

      <div className="hint" style={{ marginTop: 12 }}>
        One difference from the real thing: this renders from the last published build, so a story
        added in the past half hour may not appear yet. To make these settings your actual email, use{" "}
        <b>Apply to my email</b> in Settings.
      </div>
    </div>
  );
}
