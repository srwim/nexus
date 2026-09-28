// The on-time trigger: Cloudflare's cron pressing "Run workflow" at 4:15 AM
// Denver, because GitHub's own scheduler ran the brief hours late or not at all.
// Tested through the worker's real scheduled() entry point with fetch stubbed.
import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import worker, { dispatchNewsletter } from "./local-news-proxy.js";

const ENV = { GITHUB_DISPATCH_TOKEN: "github_pat_test" };
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
async function fire(iso, env = ENV) {
  const pending = [];
  await worker.scheduled({ scheduledTime: Date.parse(iso), cron: "15 10,11 * * *" }, env, {
    waitUntil: (p) => pending.push(p),
  });
  return Promise.all(pending);
}

test("in summer, the 10:15 UTC firing is 4:15 AM Denver and dispatches", async () => {
  const [result] = await fire("2026-09-28T10:15:00Z");
  assert.equal(result, "dispatched");
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "https://api.github.com/repos/srwim/nexus/actions/workflows/newsletter.yml/dispatches");
  assert.equal(calls[0].method, "POST");
  assert.deepEqual(JSON.parse(calls[0].body), { ref: "main" });
});

test("in summer, the 11:15 UTC firing is 5:15 AM and does nothing", async () => {
  const [result] = await fire("2026-09-28T11:15:00Z");
  assert.match(result, /not 4 AM/);
  assert.equal(calls.length, 0, "exactly one dispatch a day, not two");
});

test("in winter the roles swap, so daylight saving needs no second schedule", async () => {
  assert.equal((await fire("2026-12-15T11:15:00Z"))[0], "dispatched", "11:15 UTC is 4:15 MST");
  calls = [];
  assert.match((await fire("2026-12-15T10:15:00Z"))[0], /not 4 AM/, "10:15 UTC is 3:15 MST");
  assert.equal(calls.length, 0);
});

test("the token goes to GitHub as a bearer credential, with the headers GitHub requires", async () => {
  await fire("2026-09-28T10:15:00Z");
  const h = calls[0].headers;
  assert.equal(h.authorization, "Bearer github_pat_test");
  assert.equal(h.accept, "application/vnd.github+json");
  assert.ok(h["user-agent"], "GitHub rejects API calls without a User-Agent");
});

test("without a token it does nothing and says so, leaving GitHub's schedule in charge", async () => {
  const warnings = [];
  const realWarn = console.warn;
  console.warn = (...a) => warnings.push(a.join(" "));
  try {
    const [result] = await fire("2026-09-28T10:15:00Z", {});
    assert.equal(result, "skipped: no token");
  } finally {
    console.warn = realWarn;
  }
  assert.equal(calls.length, 0);
  assert.ok(warnings.some((w) => /GITHUB_DISPATCH_TOKEN not set/.test(w)));
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
    assert.equal(await dispatchNewsletter(ENV, new Date("2026-09-28T10:15:00Z")), "failed: network");
  } finally {
    console.warn = realWarn;
  }
});

test("the HTTP routes are untouched by adding a scheduled handler", async () => {
  const res = await worker.fetch(new Request("https://w.example/?zip=abc"), {});
  assert.equal(res.status, 400, "local news still validates its zip");
});
