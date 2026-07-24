// Optional integrations for the daily newsletter run. Every one is gated on
// its secret being present — nothing here can break the send if unconfigured.
import { createSign } from "node:crypto";

// ---------- Slack: post the brief to a channel via incoming webhook ----------
export async function postSlack(digest, config) {
  const url = process.env.SLACK_WEBHOOK_URL;
  if (!url) return "skipped (no SLACK_WEBHOOK_URL)";
  const lines = [`*NEXUS Daily Brief — ${digest.dateLabel}*`];
  for (const s of digest.sections) {
    if (s.type !== "news" || !s.items?.length) continue;
    lines.push(`\n${s.icon} *${s.label}*`);
    for (const it of s.items.slice(0, 3)) lines.push(`• <${it.link}|${it.title.replace(/[<>|]/g, "")}>`);
  }
  if (config.siteUrl) lines.push(`\n<${config.siteUrl}|Read the full brief →>`);
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text: lines.join("\n") }),
  });
  return res.ok ? "posted" : `failed (${res.status})`;
}

// ---------- Sponsy: pull today's sponsor placement into the email ----------
// Uses SPONSY_API_KEY and SPONSY_PUBLICATION_ID. Field names in Sponsy's API
// vary by setup — the mapping below is defensive; adjust to match your
// publication if your placements don't appear (see docs.getsponsy.com).
export async function fetchSponsor() {
  const key = process.env.SPONSY_API_KEY;
  const pub = process.env.SPONSY_PUBLICATION_ID;
  if (!key || !pub) return null;

  // TEMP DEBUG: dump the content-bearing fields of each slot.
  try {
    const r = await fetch(`https://api.getsponsy.com/v1/publications/${pub}/slots`, {
      headers: { "X-API-KEY": key, Accept: "application/json" },
    });
    const data = await r.json();
    const slots = data.data || data.slots || (Array.isArray(data) ? data : []);
    console.log(`SPONSY_DEBUG slots count=${slots.length}`);
    for (const s of slots.slice(0, 3)) {
      console.log(
        `SPONSY_DEBUG fields ${JSON.stringify({
          date: s.date,
          status: s.status,
          placement: s.placement,
          customer: s.customer,
          copy: s.copy,
          links: s.links,
          parsedUrls: s.parsedUrls,
          placementFieldValues: s.placementFieldValues,
        }).slice(0, 1600)}`
      );
    }
  } catch (e) {
    console.log(`SPONSY_DEBUG slots error=${e.message}`);
  }
  return null; // no sponsor rendered during the debug pass
}

// ---------- HubSpot: use a contact list as the mailing list ----------
// Reads emails from list HUBSPOT_LIST_ID using a private-app token
// (HUBSPOT_TOKEN). Delivery still goes through Resend, so no paid
// Marketing Hub tier is needed.
export async function hubspotRecipients() {
  const token = process.env.HUBSPOT_TOKEN;
  const listId = process.env.HUBSPOT_LIST_ID;
  if (!token || !listId) {
    console.log("HubSpot list: skipped (no HUBSPOT_TOKEN/HUBSPOT_LIST_ID)");
    return [];
  }
  const auth = { Authorization: `Bearer ${token}` };
  try {
    const memRes = await fetch(
      `https://api.hubapi.com/crm/v3/lists/${listId}/memberships?limit=100`,
      { headers: auth }
    );
    if (!memRes.ok) {
      console.warn(`HubSpot list: membership fetch failed (${memRes.status}: ${(await memRes.text()).slice(0, 160)})`);
      return [];
    }
    const members = await memRes.json();
    const ids = (members.results || []).map((m) => ({ id: m.recordId || m }));
    if (!ids.length) {
      console.log("HubSpot list: 0 members on the list yet");
      return [];
    }
    const batchRes = await fetch("https://api.hubapi.com/crm/v3/objects/contacts/batch/read", {
      method: "POST",
      headers: { ...auth, "Content-Type": "application/json" },
      body: JSON.stringify({ inputs: ids, properties: ["email"] }),
    });
    if (!batchRes.ok) {
      console.warn(`HubSpot list: contact read failed (${batchRes.status}: ${(await batchRes.text()).slice(0, 160)})`);
      return [];
    }
    const contacts = await batchRes.json();
    const emails = (contacts.results || []).map((c) => c.properties?.email).filter(Boolean);
    console.log(`HubSpot list: ${emails.length} subscriber(s) pulled`);
    return emails;
  } catch (e) {
    console.warn("HubSpot list: errored —", e?.message || e);
    return [];
  }
}

// ---------- Google Drive: archive each day's newsletter HTML ----------
// Needs GDRIVE_SERVICE_ACCOUNT (full service-account JSON) and
// GDRIVE_FOLDER_ID (a folder shared with the service account's email).
export async function uploadToDrive(html, digest) {
  const saJson = process.env.GDRIVE_SERVICE_ACCOUNT;
  const folderId = process.env.GDRIVE_FOLDER_ID;
  if (!saJson || !folderId) return "skipped (no GDRIVE_* secrets)";
  try {
    const sa = JSON.parse(saJson);
    const now = Math.floor(Date.now() / 1000);
    const header = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
    const claims = b64url(
      JSON.stringify({
        iss: sa.client_email,
        scope: "https://www.googleapis.com/auth/drive.file",
        aud: "https://oauth2.googleapis.com/token",
        iat: now,
        exp: now + 3600,
      })
    );
    const signer = createSign("RSA-SHA256");
    signer.update(`${header}.${claims}`);
    const signature = signer.sign(sa.private_key, "base64url");
    const jwt = `${header}.${claims}.${signature}`;

    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`,
    });
    if (!tokenRes.ok) return `token failed (${tokenRes.status})`;
    const { access_token } = await tokenRes.json();

    const name = `NEXUS Brief ${new Date().toISOString().slice(0, 10)}.html`;
    const boundary = "nexus-upload";
    const body =
      `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n` +
      JSON.stringify({ name, parents: [folderId], mimeType: "text/html" }) +
      `\r\n--${boundary}\r\nContent-Type: text/html\r\n\r\n${html}\r\n--${boundary}--`;
    const upRes = await fetch(
      "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${access_token}`,
          "Content-Type": `multipart/related; boundary=${boundary}`,
        },
        body,
      }
    );
    return upRes.ok ? `uploaded "${name}"` : `upload failed (${upRes.status})`;
  } catch (e) {
    return `failed (${e.message})`;
  }
}

function b64url(s) {
  return Buffer.from(s).toString("base64url");
}
