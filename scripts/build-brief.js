// Build today's brief, and stop. Sending is a separate job behind the gate.
//
// Writes two files for the workflow to carry forward:
//   brief.json: digest + sponsors, consumed by send-newsletter.mjs
//   brief.html: rendered preview, uploaded as the artifact a reviewer reads
//                before approving the send
//
// Splitting build from send is what makes the gate meaningful: the content
// decision is made, frozen, and inspectable before anything is mailed.
import { readFile, writeFile } from "node:fs/promises";
import { buildPublishedDigest } from "../lib/publishedDigest.js";
import { renderEmailHtml } from "../lib/email.js";
import { resolveSponsors, describeSponsors } from "../lib/sponsors.js";
import { fetchSponsors } from "./integrations.mjs";

const config = JSON.parse(await readFile(new URL("../nexus.config.json", import.meta.url), "utf8"));
const sponsorData = await readFile(new URL("../sponsors.json", import.meta.url), "utf8")
  .then(JSON.parse)
  .catch(() => ({ campaigns: [] })); // no sponsors file is a valid state, not an error
// countries belongs here too: this brief is the one that ships, so anything
// missing from these prefs is missing from the mail no matter what the send does.
const prefs = { zip: config.zip, ratings: config.ratings, leagues: config.leagues, countries: config.countries };

// Same 4-8 AM Denver window the send used to enforce, moved to the front of the
// pipeline so an out-of-window slot costs one cheap job instead of building a
// brief and raising an approval request nobody asked for.
if (process.env.GITHUB_EVENT_NAME === "schedule") {
  const hour = Number(
    new Intl.DateTimeFormat("en-US", { timeZone: "America/Denver", hour: "numeric", hour12: false }).format(new Date())
  );
  if (hour < 4 || hour > 8) {
    console.log(`Denver hour ${hour} is outside the 4-8 AM window: skipping.`);
    if (process.env.GITHUB_OUTPUT) await writeFile(process.env.GITHUB_OUTPUT, "skip=true\n", { flag: "a" });
    process.exit(0);
  }
}

const envTheme = String(process.env.NEWSLETTER_THEME || "").toLowerCase();
const theme =
  envTheme === "dark" || envTheme === "light" ? envTheme : config.theme === "dark" ? "dark" : "light";

const denverDate = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Denver" }).format(new Date());
const digest = await buildPublishedDigest(prefs, config.siteUrl);
// Same resolver the send uses. Calling the Sponsy fetcher directly here is what
// silently emptied every placement; see lib/sponsors.js.
const sponsors = await resolveSponsors(sponsorData, denverDate, {
  trackBase: config.localNewsProxy,
  fetchSponsy: fetchSponsors,
});

await writeFile(
  new URL("../brief.json", import.meta.url),
  JSON.stringify({ generated_at: new Date().toISOString(), theme, digest, sponsors }, null, 2)
);
await writeFile(
  new URL("../brief.html", import.meta.url),
  renderEmailHtml(digest, { sponsors, theme, siteUrl: config.siteUrl })
);

const items = digest.sections.reduce((n, s) => n + (s.items?.length || 0), 0);
console.log(`Brief: ${digest.sections.length} sections, ${items} items, theme ${theme}`);
console.log("Sponsors:", describeSponsors(sponsors));
