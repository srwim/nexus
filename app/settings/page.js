"use client";
import { useState, useEffect } from "react";
import { usePrefs, shareLink } from "@/lib/usePrefs";
import { BASE } from "@/lib/data";
import { isWpAdmin } from "@/lib/wpAdmin";
import { TOPICS, leaguesBySport } from "@/lib/topics";
import { submitSubscription } from "@/lib/hubspotForm";
import { SignupForm } from "@/components/SignupForm";

function Stars({ value, onChange }) {
  return (
    <div className="stars" role="radiogroup" aria-label="rating">
      <button
        className={`off-btn ${value === 0 ? "on" : ""}`}
        onClick={() => onChange(0)}
        aria-label="turn topic off"
        aria-pressed={value === 0}
      >
        Off
      </button>
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

// A sport with one league is just a chip — wrapping "Golf" in a disclosure the
// reader must open to find "Golf" would be ceremony. Sports with several series
// (Motor Racing) expand, using native <details> so keyboard and screen-reader
// behaviour comes for free.
function LeagueGroup({ sport, leagues, selected, onToggle }) {
  const chips = (
    <div className="chips" style={{ marginTop: 0 }}>
      {leagues.map(([key, league]) => (
        <button
          key={key}
          className={`chip ${selected.includes(key) ? "on" : ""}`}
          aria-pressed={selected.includes(key)}
          onClick={() => onToggle(key)}
        >
          {league.label}
        </button>
      ))}
    </div>
  );

  if (leagues.length === 1) return <div style={{ marginBottom: 8 }}>{chips}</div>;

  const on = leagues.filter(([key]) => selected.includes(key)).length;
  return (
    <details open={on > 0} style={{ marginBottom: 8 }}>
      <summary
        style={{
          cursor: "pointer",
          fontFamily: "var(--mono)",
          fontSize: 12,
          letterSpacing: ".06em",
          textTransform: "uppercase",
          color: on > 0 ? "var(--accent)" : "var(--muted)",
          padding: "6px 0",
        }}
      >
        {sport}
        {on > 0 ? ` · ${on} of ${leagues.length}` : ` · ${leagues.length} series`}
      </summary>
      <div style={{ padding: "4px 0 2px 12px", borderLeft: "1px solid var(--border)" }}>{chips}</div>
    </details>
  );
}

export default function SettingsPage() {
  const { prefs, update, ready } = usePrefs();
  const [savedNote, setSavedNote] = useState("");
  const [showConfig, setShowConfig] = useState(false);
  const [copied, setCopied] = useState(false);
  const [shared, setShared] = useState(false);
  const [admin, setAdmin] = useState(false);
  const [syncEmail, setSyncEmail] = useState(null); // null = fall back to the saved address
  const [syncStatus, setSyncStatus] = useState("idle"); // idle | sending | done | partial | error

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
      theme: prefs.theme || "light",
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
      <h1><em>Settings</em></h1>
      <p className="subtitle">
        Rate each topic 1–5 stars — higher means more stories, shown first. Hit <b>Off</b> (or tap the active star) to hide a topic entirely.
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
              <div style={{ padding: "0 4px 14px" }}>
                {leaguesBySport().map(([sport, leagues]) => (
                  <LeagueGroup
                    key={sport}
                    sport={sport}
                    leagues={leagues}
                    selected={prefs.leagues}
                    onToggle={toggleLeague}
                  />
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
          <button
            className="btn ghost"
            onClick={() =>
              window.open(
                `${BASE}/newsletter${(prefs.theme || "light") === "dark" ? "-dark" : ""}.html?t=${Date.now()}`,
                "_blank"
              )
            }
          >
            Preview Newsletter
          </button>
        </div>
      </div>

      <div className="card">
        <div className="section-head"><h2>Newsletter appearance</h2></div>
        <div className="pref-row">
          <div className="pref-label">
            🎨 Theme <small>how your daily email looks</small>
          </div>
          <div className="chips" style={{ marginTop: 0 }}>
            {[
              ["light", "Light"],
              ["dark", "Dark"],
            ].map(([key, label]) => (
              <button
                key={key}
                className={`chip ${(prefs.theme || "light") === key ? "on" : ""}`}
                onClick={() => {
                  update({ ...prefs, theme: key });
                  flash();
                }}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Everything above this point lives in this browser only. This card is
          what carries it to the email — without it, the daily brief is built
          from the publication default and a reader's choices look ignored. */}
      <div className="card">
        <div className="section-head"><h2>Apply these settings to your email</h2></div>
        <div className="hint" style={{ marginTop: 0 }}>
          Your ratings, leagues, zipcode and theme are saved in this browser. Send them to your
          subscription and tomorrow&apos;s Daily Brief is built from them instead of the house defaults.
        </div>
        <form
          style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 12 }}
          onSubmit={async (e) => {
            e.preventDefault();
            const address = (syncEmail ?? prefs.email ?? "").trim();
            if (!/.+@.+\..+/.test(address)) return;
            setSyncStatus("sending");
            const { ok, prefsSaved } = await submitSubscription({ email: address, prefs });
            if (ok) update({ ...prefs, email: address });
            setSyncStatus(ok ? (prefsSaved ? "done" : "partial") : "error");
          }}
        >
          <input
            type="email"
            required
            placeholder="you@example.com"
            aria-label="the email address your brief goes to"
            value={syncEmail ?? prefs.email ?? ""}
            onChange={(e) => {
              setSyncEmail(e.target.value);
              setSyncStatus("idle");
            }}
            style={{ flex: "1 1 220px" }}
          />
          <button className="btn" disabled={syncStatus === "sending"}>
            {syncStatus === "sending" ? "Sending…" : syncStatus === "done" ? "Settings applied ✓" : "Apply to my email"}
          </button>
        </form>
        {syncStatus === "partial" ? (
          <div style={{ color: "var(--danger)", fontSize: 13, marginTop: 8 }}>
            You&apos;re subscribed, but your settings couldn&apos;t be saved — the newsletter form is
            missing its <code>nexus_prefs</code> field. Until it&apos;s added you&apos;ll get the default brief.
          </div>
        ) : syncStatus === "error" ? (
          <div style={{ color: "var(--danger)", fontSize: 13, marginTop: 8 }}>
            That didn&apos;t go through — try again in a moment.
          </div>
        ) : null}
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
