"use client";
import { useEffect, useState } from "react";
import { usePrefs } from "@/lib/usePrefs";
import { assembleDigest } from "@/lib/clientDigest";
import { BASE } from "@/lib/data";
import { ArticleList, WeatherBlock } from "@/components/Articles";

export default function DigestPage() {
  const { prefs, ready } = usePrefs();
  const [digest, setDigest] = useState(null);

  useEffect(() => {
    if (!ready) return;
    assembleDigest(prefs).then(setDigest).catch(() => {});
  }, [ready]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!ready || !digest) {
    return (
      <div className="loading">
        <div className="spinner" />
        Assembling today&apos;s brief…
      </div>
    );
  }

  return (
    <div>
      <h1>Today&apos;s Brief</h1>
      <p className="subtitle">
        {digest.dateLabel} · the top stories for your highest-rated topics{" "}
        <button
          className="btn ghost"
          style={{ marginLeft: 10, padding: "6px 14px", fontSize: 12 }}
          onClick={() => window.open(`${BASE}/newsletter.html`, "_blank")}
        >
          View as email
        </button>
      </p>
      {digest.sections.map((s) => (
        <div key={s.key} className="card">
          <div className="section-head" style={{ borderBottom: "1px solid var(--border)" }}>
            <h2>
              {s.icon} {s.label}
              {s.place ? ` — ${s.place.city}, ${s.place.state}` : ""}
            </h2>
            <span className="meta">{"★".repeat(s.rating)}</span>
          </div>
          {s.type === "weather" ? (
            <WeatherBlock weather={s.weather} />
          ) : (
            <ArticleList items={s.items} showSnippets={true} />
          )}
        </div>
      ))}
    </div>
  );
}
