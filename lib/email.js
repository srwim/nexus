import { buildTeaser } from "./teaser.js";
import { sourceLabel, RATING_BASIS, CHECKED } from "./sources.js";
import { COUNTRIES } from "./foreign.js";

// Two palettes. "light" is the default because most mail clients (and Gmail's
// print/PDF view) render a white page, and light-on-dark headers either look
// out of place or lose their background entirely. "dark" keeps the site's look
// for readers who prefer it.
// Both palettes follow the AROK design system: clay is the interaction colour,
// warm ink and paper replace the cool greys. Light is not a tint of dark — on
// white, clay has to darken to #9c552b to clear AA for body-sized text, while
// the dark theme can run the full #c07a4b.
const THEMES = {
  light: {
    page: "#f4f2ed", // warm paper, not neutral grey
    card: "#ffffff",
    headBg: "#ffffff",
    headRule: "#e2ddd2",
    brand: "#9c552b", // deepened clay — full clay fails AA on white
    accent: "#9c552b",
    text: "#1a1815",
    muted: "#6b665c",
    body: "#4a453d",
    rule: "#e8e3d9",
    tileBg: "#faf8f4",
    tileBorder: "#e2ddd2",
    tileText: "#1a1815",
    tileMuted: "#6b665c",
    footText: "#8a8478",
    alert: "#a63a26",
    alertText: "#7d2a1c",
  },
  // Mirrors the site's CSS variables so the email reads as the same product:
  // --bg #0b0b0a, --panel #141412, --panel-2 #1e1e1b, --border #2b2b26,
  // --text #e9e5db, --muted #9c988d, --accent #c07a4b, --danger #d4503a.
  dark: {
    page: "#0b0b0a",
    card: "#141412",
    headBg: "#0b0b0a",
    headRule: "#2b2b26",
    brand: "#c07a4b",
    accent: "#c07a4b",
    text: "#e9e5db",
    muted: "#9c988d",
    body: "#b8b3a6",
    rule: "#2b2b26",
    tileBg: "#1e1e1b",
    tileBorder: "#2b2b26",
    tileText: "#e9e5db",
    tileMuted: "#9c988d",
    footText: "#6b675e",
    alert: "#d4503a",
    alertText: "#e08a78",
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

  const base = extras.siteUrl ? extras.siteUrl.replace(/\/?$/, "/") : "";
  const settingsUrl = extras.settingsUrl || (base ? `${base}settings/` : "");
  const privacyUrl = base ? `${base}privacy/` : "";
  const unsubscribeUrl = extras.unsubscribeUrl || "mailto:unsubscribe@arok.ai?subject=Unsubscribe%20from%20NEXUS";
  const footerLinks =
    `<div style="margin-top:8px;">` +
    (settingsUrl ? `<a href="${esc(settingsUrl)}" style="color:${t.accent};text-decoration:none;">Settings</a> · ` : "") +
    (privacyUrl ? `<a href="${esc(privacyUrl)}" style="color:${t.footText};text-decoration:none;">Privacy</a> · ` : "") +
    `<a href="${esc(unsubscribeUrl)}" style="color:${t.footText};text-decoration:underline;">Unsubscribe</a>` +
    `</div>`;

  // CAN-SPAM requires a valid physical postal address in every commercial
  // email, and it must be the sender's own — a street address, a USPS-
  // registered PO box, or a CMRA mailbox. Penalties are assessed per email,
  // not per campaign, so an empty value here is a real exposure rather than a
  // cosmetic gap. scripts/send-newsletter.mjs warns loudly when it is unset.
  const postalHtml = extras.postalAddress
    ? `<div style="margin-top:8px;">${esc(extras.postalAddress)}</div>`
    : "";

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
          ${metaRow(it, t)}
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
          .map((x) => `<a href="${esc(x.link)}" style="color:${t.text};text-decoration:none;border-bottom:1px solid ${t.headRule};">${esc(x.title)}</a>`)
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
      <tr><td style="padding:28px 28px 18px;background:${t.headBg};border-radius:14px 14px 0 0;border:1px solid ${t.tileBorder};border-bottom:none;">
        <div style="color:${t.brand};font-size:26px;font-weight:800;letter-spacing:2px;">NEXUS</div>
        ${sponsorTopHtml(ads.top, t)}
        <div style="color:${t.muted};font-size:13px;margin-top:4px;">Your daily brief · ${esc(digest.dateLabel)}</div>
        ${readOnline}
        ${teaserHtml}
      </td></tr>
      <tr><td style="background:${t.card};padding:8px 28px 28px;border:1px solid ${t.tileBorder};border-top:none;border-radius:0 0 14px 14px;">
        ${sponsorPrimaryHtml(ads.primary, t)}${sections}${sponsorFooterHtml(ads.footer, t)}
      </td></tr>
      <tr><td style="padding:16px;text-align:center;color:${t.footText};font-size:11px;line-height:1.6;">
        Curated by your topic ratings · NEXUS
        <div style="margin-top:8px;">Ownership and political-lean labels summarise published ratings from ${esc(RATING_BASIS)}, last reviewed ${esc(CHECKED)}. They are not NEXUS's own assessment.</div>
        ${postalHtml}
        ${footerLinks}
      </td></tr>
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
    body += `<div style="margin-top:12px;font-size:13px;font-weight:700;color:${t.alert};">National severe alerts</div>`;
    body += w.alerts
      .slice(0, 5)
      .map((a) => `<div style="padding:4px 0;font-size:13px;color:${t.alertText};">⚠️ ${esc(a.title)}</div>`)
      .join("");
  }
  if (!body) return "";
  return sectionWrap(`${s.icon} Weather`, body, t);
}

// --- Ad slots -------------------------------------------------------------
// Sponsy placements. None of them render images: the newsletter is text-only,
// so an empty <img> can never leave a blank hole in the layout again.

// The clickable plug. When the advertiser set anchor text on their link we use
// it as the label and let the CTA lead in above it; otherwise the CTA itself
// becomes the link label so nothing is duplicated.
function ctaHtml(sp, t) {
  const label = sp.linkText || sp.cta || (sp.url ? "Learn more" : "");
  if (!label) return "";
  const lead =
    sp.linkText && sp.cta
      ? `<div style="font-size:13px;color:${t.body};line-height:1.55;margin-top:6px;">${esc(sp.cta)}</div>`
      : "";
  const link = sp.url
    ? `<a href="${esc(sp.url)}" style="color:${t.accent};font-size:13px;font-weight:700;text-decoration:none;">${esc(label)} →</a>`
    : `<span style="color:${t.accent};font-size:13px;font-weight:700;">${esc(label)}</span>`;
  return `${lead}<div style="margin-top:8px;">${link}</div>`;
}

// "Sponsor" — one compact line directly under the NEXUS title.
// Title (20 char) + call to action (30 char) + anchor-text link.
function sponsorTopHtml(sp, t) {
  if (!sp || !sp.title) return "";
  const title = `<span style="font-weight:800;font-style:italic;font-size:15px;color:${t.text};">${esc(sp.title)}</span>`;
  const cta = sp.cta ? `<span style="color:${t.body};font-style:italic;"> ${esc(sp.cta)}</span>` : "";
  // Never emit an anchor with an empty href — it looks clickable and isn't.
  // With no URL the anchor text still shows, just as plain text.
  const plug = !sp.linkText
    ? ""
    : sp.url
      ? `<span style="color:${t.body};"> — </span><a href="${esc(sp.url)}" style="color:${t.accent};font-weight:700;text-decoration:none;">${esc(sp.linkText)} →</a>`
      : `<span style="color:${t.body};"> — ${esc(sp.linkText)}</span>`;
  // Without anchor text the whole title links; with it, the plug carries the link.
  const head = !plug && sp.url ? `<a href="${esc(sp.url)}" style="text-decoration:none;">${title}${cta}</a>` : `${title}${cta}${plug}`;
  return `<div style="margin:10px 0 12px;font-size:15px;line-height:1.5;">
    <div style="font-size:10px;letter-spacing:1.5px;text-transform:uppercase;color:${t.muted};margin-bottom:2px;">Sponsored by</div>
    ${head}
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
    ${ctaHtml(sp, t)}
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
    ${ctaHtml(sp, t)}
  </div>`;
}

function sectionWrap(title, inner, t) {
  return `<div style="margin-top:22px;">
    <div style="font-size:12px;font-weight:800;letter-spacing:1.5px;text-transform:uppercase;color:${t.accent};border-bottom:2px solid ${t.accent};padding-bottom:6px;">${title}</div>
    ${inner}
  </div>`;
}

// Origin on the left, provenance right-aligned across from it. A two-cell table
// rather than flexbox: Outlook renders tables and ignores modern layout, and
// this line is the one part of a story a reader might scan for.
//
// The site draws the lean as a five-step scale; here it's the written label
// only. Inline SVG is stripped by Gmail and a table of coloured cells per story
// would cost more markup than the information is worth in an email.
function metaRow(it, t) {
  const country = it.country ? COUNTRIES[it.country] : null;
  const label = country ? null : sourceLabel(it);
  const left = `${esc(it.source)}${fmtDate(it.date)}`;
  if (!country && !label) return `<div style="color:${t.muted};font-size:12px;margin-top:5px;">${left}</div>`;
  const right = country
    ? `${country.label} · ${it.translated ? "Translated" : country.language}`
    : [label.owner, label.leanLabel].filter(Boolean).join(" · ");
  return `<table width="100%" cellpadding="0" cellspacing="0" style="margin-top:5px;"><tr>
    <td style="color:${t.muted};font-size:12px;">${left}</td>
    <td align="right" style="color:${t.muted};font-size:11px;opacity:0.85;white-space:nowrap;padding-left:10px;">${esc(right)}</td>
  </tr></table>`;
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
