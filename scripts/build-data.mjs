// Fetches every feed and writes static JSON into public/data/, plus a
// rendered newsletter preview at public/newsletter.html.
// Run by GitHub Actions on a schedule; run locally with `npm run data`.
import { mkdir, writeFile, readFile } from "node:fs/promises";
import { TOPICS, SPORTS_LEAGUES } from "../lib/topics.js";
import { fetchFeeds } from "../lib/rss.js";
import { getWeather, getLocalNews, buildDigest } from "../lib/digest.js";
import { renderEmailHtml } from "../lib/email.js";

const OUT = new URL("../public/data/", import.meta.url);
const updatedAt = new Date().toISOString();

// Absolute backstop: if the whole fetch somehow exceeds 5 minutes, exit
// successfully with whatever was written so the build never hangs the runner.
const HARD_CAP = setTimeout(() => {
  console.warn("Data build hit 5-minute cap — exiting with partial data.");
  process.exit(0);
}, 5 * 60 * 1000);
HARD_CAP.unref();

async function readConfig() {
  try {
    return JSON.parse(await readFile(new URL("../nexus.config.json", import.meta.url), "utf8"));
  } catch {
    return {};
  }
}

async function writeJson(name, data) {
  await writeFile(new URL(`${name}.json`, OUT), JSON.stringify({ updatedAt, ...data }));
  console.log(`✓ data/${name}.json`);
}

const config = await readConfig();
await mkdir(OUT, { recursive: true });

const jobs = [];

// Static topics
for (const [key, topic] of Object.entries(TOPICS)) {
  if (!topic.feeds.length) continue;
  jobs.push(fetchFeeds(topic.feeds, 20).then((items) => writeJson(key, { items })));
}

// Every sports league (the browser filters to the visitor's picks)
for (const [key, league] of Object.entries(SPORTS_LEAGUES)) {
  jobs.push(fetchFeeds(league.feeds, 12).then((items) => writeJson(`sports-${key}`, { items })));
}

// Zipcode-driven data
jobs.push(getLocalNews(config.zip, 20).then((d) => writeJson("local", d)));
jobs.push(getWeather(config.zip).then((w) => writeJson("weather", w)));

await Promise.all(jobs);

// Newsletter preview (same renderer the daily email uses)
const digest = await buildDigest({
  zip: config.zip,
  ratings: config.ratings,
  leagues: config.leagues,
});
const html = renderEmailHtml(digest, { siteUrl: config.siteUrl });
await writeFile(new URL("../public/newsletter.html", import.meta.url), html);
console.log("✓ newsletter.html");
console.log("Data build complete.");
