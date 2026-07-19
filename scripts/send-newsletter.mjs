// Daily newsletter run: build the digest, render the email, deliver it, and
// fan out to the optional integrations. Run by .github/workflows/newsletter.yml.
import { readFile } from "node:fs/promises";
import { buildDigest } from "../lib/digest.js";
import { renderEmailHtml } from "../lib/email.js";
import { postSlack, fetchSponsor, hubspotRecipients, uploadToDrive } from "./integrations.mjs";

const config = JSON.parse(await readFile(new URL("../nexus.config.json", import.meta.url), "utf8"));
const prefs = { zip: config.zip, ratings: config.ratings, leagues: config.leagues };

console.log("Building digest…");
const digest = await buildDigest(prefs);

const sponsor = await fetchSponsor();
console.log("Sponsy:", sponsor ? `placement "${sponsor.title}"` : "none");

const html = renderEmailHtml(digest, { sponsor, siteUrl: config.siteUrl });

// ---- Email via Resend ----
const apiKey = process.env.RESEND_API_KEY;
const recipients = [...new Set([config.newsletter?.to, ...(await hubspotRecipients())].filter(Boolean))];

if (!apiKey) {
  console.log("Email: skipped (no RESEND_API_KEY secret)");
} else if (!recipients.length) {
  console.log("Email: skipped (no recipients — set newsletter.to in nexus.config.json or HUBSPOT_* secrets)");
} else {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: process.env.NEWSLETTER_FROM || "NEXUS <onboarding@resend.dev>",
      to: recipients.slice(0, 50),
      subject: `Your Daily Brief — ${digest.dateLabel}`,
      html,
    }),
  });
  console.log(`Email: ${res.ok ? `sent to ${recipients.length} recipient(s)` : `failed (${res.status}: ${await res.text()})`}`);
}

console.log("Slack:", await postSlack(digest, config));
console.log("Drive:", await uploadToDrive(html, digest));
console.log("Newsletter run complete.");
