"use client";
import { sourceLabel, LEAN_ORDER } from "@/lib/sources";

// Where the outlet sits on the published left/right scale, as a position on a
// five-step ruler rather than a party colour. Red/blue would be the reflex, and
// it would editorialise through hue in a palette that has no business doing so;
// a filled tick reads as a measurement, which is what it is.
//
// aria-hidden because the written label beside it already says the same thing.
function LeanScale({ index }) {
  return (
    <span className="lean-scale" aria-hidden="true">
      {LEAN_ORDER.map((_, i) => (
        <i key={i} className={i === index ? "on" : ""} />
      ))}
    </span>
  );
}

function SourceMeta({ item }) {
  const label = sourceLabel(item);
  if (!label) return null;
  return (
    <span className="src-meta" title={label.title}>
      {label.owner}
      {label.owner && label.leanLabel ? <span className="sep"> · </span> : null}
      {label.leanLabel ? (
        <>
          <LeanScale index={label.leanIndex} />
          {label.leanLabel}
        </>
      ) : null}
    </span>
  );
}

export function ArticleList({ items, showSnippets = true }) {
  if (!items?.length) return <div className="loading">No stories right now.</div>;
  return (
    <div>
      {items.map((it, i) => (
        <a key={i} className="article" href={it.link} target="_blank" rel="noopener noreferrer">
          <div className="title">{it.title}</div>
          {showSnippets && it.summary ? <div className="snippet">{it.summary}</div> : null}
          <div className="src">
            <span className="src-origin">
              {it.source}
              {it.date
                ? ` · ${new Date(it.date).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}`
                : ""}
            </span>
            <SourceMeta item={it} />
          </div>
        </a>
      ))}
    </div>
  );
}

export function WeatherBlock({ weather }) {
  if (!weather) return null;
  return (
    <div>
      {weather.local ? (
        <>
          <div className="meta" style={{ color: "var(--muted)", fontSize: 13 }}>
            {weather.local.city}, {weather.local.state}
          </div>
          <div className="weather-grid">
            {weather.local.periods.map((p, i) => (
              <div key={i} className="weather-cell">
                <div className="period">{p.name}</div>
                <div className="temp">{p.temp}</div>
                <div className="desc">{p.short}</div>
              </div>
            ))}
          </div>
        </>
      ) : (
        <div className="loading" style={{ padding: "16px 0" }}>
          Add your zipcode in Settings for a local forecast.
        </div>
      )}
      {weather.alerts?.length ? (
        <div style={{ marginTop: 14 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "var(--danger)", marginBottom: 4 }}>
            National severe weather alerts
          </div>
          {weather.alerts.slice(0, 5).map((a, i) => (
            <div key={i} className="alert">⚠️ {a.title}</div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
