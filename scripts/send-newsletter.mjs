// Daily newsletter run: build the digest, render the email, deliver it, and
// fan out to the optional integrations. Run by .github/workflows/newsletter.yml.
import { readFile } from "node:fs/promises";
import { createHmac } from "node:crypto";
import { buildPublishedDigest } from "../lib/publishedDigest.js";
import { renderEmailHtml } from "../lib/email.js";
import { postSlack, fetchSponsors, hubspotRecipients, uploadToDrive } from "./integrations.mjs";

const config = JSON.parse(await readFile(new URL("../nexus.config.json", import.meta.url), "utf8"));
const prefs = { zip: config.zip, ratings: config.ratings, leagues: config.leagues };

// The schedule fires at two UTC times (10:15 & 11:15) so one of them is 4:15 AM
// in Denver year-round despite daylight saving. GitHub's scheduled runs are
// best-effort though — they get delayed and sometimes dropped entirely — so we
// accept ANY slot in the 4-8 AM Denver window instead of demanding hour === 4.
// (An exact-hour guard meant a dropped 4 AM slot = no newsletter that day.)
// Sending twice is prevented by the per-day Idempotency-Key below, not by the
// clock. Manual runs always send.
const denverDate = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Denver" }).format(new Date());
if (process.env.GITHUB_EVENT_NAME === "schedule") {
  const denverHour = Number(
    new Intl.DateTimeFormat("en-US", { timeZone: "America/Denver", hour: "numeric", hour12: false }).format(new Date())
  );
  if (denverHour < 4 || denverHour > 8) {
    console.log(`Denver hour ${denverHour} is outside the 4-8 AM send window — skipping this slot.`);
    process.exit(0);
  }
}

// Prefer the brief the gate already reviewed. Rebuilding here would mean the
// mail could differ from what was approved — the whole point of the gate is
// that what ships is what a human signed off on.
let prebuilt = null;
try {
  prebuilt = JSON.parse(await readFile(new URL("../brief.json", import.meta.url), "utf8"));
} catch {
  /* no gated brief (manual/local run) — build it fresh below */
}

const digest = prebuilt?.digest ?? (console.log("Building digest from published site data…"), await buildPublishedDigest(prefs, config.siteUrl));
const sponsors = prebuilt?.sponsors ?? (await fetchSponsors({ debug: !!config.dryRun }));
if (prebuilt) console.log(`Using approved brief built at ${prebuilt.generated_at}`);

// Publication default, overridable per run (workflow_dispatch "theme" input)
// for testing without editing nexus.config.json. Individual subscribers can
// still override it via their HubSpot "nexus_theme" property.
const envTheme = String(process.env.NEWSLETTER_THEME || "").toLowerCase();
const defaultTheme =
  envTheme === "dark" || envTheme === "light" ? envTheme : prebuilt?.theme ?? (config.theme === "dark" ? "dark" : "light");
console.log(
  "Sponsy:",
  ["top", "primary", "footer"].map((k) => `${k}=${sponsors[k] ? `"${sponsors[k].title}" -> ${sponsors[k].url || "NO LINK"}` : "—"}`).join(" ")
);

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
// Merge the configured address with the HubSpot list, de-duped by email. List
// entries win because they carry the subscriber's theme preference.
const byEmail = new Map();
if (config.newsletter?.to) byEmail.set(config.newsletter.to.toLowerCase(), { email: config.newsletter.to, theme: null });
for (const person of await hubspotRecipients()) {
  const k = String(person.email || "").toLowerCase();
  if (k) byEmail.set(k, person);
}
const recipients = [...byEmail.values()];
console.log(
  `Recipients: ${recipients
    .map((r) => `${r.email}=${r.theme ? `${r.theme} (own)` : `${defaultTheme} (default)`}`)
    .join(", ")}`
);

// Safety valve: set "dryRun": true in nexus.config.json to build and log the
// whole run without mailing anyone — useful for checking sponsor copy before
// spending a day's idempotency key on a real send.
if (config.dryRun) {
  console.log(
    `DRY RUN — no email sent. Would send to ${recipients.length} recipient(s): ` +
      JSON.stringify(recipients.map((r) => `${r.email}:${r.theme || defaultTheme}`))
  );
} else if (!apiKey) {
  console.log("Email: skipped (no RESEND_API_KEY secret)");
} else if (!recipients.length) {
  console.log("Email: skipped (no recipients — set newsletter.to in nexus.config.json or HUBSPOT_* secrets)");
} else {
  const from = config.newsletter?.from || process.env.NEWSLETTER_FROM || "NEXUS <onboarding@resend.dev>";
  // One email per recipient: addresses aren't exposed to each other, and each
  // gets its own signed unsubscribe link.
  let ok = 0;
  let fail = 0;
  let already = 0;
  for (const person of recipients.slice(0, 200)) {
    const to = person.email;
    const theme = person.theme || defaultTheme; // subscriber preference wins
    const unsubscribeUrl = unsubscribeFor(to);
    const html = renderEmailHtml(digest, { sponsors, theme, siteUrl: config.siteUrl, unsubscribeUrl });
    const headers = unsubscribeUrl.startsWith("http")
      ? { "List-Unsubscribe": `<${unsubscribeUrl}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" }
      : { "List-Unsubscribe": `<${unsubscribeUrl}>` };
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        // One key per recipient per Denver day (Resend keeps keys 24h). If a
        // second scheduled slot fires, Resend rejects the repeat instead of
        // mailing twice — so the window above can stay generous.
        "Idempotency-Key": `nexus-${denverDate}-${to}`,
      },
      body: JSON.stringify({ from, to: [to], subject: `Your Daily Brief — ${digest.dateLabel}`, html, headers }),
    });
    if (res.ok) ok++;
    else if (res.status === 409) already++; // same key today — already sent
    else {
      fail++;
      if (fail <= 2) console.warn(`  email to ${to} failed (${res.status}: ${(await res.text()).slice(0, 120)})`);
    }
  }
  console.log(`Email: sent ${ok}, already sent today ${already}, failed ${fail} (default theme: ${defaultTheme})`);
}

console.log("Slack:", await postSlack(digest, config));
console.log(
  "Drive:",
  await uploadToDrive(renderEmailHtml(digest, { sponsors, theme: defaultTheme, siteUrl: config.siteUrl }), digest)
);
console.log("Newsletter run complete.");
