// Render the digest as a clean, email-safe HTML document.
// extras: { sponsor: {title, body, url, cta}, siteUrl, settingsUrl, unsubscribeUrl }
export function renderEmailHtml(digest, extras = {}) {
  const settingsUrl = extras.settingsUrl || (extras.siteUrl ? extras.siteUrl.replace(/\/?$/, "/") + "settings/" : "");
  const unsubscribeUrl = extras.unsubscribeUrl || "mailto:unsubscribe@arok.ai?subject=Unsubscribe%20from%20NEXUS";
  const footerLinks =
    `<div style="margin-top:8px;">` +
    (settingsUrl ? `<a href="${esc(settingsUrl)}" style="color:#6ee7b7;text-decoration:none;">Settings</a> · ` : "") +
    `<a href="${esc(unsubscribeUrl)}" style="color:#9ca3af;text-decoration:underline;">Unsubscribe</a>` +
    `</div>`;
  const sections = digest.sections
    .map((s) => {
      if (s.type === "weather") return weatherHtml(s);
      const place = s.place ? ` — ${s.place.city}, ${s.place.state}` : "";
      const items = (s.items || [])
        .map(
          (it) => `
        <tr><td style="padding:12px 0;border-bottom:1px solid #eee;">
          <a href="${esc(it.link)}" style="color:#111;font-weight:600;text-decoration:none;font-size:15px;line-height:1.4;">${esc(it.title)}</a>
          ${it.summary ? `<div style="color:#4b5563;font-size:13px;line-height:1.55;margin-top:5px;">${esc(it.summary)}</div>` : ""}
          <div style="color:#9ca3af;font-size:12px;margin-top:5px;">${esc(it.source)}${fmtDate(it.date)}</div>
        </td></tr>`
        )
        .join("");
      if (!items) return "";
      return sectionWrap(`${s.icon} ${esc(s.label)}${esc(place)}`, `<table width="100%" cellpadding="0" cellspacing="0">${items}</table>`);
    })
    .join("");

  const sponsor = sponsorHtml(extras.sponsor);
  const readOnline = extras.siteUrl
    ? `<div style="margin-top:6px;"><a href="${esc(extras.siteUrl)}" style="color:#6ee7b7;font-size:12px;text-decoration:none;">Read online →</a></div>`
    : "";

  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:24px 12px;">
    <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">
      <tr><td style="padding:28px 28px 14px;background:#0b0b0f;border-radius:14px 14px 0 0;">
        <div style="color:#fff;font-size:22px;font-weight:800;letter-spacing:1px;"><span style="color:#6ee7b7;">NEXUS</span></div>
        <div style="color:#9ca3af;font-size:13px;margin-top:4px;">Your daily brief · ${esc(digest.dateLabel)}</div>
        ${readOnline}
      </td></tr>
      <tr><td style="background:#ffffff;padding:8px 28px 28px;border-radius:0 0 14px 14px;">${sponsor}${sections}</td></tr>
      <tr><td style="padding:16px;text-align:center;color:#9ca3af;font-size:11px;">Curated by your topic ratings · NEXUS${footerLinks}</td></tr>
    </table>
  </td></tr></table>
</body></html>`;
}

// Weather as a card grid, matching how the site shows it: dark panels,
// bold green temperature, condition underneath. Two cards per row.
function weatherHtml(s) {
  const w = s.weather || {};
  let body = "";
  if (w.local) {
    body += `<div style="font-size:13px;color:#555;margin:4px 0 10px;">${esc(w.local.city)}, ${esc(w.local.state)}</div>`;
    const cells = (w.local.periods || []).map(
      (p) => `
      <td width="50%" style="padding:5px;">
        <table width="100%" cellpadding="0" cellspacing="0"><tr>
          <td style="background:#14141b;border-radius:10px;padding:14px 16px;">
            <div style="font-size:11px;letter-spacing:1px;text-transform:uppercase;color:#9ca3af;">${esc(p.name)}</div>
            <div style="font-size:24px;font-weight:800;color:#6ee7b7;margin:4px 0;">${esc(p.temp)}</div>
            <div style="font-size:13px;color:#e7e7ee;line-height:1.4;">${esc(p.short)}</div>
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
  return sectionWrap(`${s.icon} Weather`, body);
}

function sponsorHtml(sp) {
  if (!sp || !sp.title) return "";
  const img = sp.image
    ? (sp.url
        ? `<a href="${esc(sp.url)}" style="text-decoration:none;"><img src="${esc(sp.image)}" width="100%" alt="${esc(sp.title)}" style="display:block;width:100%;max-width:100%;border-radius:8px;margin:0 0 12px;border:0;"></a>`
        : `<img src="${esc(sp.image)}" width="100%" alt="${esc(sp.title)}" style="display:block;width:100%;max-width:100%;border-radius:8px;margin:0 0 12px;border:0;">`)
    : "";
  return `<div style="margin-top:22px;background:#f9fafb;border:1px solid #e5e7eb;border-radius:10px;padding:16px 18px;">
    <div style="font-size:10px;letter-spacing:1.5px;text-transform:uppercase;color:#9ca3af;margin-bottom:6px;">Sponsored</div>
    ${img}
    <div style="font-size:15px;font-weight:700;color:#111;">${esc(sp.title)}</div>
    ${sp.bodyHtml ? `<div style="font-size:13px;color:#4b5563;line-height:1.55;margin-top:5px;">${sp.bodyHtml}</div>` : ""}
    ${sp.body ? `<div style="font-size:13px;color:#4b5563;line-height:1.55;margin-top:5px;">${esc(sp.body)}</div>` : ""}
    ${sp.url ? `<div style="margin-top:8px;"><a href="${esc(sp.url)}" style="color:#059669;font-size:13px;font-weight:700;text-decoration:none;">${esc(sp.cta || "Learn more")} →</a></div>` : ""}
  </div>`;
}

function sectionWrap(title, inner) {
  return `<div style="margin-top:22px;">
    <div style="font-size:12px;font-weight:800;letter-spacing:1.5px;text-transform:uppercase;color:#059669;border-bottom:2px solid #059669;padding-bottom:6px;">${title}</div>
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
