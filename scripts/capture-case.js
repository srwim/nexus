// Snapshot a live run of the published feed data into an unlabeled eval case.
//
// public/data/*.json is gitignored and rewritten every 30 minutes by the site
// build, so nothing is recoverable after the fact — a case can only be captured
// while its data is live. Run this whenever a day's news is worth grading.
//
//   node scripts/capture-case.js            # capture from the published site
//   node scripts/capture-case.js --local    # capture from ./public/data instead
//
// Writes evals/cases/<id>.json with empty labels for hand-labeling. Every topic
// is captured regardless of its star rating, so one case can be re-scored under
// different star configs later.
import { mkdir, writeFile, readFile } from "node:fs/promises";
import { TOPICS } from "../lib/topics.js";
import { fetchSportsLive } from "../lib/sportsLive.js";

const CASES = new URL("../evals/cases/", import.meta.url);
const local = process.argv.includes("--local");
const config = JSON.parse(await readFile(new URL("../nexus.config.json", import.meta.url), "utf8"));
const base = String(config.siteUrl || "").replace(/\/?$/, "/");

async function readTopic(key) {
  try {
    if (local) return JSON.parse(await readFile(new URL(`../public/data/${key}.json`, import.meta.url), "utf8"));
    const res = await fetch(`${base}data/${key}.json`, { cache: "no-store" });
    return res.ok ? await res.json() : null;
  } catch {
    return null;
  }
}

// Sports never lands in public/data — it's fetched live from ESPN by both the
// browser and the newsletter — so snapshot it here too, or replaying a case
// would silently drop a whole section.
const keys = Object.keys(TOPICS).filter((k) => k !== "sports");
const entries = await Promise.all(keys.map(async (k) => [k, await readTopic(k)]));
const data = Object.fromEntries(entries.filter(([, v]) => v));
const sports = await fetchSportsLive(config.leagues, 20);
if (sports.length) data.sports = { updatedAt: new Date().toISOString(), items: sports };

const id = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19) + "Z";
const itemCount = Object.values(data).reduce((n, d) => n + (d.items?.length || 0), 0);

const kase = {
  id,
  captured_at: new Date().toISOString(),
  source: local ? "local public/data" : base,
  // Frozen star config. Editable per-case to grade the same news differently.
  config: { zip: config.zip || "", ratings: config.ratings, leagues: config.leagues },
  data,
  // Hand labels — identify items by their `link`, which is unique and stable.
  //   must_include: links that MUST appear in the brief (drives recall)
  //   must_exclude: links that must NOT appear — off-topic, spam, duplicate
  //                 (any violation is a hard failure)
  labels: { must_include: [], must_exclude: [] },
};

await mkdir(CASES, { recursive: true });
const out = new URL(`${id}.json`, CASES);
await writeFile(out, JSON.stringify(kase, null, 2));

console.log(`Captured ${Object.keys(data).length} topics, ${itemCount} items → evals/cases/${id}.json`);
console.log(`Label it by adding item links to labels.must_include / labels.must_exclude.`);
