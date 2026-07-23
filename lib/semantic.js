// Optional local semantic de-duplication, used only in the GitHub build.
//
// It loads a small sentence-embedding model (all-MiniLM-L6-v2, ~23MB) via
// @xenova/transformers, turns each headline into a meaning vector, and drops
// items whose meaning is near-identical to one already kept — catching "same
// story, different headline" cases that word-matching can't (three Tesla
// earnings write-ups, "Bears Ears" vs "Trump's monument order", etc.).
//
// Entirely best-effort: @xenova/transformers is an OPTIONAL dependency, and
// every step here is wrapped so that if the model isn't installed or fails to
// run, callers get their input back unchanged. The build and site can never
// break because of it.

let embedderPromise = null;

async function getEmbedder() {
  if (embedderPromise) return embedderPromise;
  embedderPromise = (async () => {
    try {
      const { pipeline, env } = await import("@xenova/transformers");
      env.allowLocalModels = false; // fetch the model from the hub
      return await pipeline("feature-extraction", "Xenova/all-MiniLM-L6-v2", { quantized: true });
    } catch (e) {
      console.warn("Semantic model unavailable — skipping semantic dedup:", e?.message || e);
      return null;
    }
  })();
  return embedderPromise;
}

// Dot product; on L2-normalized vectors this equals cosine similarity.
function dot(a, b) {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s;
}

// Greedy near-duplicate removal given parallel arrays of items and their
// normalized vectors. Pure and testable.
export function greedyByVector(items, vecs, threshold) {
  const keptVecs = [];
  const out = [];
  for (let i = 0; i < items.length; i++) {
    if (keptVecs.some((v) => dot(v, vecs[i]) >= threshold)) continue;
    keptVecs.push(vecs[i]);
    out.push(items[i]);
  }
  return out;
}

// Remove items whose title is semantically near-identical to an earlier kept
// item. Keeps input order (so pre-sorting newest-first keeps the freshest).
export async function semanticDedupe(items, threshold = 0.7) {
  if (!Array.isArray(items) || items.length < 2) return items;
  const embed = await getEmbedder();
  if (!embed) return items; // graceful fallback to whatever lexical dedup produced
  try {
    const vecs = [];
    for (const it of items) {
      const out = await embed(String(it.title || ""), { pooling: "mean", normalize: true });
      vecs.push(Array.from(out.data));
    }
    return greedyByVector(items, vecs, threshold);
  } catch (e) {
    console.warn("Semantic dedup errored — using lexical result:", e?.message || e);
    return items;
  }
}
