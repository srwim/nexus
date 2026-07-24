"use client";
import { useState, useEffect } from "react";
import { usePrefs, shareLink } from "@/lib/usePrefs";
import { BASE } from "@/lib/data";
import { isWpAdmin } from "@/lib/wpAdmin";
import { TOPICS, SPORTS_LEAGUES } from "@/lib/topics";
import { SignupForm } from "@/components/SignupForm";

function Stars({ value, onChange }) {
  return (
    <div className="stars" role="radiogroup" aria-label="rating">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          className={n <= value ? "on" : ""}
          onClick={() => onChange(n === value ? 0 : n)}
          aria-label={`${n} stars`}
        >
          ★
        </button>
      ))}
    </div>
  );
}

export default function SettingsPage() {
  const { prefs, update, ready } = usePrefs();
  const [savedNote, setSavedNote] = useState("");
  const [showConfig, setShowConfig] = useState(false);
  const [copied, setCopied] = useState(false);
  const [shared, setShared] = useState(false);
  const [admin, setAdmin] = useState(false);

  // Reveal admin-only tools when signed into the arok.ai WordPress admin.
  useEffect(() => {
    isWpAdmin().then(setAdmin);
  }, []);

  if (!ready) return <div className="loading"><div className="spinner" />Loading…</div>;

  const flash = () => {
    setSavedNote("Saved ✓");
    setTimeout(() => setSavedNote(""), 1500);
  };

  const setRating = (key, val) => {
    update({ ...prefs, ratings: { ...prefs.ratings, [key]: val } });
    flash();
  };

  const toggleLeague = (key) => {
    const has = prefs.leagues.includes(key);
    update({ ...prefs, leagues: has ? prefs.leagues.filter((l) => l !== key) : [...prefs.leagues, key] });
    flash();
  };

  const configJson = JSON.stringify(
    {
      zip: prefs.zip || "",
      siteUrl: typeof window !== "undefined" ? window.location.origin + BASE : "",
      leagues: prefs.leagues,
      ratings: prefs.ratings,
    },
    null,
    2
  );

  const copyConfig = async () => {
    try {
      await navigator.clipboard.writeText(configJson);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard unavailable */
    }
  };

  return (
    <div>
      <h1>Settings</h1>
      <p className="subtitle">
        Rate each topic 0–5 stars. Higher ratings mean more stories, shown first. Tap a star twice to turn a topic off.
        <span className="saved-note">{savedNote}</span>
      </p>

      <div className="card">
        <div className="section-head"><h2>Topic ratings</h2></div>
        {Object.entries(TOPICS).map(([key, t]) => (
          <div key={key}>
            <div className="pref-row">
              <div className="pref-label">
                <span>{t.icon}</span> {t.label}
                {t.needsZip && !prefs.zip ? <small>(set zipcode below)</small> : null}
              </div>
              <Stars value={prefs.ratings[key] || 0} onChange={(v) => setRating(key, v)} />
            </div>
            {key === "sports" && (prefs.ratings.sports || 0) > 0 ? (
              <div className="chips" style={{ padding: "0 4px 14px" }}>
                {Object.entries(SPORTS_LEAGUES).map(([lk, l]) => (
                  <button key={lk} className={`chip ${prefs.leagues.includes(lk) ? "on" : ""}`} onClick={() => toggleLeague(lk)}>
                    {l.label}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        ))}
      </div>

      <div className="card">
        <div className="section-head"><h2>Location</h2></div>
        <div className="pref-row">
          <div className="pref-label">📮 Zipcode <small>for local news &amp; weather</small></div>
          <input
            type="text"
            inputMode="numeric"
            maxLength={5}
            placeholder="e.g. 84101"
            value={prefs.zip}
            onChange={(e) => {
              update({ ...prefs, zip: e.target.value.replace(/\D/g, "") });
              flash();
            }}
          />
        </div>
        <div style={{ marginTop: 14, display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button
            className="btn"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(shareLink(prefs));
                setShared(true);
                setTimeout(() => setShared(false), 2000);
              } catch {}
            }}
          >
            {shared ? "Link Copied ✓" : "Copy Share Link"}
          </button>
          <button className="btn ghost" onClick={() => window.open(`${BASE}/newsletter.html`, "_blank")}>
            Preview Newsletter
          </button>
        </div>
      </div>

      {/* Public subscribe box — same HubSpot form as the Feed/Brief pages. */}
      <SignupForm />

      {admin ? (
        <div className="card">
          <div className="section-head"><h2>Admin</h2></div>
          <div className="hint" style={{ marginTop: 0 }}>
            The published site and daily newsletter are built from <code>nexus.config.json</code> in the GitHub
            repository. Copy your current settings below and paste them into that file to sync.
          </div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button className="btn ghost" onClick={copyConfig}>
              {copied ? "Copied ✓" : "Copy My Config"}
            </button>
            <button className="btn ghost" onClick={() => setShowConfig(!showConfig)}>
              {showConfig ? "Hide Config" : "Show Config"}
            </button>
          </div>
          {showConfig ? (
            <div className="hint" style={{ whiteSpace: "pre-wrap", wordBreak: "normal" }}>
              <b>Paste this into <code>nexus.config.json</code> on GitHub</b> (repo → the file → pencil icon → paste →
              Commit changes). The next scheduled build picks it up automatically.
              {"\n\n"}<code style={{ whiteSpace: "pre-wrap" }}>{configJson}</code>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
