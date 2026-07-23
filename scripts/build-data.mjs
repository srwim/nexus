// Fetches every feed and writes static JSON into public/data/, plus a
// rendered newsletter preview at public/newsletter.html.
// Run by GitHub Actions on a schedule; run locally with `npm run data`.
import { mkdir, writeFile, readFile } from "node:fs/promises";
import { TOPICS } from "../lib/topics.js";
import { fetchFeeds } from "../lib/rss.js";
import { getWeather, getLocalNews, buildDigest } from "../lib/digest.js";
import { semanticDedupe } from "../lib/semantic.js";
import { renderEmailHtml } from "../lib/email.js";

const OUT = new URL("../public/data/", import.meta.url);
const updatedAt = new Date().toISOString();

// Absolute backstop: if the whole run somehow exceeds 12 minutes, exit
// successfully with whatever was written so the build never hangs the runner.
// The first (cold-cache) build downloads the model and embeds every headline;
// warm builds only embed new ones and finish in a couple of minutes. Job
// timeout is 15 minutes.
const HARD_CAP = setTimeout(() => {
  console.warn("Data build hit 12-minute cap — exiting with partial data.");
  process.exit(0);
}, 12 * 60 * 1000);
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

// Sports is fetched live in the browser from the ESPN JSON API (lib/espn.js),
// so nothing to prebuild here.

// Zipcode-driven data (no model needed) runs in parallel with topic fetching.
jobs.push(getLocalNews(config.zip, 20).then((d) => writeJson("local", d)));
jobs.push(getWeather(config.zip).then((w) => writeJson("weather", w)));

// Static topics: fetch all feeds in parallel, then run semantic de-dup
// SEQUENTIALLY so the single embedding model is reused (and never overlapped).
const topicEntries = Object.entries(TOPICS).filter(([, t]) => t.feeds.length);
const fetched = await Promise.all(
  topicEntries.map(([key, topic]) => fetchFeeds(topic.feeds, 20).then((items) => [key, items]))
);
for (const [key, items] of fetched) {
  const deduped = await semanticDedupe(items, key);
  if (deduped.length < items.length) {
    console.log(`  semantic dedup: ${key} ${items.length} → ${deduped.length}`);
  }
  jobs.push(writeJson(key, { items: deduped }));
}

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
