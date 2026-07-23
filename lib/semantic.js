// Optional local semantic de-duplication, used only in the GitHub build.
//
// Loads all-MiniLM-L6-v2 via @xenova/transformers, turns each headline into a
// meaning vector, and drops items whose meaning is near-identical to one already
// kept. Catches "same story, different headline" cases word-matching can't.
//
// Speed: both the model and the per-headline vectors are cached on disk (the
// workflow persists .hf-cache/ and .embed-cache.json between runs), so a warm
// build only embeds headlines it hasn't seen before — a handful per run.
//
// Safety: @xenova/transformers is installed OUTSIDE npm ci as best-effort, and
// every step here is wrapped, so if the model is missing or errors the caller
// gets its input back unchanged. The build and site can never break.
//
// Tuning: MERGE_AT is the cosine cutoff for calling two headlines the same
// story. Every kept item's closest match is logged, and near-misses above
// LOG_AT are flagged, so the real score distribution is visible in the build
// log and the cutoff can be set from data rather than guessed.

import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";

const MERGE_AT = 0.66;
const LOG_AT = 0.45;

const CACHE_PATH = new URL("../.embed-cache.json", import.meta.url);
const MODEL_DIR = new URL("../.hf-cache/", import.meta.url);

let cache = null;
let cacheDirty = false;

async function loadCache() {
  if (cache) return cache;
  try {
    cache = JSON.parse(await readFile(CACHE_PATH, "utf8"));
  } catch {
    cache = {};
  }
  return cache;
}
async function saveCache() {
  if (!cacheDirty) return;
  try {
    await writeFile(CACHE_PATH, JSON.stringify(cache));
  } catch {
    /* cache is an optimization; ignore write failures */
  }
}
function hkey(s) {
  return createHash("sha1").update(String(s || "")).digest("hex").slice(0, 16);
}

let embedderPromise = null;
async function getEmbedder() {
  if (embedderPromise) return embedderPromise;
  embedderPromise = (async () => {
    try {
      const { pipeline, env } = await import("@xenova/transformers");
      env.allowLocalModels = false;
      env.cacheDir = MODEL_DIR.pathname; // persisted across builds by the workflow
      return await pipeline("feature-extraction", "Xenova/all-MiniLM-L6-v2", { quantized: true });
    } catch (e) {
      console.warn("Semantic model unavailable — skipping semantic dedup:", e?.message || e);
      return null;
    }
  })();
  return embedderPromise;
}

function dot(a, b) {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s;
}

// Return normalized vectors for each title, embedding only cache misses.
async function embedTitles(titles) {
  const embed = await getEmbedder();
  if (!embed) return null;
  const c = await loadCache();
  const vecs = [];
  for (const title of titles) {
    const k = hkey(title);
    if (c[k]) {
      vecs.push(c[k]);
      continue;
    }
    const out = await embed(String(title || ""), { pooling: "mean", normalize: true });
    const v = Array.from(out.data, (x) => Math.round(x * 1e4) / 1e4); // 4-dp keeps the cache small
    c[k] = v;
    cacheDirty = true;
    vecs.push(v);
  }
  return vecs;
}

// Remove items whose title is semantically near-identical to an earlier kept
// item. Keeps input order (pre-sort newest-first to keep the freshest).
export async function semanticDedupe(items, label = "") {
  if (!Array.isArray(items) || items.length < 2) return items;
  let vecs;
  try {
    vecs = await embedTitles(items.map((i) => i.title));
  } catch (e) {
    console.warn("Semantic embed errored — using lexical result:", e?.message || e);
    return items;
  }
  if (!vecs) return items;

  const keptVecs = [];
  const out = [];
  for (let i = 0; i < items.length; i++) {
    let best = 0;
    for (const kv of keptVecs) {
      const s = dot(kv, vecs[i]);
      if (s > best) best = s;
      if (best >= MERGE_AT) break;
    }
    const t = items[i].title.slice(0, 48);
    if (best >= MERGE_AT) {
      console.log(`  [dup ${best.toFixed(2)}] ${label}: "${t}"`);
      continue;
    }
    if (best >= LOG_AT) console.log(`  [near ${best.toFixed(2)}] ${label}: "${t}"`);
    keptVecs.push(vecs[i]);
    out.push(items[i]);
  }
  await saveCache();
  return out;
}
