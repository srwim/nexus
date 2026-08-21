// Fetches every feed and writes static JSON into public/data/, plus a
// rendered newsletter preview at public/newsletter.html.
// Run by GitHub Actions on a schedule; run locally with `npm run data`.
import { mkdir, writeFile, readFile } from "node:fs/promises";
import { TOPICS, SPORTS_LEAGUES } from "../lib/topics.js";
import { fetchFeeds } from "../lib/rss.js";
import { fetchLeagueLive } from "../lib/sportsLive.js";
import { COUNTRIES } from "../lib/foreign.js";
import { cacheFromPublished, pendingStrings, applyTranslations, translatePending } from "./translate.mjs";
import { publisherOf } from "../lib/rank.js";
import { filterStale } from "../lib/text.js";
import { getWeather, getLocalNews } from "../lib/digest.js";
import { digestFromData } from "../lib/publishedDigest.js";
import { semanticDedupe, report as dedupReport } from "../lib/semantic.js";
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

// The previous build's output, read back from the live site. CI starts from a
// clean checkout every run, so the published file is the only thing that
// survives between builds — which makes it the natural translation cache.
async function readPublished(name) {
  const base = String(config.siteUrl || "").replace(/\/?$/, "/");
  if (base === "/") return null;
  try {
    const res = await fetch(`${base}data/${name}.json?t=${Date.now()}`, { cache: "no-store" });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

async function writeJson(name, data) {
  await writeFile(new URL(`${name}.json`, OUT), JSON.stringify({ updatedAt, ...data }));
  console.log(`✓ data/${name}.json`);
}

const config = await readConfig();
await mkdir(OUT, { recursive: true });

const jobs = [];
const secs = (t) => `${((Date.now() - t) / 1000).toFixed(1)}s`;

// One line of the publisher-mix report. A section drawing on one or two outlets
// is the failure this exists to catch — Gaming was 8-for-8 Polygon before anyone
// noticed, because a feed that returns nothing looks identical to a feed that
// simply had no news.
function logMix(name, items, feedCount) {
  const by = new Map();
  for (const it of items) {
    const p = publisherOf(it);
    by.set(p, (by.get(p) || 0) + 1);
  }
  const ranked = [...by.entries()].sort((a, b) => b[1] - a[1]);
  const silent = feedCount - ranked.length;
  const top = ranked[0]?.[1] || 0;
  const warn = ranked.length <= 2 ? "  ⚠ THIN" : top / (items.length || 1) > 0.6 ? "  ⚠ DOMINATED" : "";
  console.log(
    `  ${name.padEnd(10)} ${String(ranked.length).padStart(2)} publishers${silent > 0 ? `, ${silent} feed(s) silent` : ""}${warn}`
  );
  console.log(`             ${ranked.map(([p, n]) => `${p}(${n})`).join(" ")}`);
}

// Sports is prebuilt per league into a single sports.json. It used to be fetched
// live in the browser, which limited it to ESPN — publisher RSS is not
// CORS-enabled, so Autosport and the rest can only be reached from the build.
const tSports = Date.now();
const leagueKeys = Object.keys(SPORTS_LEAGUES);
const leagueItems = await Promise.all(leagueKeys.map((k) => fetchLeagueLive(k, 12)));
console.log(`⏱ fetched ${leagueKeys.length} sports leagues in ${secs(tSports)}`);
console.log("\nLeague mix:");
leagueKeys.forEach((k, i) => {
  // +1 for ESPN, which is a source like any other from the reader's side.
  logMix(k, leagueItems[i], (SPORTS_LEAGUES[k].feeds?.length || 0) + (SPORTS_LEAGUES[k].espn ? 1 : 0));
});
jobs.push(writeJson("sports", { leagues: Object.fromEntries(leagueKeys.map((k, i) => [k, leagueItems[i]])) }));

// Foreign Reporting: native-language feeds, translated at build time. The last
// published foreign.json doubles as the translation cache, so a warm build only
// pays for headlines it has never seen.
const tForeign = Date.now();
const countryKeys = Object.keys(COUNTRIES);
const foreignLists = await Promise.all(
  // keepUndated: foreign publishers localise their date strings, and dropping
  // what Date.parse can't read would remove whole countries from the section.
  countryKeys.map((c) =>
    fetchFeeds(COUNTRIES[c].feeds, 14).then((items) => filterStale(items, 4, Date.now(), { keepUndated: true }))
  )
);
const byCountry = Object.fromEntries(
  countryKeys.map((c, i) => [c, { lang: COUNTRIES[c].lang, items: foreignLists[i] }])
);
console.log(`⏱ fetched ${countryKeys.length} countries in ${secs(tForeign)}`);
console.log("\nForeign mix:");
countryKeys.forEach((c, i) => logMix(c, foreignLists[i], COUNTRIES[c].feeds.length));

const priorForeign = await readPublished("foreign");
const translationCache = cacheFromPublished(priorForeign);
const pending = pendingStrings(byCountry, translationCache);
const translatedNow = await translatePending(pending, translationCache, {
  endpoint: config.localNewsProxy,
  apiKey: process.env.TRANSLATE_KEY,
});
const foreignItems = applyTranslations(byCountry, translationCache);
const totalForeign = Object.values(foreignItems).reduce((n, l) => n + l.length, 0);
const stillOriginal = Object.values(foreignItems)
  .flat()
  .filter((it) => !it.translated).length;
console.log(
  `  translate: cache ${translationCache.size}, new this run ${translatedNow}, ` +
    `${totalForeign - stillOriginal}/${totalForeign} items in English\n`
);
jobs.push(writeJson("foreign", { countries: foreignItems }));

// Zipcode-driven data (no model needed) runs in parallel with topic fetching.
const [localData, weatherData] = await Promise.all([getLocalNews(config.zip, 20), getWeather(config.zip)]);
jobs.push(writeJson("local", localData));
jobs.push(writeJson("weather", weatherData));

// Static topics: fetch all feeds in parallel, then run semantic de-dup
// SEQUENTIALLY so the single embedding model is reused (and never overlapped).
const topicEntries = Object.entries(TOPICS).filter(([, t]) => t.feeds.length);

const tFetch = Date.now();
const fetched = await Promise.all(
  topicEntries.map(([key, topic]) => fetchFeeds(topic.feeds, 20).then((items) => [key, items]))
);
console.log(`⏱ fetched ${topicEntries.length} topics in ${secs(tFetch)}`);

console.log("\nPublisher mix:");
for (const [key, items] of fetched) logMix(key, items, TOPICS[key].feeds.length);
console.log("");

const tDedup = Date.now();
const pool = {
  local: localData,
  weather: weatherData,
  sports: { leagues: Object.fromEntries(leagueKeys.map((k, i) => [k, leagueItems[i]])) },
  foreign: { countries: foreignItems },
};
for (const [key, items] of fetched) {
  const deduped = await semanticDedupe(items, key);
  if (deduped.length < items.length) {
    console.log(`  semantic dedup: ${key} ${items.length} → ${deduped.length}`);
  }
  pool[key] = { items: deduped };
  jobs.push(writeJson(key, { items: deduped }));
}
console.log(`⏱ semantic dedup in ${secs(tDedup)}`);

// Publish the tuning telemetry so thresholds can be set from real scores.
jobs.push(writeJson("_dedup-report", { pairs: dedupReport }));

await Promise.all(jobs);

// Newsletter preview, ranked from the data this run just built rather than
// re-fetched. Same ranking function the real send uses, so the preview is the
// email — and it costs nothing, where the old path re-fetched every feed and
// would have shown an empty Foreign Reporting section (translations only exist
// in the prebuilt file).
const tPreview = Date.now();
const digest = digestFromData(pool, {
  zip: config.zip,
  ratings: config.ratings,
  leagues: config.leagues,
  countries: config.countries,
});
// Both themes are published so Settings → Preview Newsletter can open the one
// matching the reader's own choice (the static site can't render per-visitor).
for (const [file, theme] of [
  ["newsletter.html", "light"],
  ["newsletter-dark.html", "dark"],
]) {
  await writeFile(
    new URL(`../public/${file}`, import.meta.url),
    renderEmailHtml(digest, { siteUrl: config.siteUrl, theme })
  );
}
console.log(`✓ newsletter.html + newsletter-dark.html (${secs(tPreview)})`);
console.log("Data build complete.");
