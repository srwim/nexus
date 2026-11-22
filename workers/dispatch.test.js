// The on-time triggers: one Cloudflare cron (SCHEDULE) pressing "Run workflow"
// for the site every half hour, and for the newsletter at 4:15 AM Denver,
// because GitHub's own scheduler ran both hours late or not at all.
// Tested through the worker's real scheduled() entry point with fetch stubbed.
import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import worker, { dispatchNewsletter, SCHEDULE } from "./local-news-proxy.js";

const ENV = { GITHUB_DISPATCH_TOKEN: "github_pat_test" };
const SITE = "https://api.github.com/repos/srwim/nexus/actions/workflows/site.yml/dispatches";
const BRIEF = "https://api.github.com/repos/srwim/nexus/actions/workflows/newsletter.yml/dispatches";
let calls;
let reply;
const realFetch = globalThis.fetch;

beforeEach(() => {
  calls = [];
  reply = () => new Response(null, { status: 204 }); // GitHub's success for a dispatch
  globalThis.fetch = async (input, init = {}) => {
    const headers = Object.fromEntries(Object.entries(init.headers || {}).map(([k, v]) => [k.toLowerCase(), v]));
    calls.push({ url: String(input), method: init.method || "GET", headers, body: init.body ? String(init.body) : "" });
    return reply();
  };
});

afterEach(() => {
  globalThis.fetch = realFetch;
});

// Run the worker exactly as Cloudflare would, and wait for the work it queued.
async function fire(iso, env = ENV, cron = SCHEDULE) {
  const pending = [];
  await worker.scheduled({ scheduledTime: Date.parse(iso), cron }, env, {
    waitUntil: (p) => pending.push(p),
  });
  return Promise.all(pending);
}

const urls = () => calls.map((c) => c.url).sort();

test("the schedule is one trigger: the Free plan allows five per account", () => {
  assert.equal(SCHEDULE, "15,45 * * * *");
});

test("every firing builds the site, at any hour of the day", async () => {
  for (const iso of ["2026-11-22T01:15:00Z", "2026-11-22T14:45:00Z", "2026-11-22T20:15:00Z"]) {
    calls = [];
    const [site, brief] = await fire(iso);
    assert.equal(site, "dispatched", iso);
    assert.match(brief, /not 4 AM/, iso);
    assert.deepEqual(urls(), [SITE], iso);
    assert.equal(calls[0].method, "POST");
    assert.deepEqual(JSON.parse(calls[0].body), { ref: "main" });
  }
});

test("in summer, 10:15 UTC is 4:15 AM Denver: site build plus the brief", async () => {
  const results = await fire("2026-09-28T10:15:00Z");
  assert.deepEqual(results, ["dispatched", "dispatched"]);
  assert.deepEqual(urls(), [BRIEF, SITE].sort());
  for (const c of calls) assert.deepEqual(JSON.parse(c.body), { ref: "main" });
});

test("in winter, 11:15 UTC is 4:15 AM MST: daylight saving needs no second schedule", async () => {
  await fire("2026-12-15T11:15:00Z");
  assert.ok(urls().includes(BRIEF), "11:15 UTC is 4:15 MST");
  calls = [];
  await fire("2026-12-15T10:15:00Z");
  assert.deepEqual(urls(), [SITE], "10:15 UTC is 3:15 MST: site only");
});

test("4:45 AM is still the 4 AM hour but sends no second brief", async () => {
  const [, brief] = await fire("2026-09-28T10:45:00Z"); // 4:45 AM MDT
  assert.match(brief, /already ran/);
  assert.deepEqual(urls(), [SITE], "exactly one brief a day, not two");
});

test("a whole day of firings sends exactly one brief", async () => {
  for (let m = 0; m < 24 * 60; m += 30) {
    const t = Date.parse("2026-11-22T00:15:00Z") + m * 60000;
    await fire(new Date(t).toISOString());
  }
  assert.equal(calls.filter((c) => c.url === BRIEF).length, 1);
  assert.equal(calls.filter((c) => c.url === SITE).length, 48);
});

test("a leftover or extra trigger only builds the site; the clock decides the brief", async () => {
  await fire("2026-11-22T15:00:00Z", ENV, "15 10,11 * * *");
  assert.deepEqual(urls(), [SITE]);
});

test("the token goes to GitHub as a bearer credential, with the headers GitHub requires", async () => {
  await fire("2026-09-28T10:15:00Z");
  for (const { headers: h } of calls) {
    assert.equal(h.authorization, "Bearer github_pat_test");
    assert.equal(h.accept, "application/vnd.github+json");
    assert.ok(h["user-agent"], "GitHub rejects API calls without a User-Agent");
  }
});

test("without a token it does nothing and says so, leaving GitHub's schedule in charge", async () => {
  const warnings = [];
  const realWarn = console.warn;
  console.warn = (...a) => warnings.push(a.join(" "));
  try {
    const results = await fire("2026-09-28T10:15:00Z", {});
    assert.deepEqual(results, ["skipped: no token", "skipped: no token"]);
  } finally {
    console.warn = realWarn;
  }
  assert.equal(calls.length, 0);
  assert.ok(warnings.some((w) => w.startsWith("site: GITHUB_DISPATCH_TOKEN not set")));
  assert.ok(warnings.some((w) => w.startsWith("newsletter: GITHUB_DISPATCH_TOKEN not set")));
});

test("a rejected dispatch is logged with GitHub's reason, not swallowed", async () => {
  reply = () => new Response('{"message":"Resource not accessible by personal access token"}', { status: 403 });
  const warnings = [];
  const realWarn = console.warn;
  console.warn = (...a) => warnings.push(a.join(" "));
  try {
    assert.equal(await dispatchNewsletter(ENV, new Date("2026-09-28T10:15:00Z")), "failed: 403");
  } finally {
    console.warn = realWarn;
  }
  assert.ok(warnings.some((w) => /403.*not accessible/.test(w)), "the log names the permission problem");
});

test("a network failure is contained rather than crashing the scheduled event", async () => {
  globalThis.fetch = async () => {
    throw new Error("connection reset");
  };
  const realWarn = console.warn;
  console.warn = () => {};
  try {
    assert.deepEqual(await fire("2026-09-28T10:15:00Z"), ["failed: network", "failed: network"]);
  } finally {
    console.warn = realWarn;
  }
});

test("the HTTP routes are untouched by the scheduled handler", async () => {
  const res = await worker.fetch(new Request("https://w.example/?zip=abc"), {});
  assert.equal(res.status, 400, "local news still validates its zip");
});
