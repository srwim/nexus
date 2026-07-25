// Run every labeled case through the real selection logic and score it.
//
//   node evals/run.js --no-rubric   # deterministic only: free, no API key
//   node evals/run.js               # also attempts the rubric metric
//
// Exits non-zero on any must-exclude violation. Recall is reported, not gated —
// a missed item is a judgment call worth reviewing, a forbidden item is a bug.
import { readdir, readFile, mkdir, writeFile } from "node:fs/promises";
import { execSync } from "node:child_process";
import { rankFromData } from "../lib/rank.js";
import { scoreCase, aggregate } from "./score.js";

const CASES = new URL("cases/", import.meta.url);
const RESULTS = new URL("results/", import.meta.url);
const noRubric = process.argv.includes("--no-rubric");

const pct = (v) => (v === null ? "  —  " : `${(v * 100).toFixed(0).padStart(3)}%`);
const sha = () => {
  try {
    return execSync("git rev-parse --short HEAD", { encoding: "utf8" }).trim();
  } catch {
    return "local";
  }
};

const files = (await readdir(CASES).catch(() => [])).filter((f) => f.endsWith(".json"));
if (!files.length) {
  console.error("No cases in evals/cases/. Run the 'Capture eval case' workflow first.");
  process.exit(1);
}

const results = [];
for (const file of files.sort()) {
  const kase = JSON.parse(await readFile(new URL(file, CASES), "utf8"));
  results.push(scoreCase(kase, rankFromData(kase.data, kase.config)));
}

const agg = aggregate(results);

console.log("\ncase                      items  recall  hit/lbl  violations");
console.log("─".repeat(62));
for (const r of results) {
  const flag = r.violations.length ? ` ✗ ${r.violations.length}` : "  0";
  console.log(
    `${r.id.padEnd(24)}  ${String(r.selected).padStart(5)}  ${pct(r.recall)}  ` +
      `${`${r.hit}/${r.labeled}`.padStart(7)}  ${flag}`
  );
}
console.log("─".repeat(62));
console.log(
  `${`${agg.cases} case(s), ${agg.scored} labeled`.padEnd(24)}         ${pct(agg.recall)}` +
    `           ${agg.violations ? `✗ ${agg.violations}` : "0"}\n`
);

for (const r of results.filter((x) => x.violations.length)) {
  console.error(`must-exclude violated in ${r.id}:`);
  r.violations.forEach((l) => console.error(`  ${l}`));
}

// ponytail: rubric metric needs a model call and ANTHROPIC_API_KEY, neither of
// which exist yet — the flag and the branch are here so wiring it later is a
// drop-in, not a refactor. Deterministic metrics never depend on it.
if (!noRubric) {
  console.log("rubric: not wired (needs ANTHROPIC_API_KEY). Use --no-rubric to silence.\n");
}

await mkdir(RESULTS, { recursive: true });
await writeFile(
  new URL(`${sha()}.json`, RESULTS),
  JSON.stringify({ sha: sha(), ran_at: new Date().toISOString(), aggregate: agg, cases: results }, null, 2)
);

process.exit(agg.violations ? 1 : 0);
