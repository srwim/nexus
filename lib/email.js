import { buildTeaser } from "./teaser.js";

// Two palettes. "light" is the default because most mail clients (and Gmail's
// print/PDF view) render a white page, and light-on-dark headers either look
// out of place or lose their background entirely. "dark" keeps the site's look
// for readers who prefer it.
const THEMES = {
  light: {
    page: "#f4f4f5",
    card: "#ffffff",
    headBg: "#ffffff",
    headRule: "#e5e7eb",
    brand: "#0b0b0f",
    accent: "#059669",
    accentSoft: "#059669",
    text: "#111111",
    muted: "#6b7280",
    body: "#4b5563",
    rule: "#eeeeee",
    tileBg: "#f9fafb",
    tileBorder: "#e5e7eb",
    tileText: "#111111",
    tileMuted: "#6b7280",
    footText: "#9ca3af",
  },
  dark: {
    page: "#f4f4f5",
    card: "#ffffff",
    headBg: "#0b0b0f",
    headRule: "#23232b",
    brand: "#ffffff",
    accent: "#6ee7b7",
    accentSoft: "#6ee7b7",
    text: "#111111",
    muted: "#9ca3af",
    body: "#4b5563",
    rule: "#eeeeee",
    tileBg: "#14141b",
    tileBorder: "#14141b",
    tileText: "#e7e7ee",
    tileMuted: "#9ca3af",
    footText: "#9ca3af",
  },
};

// Render the digest as a clean, email-safe HTML document.
// extras: {
//   sponsor|sponsors: {top, primary, footer} ad slots,
//   theme: "light" | "dark", siteUrl, settingsUrl, unsubscribeUrl
// }
export function renderEmailHtml(digest, extras = {}) {
  const t = THEMES[extras.theme === "dark" ? "dark" : "light"];
  const ads = extras.sponsors || { primary: extras.sponsor || null };

  const settingsUrl = extras.settingsUrl || (extras.siteUrl ? extras.siteUrl.replace(/\/?$/, "/") + "settings/" : "");
  const unsubscribeUrl = extras.unsubscribeUrl || "mailto:unsubscribe@arok.ai?subject=Unsubscribe%20from%20NEXUS";
  const footerLinks =
    `<div style="margin-top:8px;">` +
    (settingsUrl ? `<a href="${esc(settingsUrl)}" style="color:${t.accent};text-decoration:none;">Settings</a> · ` : "") +
    `<a href="${esc(unsubscribeUrl)}" style="color:${t.footText};text-decoration:underline;">Unsubscribe</a>` +
    `</div>`;

  const sections = digest.sections
    .map((s) => {
      if (s.type === "weather") return weatherHtml(s, t);
      const place = s.place ? ` — ${s.place.city}, ${s.place.state}` : "";
      const items = (s.items || [])
        .map(
          (it) => `
        <tr><td style="padding:12px 0;border-bottom:1px solid ${t.rule};">
          <a href="${esc(it.link)}" style="color:${t.text};font-weight:600;text-decoration:none;font-size:15px;line-height:1.4;">${esc(it.title)}</a>
          ${it.summary ? `<div style="color:${t.body};font-size:13px;line-height:1.55;margin-top:5px;">${esc(it.summary)}</div>` : ""}
          <div style="color:${t.muted};font-size:12px;margin-top:5px;">${esc(it.source)}${fmtDate(it.date)}</div>
        </td></tr>`
        )
        .join("");
      if (!items) return "";
      return sectionWrap(`${s.icon} ${esc(s.label)}${esc(place)}`, `<table width="100%" cellpadding="0" cellspacing="0">${items}</table>`, t);
    })
    .join("");

  const teaser = buildTeaser(digest.sections);
  const teaserHtml = teaser.length
    ? `<div style="margin-top:14px;padding-top:12px;border-top:1px solid ${t.headRule};color:${t.body};font-size:13px;line-height:1.6;">
        <span style="color:${t.accent};font-weight:800;letter-spacing:0.5px;">Digest</span>&nbsp; ${teaser
          .map((x) => `<a href="${esc(x.link)}" style="color:${extras.theme === "dark" ? "#e7e7ee" : t.text};text-decoration:none;border-bottom:1px solid ${t.headRule};">${esc(x.title)}</a>`)
          .join(" ")}
      </div>`
    : "";

  const readOnline = extras.siteUrl
    ? `<div style="margin-top:6px;"><a href="${esc(extras.siteUrl)}" style="color:${t.accent};font-size:12px;text-decoration:none;">Read online →</a></div>`
    : "";

  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head>
<body style="margin:0;padding:0;background:${t.page};font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:24px 12px;">
    <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">
      <tr><td style="padding:28px 28px 18px;background:${t.headBg};border-radius:14px 14px 0 0;${extras.theme === "dark" ? "" : `border:1px solid ${t.headRule};border-bottom:none;`}">
        <div style="color:${t.brand};font-size:26px;font-weight:800;letter-spacing:2px;">NEXUS</div>
        ${sponsorTopHtml(ads.top, t)}
        <div style="color:${t.muted};font-size:13px;margin-top:4px;">Your daily brief · ${esc(digest.dateLabel)}</div>
        ${readOnline}
        ${teaserHtml}
      </td></tr>
      <tr><td style="background:${t.card};padding:8px 28px 28px;${extras.theme === "dark" ? "" : `border:1px solid ${t.headRule};border-top:none;`}border-radius:0 0 14px 14px;">
        ${sponsorPrimaryHtml(ads.primary, t)}${sections}${sponsorFooterHtml(ads.footer, t)}
      </td></tr>
      <tr><td style="padding:16px;text-align:center;color:${t.footText};font-size:11px;">Curated by your topic ratings · NEXUS${footerLinks}</td></tr>
    </table>
  </td></tr></table>
</body></html>`;
}

// Weather as a card grid, matching how the site shows it. Two cards per row.
function weatherHtml(s, t) {
  const w = s.weather || {};
  let body = "";
  if (w.local) {
    body += `<div style="font-size:13px;color:${t.muted};margin:4px 0 10px;">${esc(w.local.city)}, ${esc(w.local.state)}</div>`;
    const cells = (w.local.periods || []).map(
      (p) => `
      <td width="50%" style="padding:5px;">
        <table width="100%" cellpadding="0" cellspacing="0"><tr>
          <td style="background:${t.tileBg};border:1px solid ${t.tileBorder};border-radius:10px;padding:14px 16px;">
            <div style="font-size:11px;letter-spacing:1px;text-transform:uppercase;color:${t.tileMuted};">${esc(p.name)}</div>
            <div style="font-size:24px;font-weight:800;color:${t.accent};margin:4px 0;">${esc(p.temp)}</div>
            <div style="font-size:13px;color:${t.tileText};line-height:1.4;">${esc(p.short)}</div>
          </td>
        </tr></table>
      </td>`
    );
    const rows = [];
    for (let i = 0; i < cells.length; i += 2) {
      rows.push(`<tr>${cells[i]}${cells[i + 1] || "<td width=\"50%\"></td>"}</tr>`);
    }
    body += `<table width="100%" cellpadding="0" cellspacing="0">${rows.join("")}</table>`;
  }
  if (w.alerts?.length) {
    body += `<div style="margin-top:12px;font-size:13px;font-weight:700;color:#b91c1c;">National severe alerts</div>`;
    body += w.alerts
      .slice(0, 5)
      .map((a) => `<div style="padding:4px 0;font-size:13px;color:#7f1d1d;">⚠️ ${esc(a.title)}</div>`)
      .join("");
  }
  if (!body) return "";
  return sectionWrap(`${s.icon} Weather`, body, t);
}

// --- Ad slots -------------------------------------------------------------
// Sponsy placements. None of them render images: the newsletter is text-only,
// so an empty <img> can never leave a blank hole in the layout again.

// "Sponsor" — one compact line directly under the NEXUS title.
// Title (20 char) + call to action (30 char) + link.
function sponsorTopHtml(sp, t) {
  if (!sp || !sp.title) return "";
  const dark = t.headBg !== "#ffffff";
  const cta = sp.cta ? `<span style="color:${dark ? t.tileMuted : t.body};font-style:italic;"> ${esc(sp.cta)}</span>` : "";
  const inner = `<span style="font-weight:800;font-style:italic;font-size:15px;color:${dark ? "#e7e7ee" : t.text};">${esc(sp.title)}</span>${cta}`;
  return `<div style="margin:10px 0 12px;">
    <div style="font-size:10px;letter-spacing:1.5px;text-transform:uppercase;color:${t.muted};margin-bottom:2px;">Sponsored by</div>
    ${sp.url ? `<a href="${esc(sp.url)}" style="text-decoration:none;">${inner}</a>` : inner}
  </div>`;
}

// "Primary" — the full block at the top of the story area.
function sponsorPrimaryHtml(sp, t) {
  if (!sp || !sp.title) return "";
  return `<div style="margin-top:22px;background:${t.tileBg};border:1px solid ${t.tileBorder};border-radius:10px;padding:16px 18px;">
    <div style="font-size:10px;letter-spacing:1.5px;text-transform:uppercase;color:${t.muted};margin-bottom:6px;">Sponsored</div>
    <div style="font-size:15px;font-weight:700;color:${t.tileText};">${esc(sp.title)}</div>
    ${sp.bodyHtml ? `<div style="font-size:13px;color:${t.tileMuted};line-height:1.55;margin-top:5px;">${sp.bodyHtml}</div>` : ""}
    ${sp.body ? `<div style="font-size:13px;color:${t.tileMuted};line-height:1.55;margin-top:5px;">${esc(sp.body)}</div>` : ""}
    ${sp.url ? `<div style="margin-top:8px;"><a href="${esc(sp.url)}" style="color:${t.accent};font-size:13px;font-weight:700;text-decoration:none;">${esc(sp.cta || "Learn more")} →</a></div>` : ""}
  </div>`;
}

// "Footer" — title + text + CTA, sitting just above the sign-off line.
function sponsorFooterHtml(sp, t) {
  if (!sp || !sp.title) return "";
  return `<div style="margin-top:26px;padding-top:18px;border-top:2px solid ${t.tileBorder};">
    <div style="font-size:10px;letter-spacing:1.5px;text-transform:uppercase;color:${t.muted};margin-bottom:6px;">Sponsored</div>
    <div style="font-size:15px;font-weight:700;color:${t.text};">${esc(sp.title)}</div>
    ${sp.bodyHtml ? `<div style="font-size:13px;color:${t.body};line-height:1.55;margin-top:5px;">${sp.bodyHtml}</div>` : ""}
    ${sp.body ? `<div style="font-size:13px;color:${t.body};line-height:1.55;margin-top:5px;">${esc(sp.body)}</div>` : ""}
    ${sp.url ? `<div style="margin-top:8px;"><a href="${esc(sp.url)}" style="color:${t.accent};font-size:13px;font-weight:700;text-decoration:none;">${esc(sp.cta || "Learn more")} →</a></div>` : ""}
  </div>`;
}

function sectionWrap(title, inner, t) {
  return `<div style="margin-top:22px;">
    <div style="font-size:12px;font-weight:800;letter-spacing:1.5px;text-transform:uppercase;color:${t.accent};border-bottom:2px solid ${t.accent};padding-bottom:6px;">${title}</div>
    ${inner}
  </div>`;
}

function fmtDate(d) {
  if (!d) return "";
  try {
    return ` · ${new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric" })}`;
  } catch {
    return "";
  }
}

function esc(s) {
  return String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
