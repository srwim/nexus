"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { usePrefs } from "@/lib/usePrefs";
import { assembleDigest } from "@/lib/clientDigest";
import { buildTeaser } from "@/lib/teaser";
import { ArticleList, WeatherBlock } from "@/components/Articles";
import { SignupForm } from "@/components/SignupForm";

export default function Home() {
  const { prefs, ready } = usePrefs();
  const [digest, setDigest] = useState(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!ready) return;
    assembleDigest(prefs).then(setDigest).catch(() => setError(true));
  }, [ready]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!ready || (!digest && !error)) {
    return (
      <div className="loading">
        <div className="spinner" />
        Gathering your stories…
      </div>
    );
  }
  if (error) return <div className="loading">Couldn&apos;t load feeds. Check your connection and refresh.</div>;

  const teaser = buildTeaser(digest.sections);

  return (
    <div>
      <h1>Your Feed</h1>
      <p className="subtitle">
        Ranked by your topic ratings · <Link href="/settings" style={{ color: "var(--accent)" }}>adjust them anytime</Link>
        {digest.updatedAt ? (
          <span> · updated {new Date(digest.updatedAt).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}</span>
        ) : null}
      </p>
      {teaser.length > 0 && (
        <div className="tldr">
          <span className="tldr-label">TL;DR</span>
          {teaser.map((t, i) => (
            <span key={i}>
              {i > 0 && <span className="tldr-sep">, </span>}
              <a href={t.link} target="_blank" rel="noopener noreferrer" className="tldr-link">{t.title}</a>
            </span>
          ))}
        </div>
      )}
      {digest.sections.map((s) => (
        <section key={s.key} className="section">
          <div className="section-head">
            <h2>
              {s.icon} {s.label}
              {s.place ? ` — ${s.place.city}, ${s.place.state}` : ""}
            </h2>
            <span className="meta">{"★".repeat(s.rating)}</span>
          </div>
          {s.type === "weather" ? <WeatherBlock weather={s.weather} /> : <ArticleList items={s.items} />}
        </section>
      ))}
      <SignupForm />
    </div>
  );
}
