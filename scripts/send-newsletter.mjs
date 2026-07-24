// Daily newsletter run: build the digest, render the email, deliver it, and
// fan out to the optional integrations. Run by .github/workflows/newsletter.yml.
import { readFile } from "node:fs/promises";
import { createHmac } from "node:crypto";
import { buildPublishedDigest } from "../lib/publishedDigest.js";
import { renderEmailHtml } from "../lib/email.js";
import { postSlack, fetchSponsor, hubspotRecipients, uploadToDrive } from "./integrations.mjs";

const config = JSON.parse(await readFile(new URL("../nexus.config.json", import.meta.url), "utf8"));
const prefs = { zip: config.zip, ratings: config.ratings, leagues: config.leagues };

// The schedule fires at two UTC times (10:15 & 11:15) so that exactly one of
// them is 4:15 AM in Denver year-round despite daylight saving. On a SCHEDULED
// run, proceed only when it's the 4 AM Mountain hour; manual runs always send.
if (process.env.GITHUB_EVENT_NAME === "schedule") {
  const denverHour = Number(
    new Intl.DateTimeFormat("en-US", { timeZone: "America/Denver", hour: "numeric", hour12: false }).format(new Date())
  );
  if (denverHour !== 4) {
    console.log(`Not 4 AM Mountain (Denver hour ${denverHour}) — skipping this scheduled slot.`);
    process.exit(0);
  }
}

console.log("Building digest from published site data…");
const digest = await buildPublishedDigest(prefs, config.siteUrl);

const sponsor = await fetchSponsor();
console.log("Sponsy:", sponsor ? `placement "${sponsor.title}"` : "none");

// Per-recipient one-click unsubscribe link, signed so it can't be forged.
// The worker verifies the same HMAC using HUBSPOT_TOKEN. Falls back to a mailto
// if the worker URL or token isn't set.
const workerBase = (config.localNewsProxy || "").replace(/\/+$/, "");
const signKey = process.env.HUBSPOT_TOKEN || "";
function unsubscribeFor(email) {
  if (!workerBase || !signKey) return config.newsletter?.unsubscribeUrl || "mailto:unsubscribe@arok.ai";
  const t = createHmac("sha256", signKey).update(email.toLowerCase()).digest("hex");
  return `${workerBase}/unsubscribe?e=${encodeURIComponent(email)}&t=${t}`;
}

// ---- Email via Resend ----
const apiKey = process.env.RESEND_API_KEY;
const recipients = [...new Set([config.newsletter?.to, ...(await hubspotRecipients())].filter(Boolean))];

if (!apiKey) {
  console.log("Email: skipped (no RESEND_API_KEY secret)");
} else if (!recipients.length) {
  console.log("Email: skipped (no recipients — set newsletter.to in nexus.config.json or HUBSPOT_* secrets)");
} else {
  const from = config.newsletter?.from || process.env.NEWSLETTER_FROM || "NEXUS <onboarding@resend.dev>";
  // One email per recipient: addresses aren't exposed to each other, and each
  // gets its own signed unsubscribe link.
  let ok = 0;
  let fail = 0;
  for (const to of recipients.slice(0, 200)) {
    const unsubscribeUrl = unsubscribeFor(to);
    const html = renderEmailHtml(digest, { sponsor, siteUrl: config.siteUrl, unsubscribeUrl });
    const headers = unsubscribeUrl.startsWith("http")
      ? { "List-Unsubscribe": `<${unsubscribeUrl}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" }
      : { "List-Unsubscribe": `<${unsubscribeUrl}>` };
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from, to: [to], subject: `Your Daily Brief — ${digest.dateLabel}`, html, headers }),
    });
    if (res.ok) ok++;
    else {
      fail++;
      if (fail <= 2) console.warn(`  email to ${to} failed (${res.status}: ${(await res.text()).slice(0, 120)})`);
    }
  }
  console.log(`Email: sent ${ok}, failed ${fail}`);
}

console.log("Slack:", await postSlack(digest, config));
console.log("Drive:", await uploadToDrive(renderEmailHtml(digest, { sponsor, siteUrl: config.siteUrl }), digest));
console.log("Newsletter run complete.");
