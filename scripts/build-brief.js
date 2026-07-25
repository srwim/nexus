// Build today's brief, and stop. Sending is a separate job behind the gate.
//
// Writes two files for the workflow to carry forward:
//   brief.json — digest + sponsors, consumed by send-newsletter.mjs
//   brief.html — rendered preview, uploaded as the artifact a reviewer reads
//                before approving the send
//
// Splitting build from send is what makes the gate meaningful: the content
// decision is made, frozen, and inspectable before anything is mailed.
import { readFile, writeFile } from "node:fs/promises";
import { buildPublishedDigest } from "../lib/publishedDigest.js";
import { renderEmailHtml } from "../lib/email.js";
import { fetchSponsors } from "./integrations.mjs";

const config = JSON.parse(await readFile(new URL("../nexus.config.json", import.meta.url), "utf8"));
const prefs = { zip: config.zip, ratings: config.ratings, leagues: config.leagues };

// Same 4-8 AM Denver window the send used to enforce, moved to the front of the
// pipeline so an out-of-window slot costs one cheap job instead of building a
// brief and raising an approval request nobody asked for.
if (process.env.GITHUB_EVENT_NAME === "schedule") {
  const hour = Number(
    new Intl.DateTimeFormat("en-US", { timeZone: "America/Denver", hour: "numeric", hour12: false }).format(new Date())
  );
  if (hour < 4 || hour > 8) {
    console.log(`Denver hour ${hour} is outside the 4-8 AM window — skipping.`);
    if (process.env.GITHUB_OUTPUT) await writeFile(process.env.GITHUB_OUTPUT, "skip=true\n", { flag: "a" });
    process.exit(0);
  }
}

const envTheme = String(process.env.NEWSLETTER_THEME || "").toLowerCase();
const theme =
  envTheme === "dark" || envTheme === "light" ? envTheme : config.theme === "dark" ? "dark" : "light";

const digest = await buildPublishedDigest(prefs, config.siteUrl);
const sponsors = await fetchSponsors();

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
console.log(
  "Sponsy:",
  ["top", "primary", "footer"].map((k) => `${k}=${sponsors[k] ? `"${sponsors[k].title}"` : "—"}`).join(" ")
);
