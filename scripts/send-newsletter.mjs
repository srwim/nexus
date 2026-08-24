// Daily newsletter run: build the digest, render the email, deliver it, and
// fan out to the optional integrations. Run by .github/workflows/newsletter.yml.
import { readFile } from "node:fs/promises";
import { createHmac } from "node:crypto";
import { fetchPublishedData, digestFromData } from "../lib/publishedDigest.js";
import { getLocalNews, getWeather } from "../lib/digest.js";
import { prefsSignature } from "../lib/prefsPayload.js";
import { selectSponsors, mergeSponsors, describeSponsors } from "../lib/sponsors.js";
import { renderEmailHtml } from "../lib/email.js";
import { postSlack, fetchSponsors, hubspotRecipients, uploadToDrive } from "./integrations.mjs";

const config = JSON.parse(await readFile(new URL("../nexus.config.json", import.meta.url), "utf8"));
const sponsorData = await readFile(new URL("../sponsors.json", import.meta.url), "utf8")
  .then(JSON.parse)
  .catch(() => ({ campaigns: [] })); // no sponsors file is a valid state, not an error
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

// The published pool, fetched at most once per run and shared by every
// subscriber's digest. Lazy: a run where nobody has personalized settings and a
// gated brief already exists never touches the network for it.
let poolPromise = null;
const pool = () => (poolPromise ??= (console.log("Reading published site data…"), fetchPublishedData(config.siteUrl)));

const digest = prebuilt?.digest ?? (await digestFromData(await pool(), prefs));
if (prebuilt) console.log(`Using approved brief built at ${prebuilt.generated_at}`);

// Sponsors come from sponsors.json in the repo. Sponsy is still supported for
// anyone who wants it, but it is off unless enableSponsy is set — and it can
// only fill placements nobody has bought locally.
let sponsors = prebuilt?.sponsors ?? selectSponsors(sponsorData, denverDate);
if (!prebuilt?.sponsors && sponsorData?.enableSponsy) {
  sponsors = mergeSponsors(sponsors, await fetchSponsors({ debug: !!config.dryRun }), sponsorData, denverDate);
}

// Publication default, overridable per run (workflow_dispatch "theme" input)
// for testing without editing nexus.config.json. Individual subscribers can
// still override it via their HubSpot "nexus_theme" property.
const envTheme = String(process.env.NEWSLETTER_THEME || "").toLowerCase();
const defaultTheme =
  envTheme === "dark" || envTheme === "light" ? envTheme : prebuilt?.theme ?? (config.theme === "dark" ? "dark" : "light");
console.log("Sponsors:", describeSponsors(sponsors));

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
// CAN-SPAM assesses penalties per email sent, not per campaign, so a missing
// postal address is a compounding exposure rather than a cosmetic gap. Loud on
// purpose: this is easy to forget and expensive to forget.
if (!config.newsletter?.postalAddress) {
  console.warn(
    "\n⚠ newsletter.postalAddress is empty in nexus.config.json.\n" +
      "  Every commercial email must carry the sender's own valid postal address\n" +
      "  (street, USPS-registered PO box, or CMRA mailbox). Set it before sending.\n"
  );
}
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
    .map(
      (r) =>
        `${r.email}=${r.theme ? `${r.theme} (own)` : `${defaultTheme} (default)`}${r.prefs ? " +settings" : ""}`
    )
    .join(", ")}`
);

// ---- Per-subscriber briefs ----
// A reader who synced their settings gets a brief ranked from THEIR ratings,
// leagues and zipcode. This is the fix for briefs that ignored what the reader
// had chosen on the site: there used to be one digest built from
// nexus.config.json and everybody got it.
//
// One digest per distinct settings signature rather than per person, and the
// published pool is fetched once for all of them.
//
// ponytail: the autonomy gate reviews the default brief only. A personalized
// brief re-ranks that same reviewed pool, so it cannot surface a story the gate
// never saw — per-recipient gating was explicitly out of scope.
const digestCache = new Map();
const zipCache = new Map();

// Local news and weather in the published pool are built for the publication's
// own zipcode. A subscriber with a different one needs those two fetched for
// them — cached by zipcode, so a hundred readers in the same town cost one call.
async function dataForZip(zip) {
  const base = await pool();
  if (!zip || zip === (config.zip || "")) return base;
  if (!zipCache.has(zip)) {
    zipCache.set(
      zip,
      (async () => {
        const [local, weather] = await Promise.all([getLocalNews(zip, 20), getWeather(zip)]);
        return { ...base, local, weather };
      })()
    );
  }
  return zipCache.get(zip);
}

async function digestFor(person) {
  if (!person.prefs) return digest; // publication default (gated, if a brief exists)
  const sig = prefsSignature(person.prefs);
  if (!digestCache.has(sig)) {
    digestCache.set(
      sig,
      (async () => digestFromData(await dataForZip(person.prefs.zip), person.prefs))()
    );
  }
  return digestCache.get(sig);
}

// Safety valve: set "dryRun": true in nexus.config.json to build and log the
// whole run without mailing anyone — useful for checking sponsor copy before
// spending a day's idempotency key on a real send.
if (config.dryRun) {
  // Build each brief anyway and print its shape — a dry run that skipped the
  // personalization couldn't tell you whether the personalization works.
  console.log(`DRY RUN — no email sent. ${recipients.length} recipient(s):`);
  for (const person of recipients) {
    const brief = await digestFor(person);
    const shape = brief.sections
      .map((s) => `${s.label}(${s.type === "news" ? s.items?.length ?? 0 : s.type})`)
      .join(" ");
    console.log(
      `  ${person.email}  theme=${person.theme || defaultTheme}  settings=${person.prefs ? "own" : "default"}`
    );
    console.log(`    ${shape}`);
  }
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
    const brief = await digestFor(person);
    const unsubscribeUrl = unsubscribeFor(to);
    const html = renderEmailHtml(brief, {
      sponsors,
      theme,
      siteUrl: config.siteUrl,
      unsubscribeUrl,
      postalAddress: config.newsletter?.postalAddress,
    });
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
  console.log(
    `Email: sent ${ok}, already sent today ${already}, failed ${fail} ` +
      `(default theme: ${defaultTheme}; ${digestCache.size} personalized brief(s) built)`
  );
}

console.log("Slack:", await postSlack(digest, config));
console.log(
  "Drive:",
  await uploadToDrive(renderEmailHtml(digest, { sponsors, theme: defaultTheme, siteUrl: config.siteUrl }), digest)
);
console.log("Newsletter run complete.");
