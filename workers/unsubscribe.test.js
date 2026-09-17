// The unsubscribe route is the one place in this system where a stray HTTP
// request can take something away from a reader, so its method gate and its
// signature check are tested against the real worker rather than a copy.
//
// HubSpot is stubbed via globalThis.fetch: any call reaching it means the
// handler decided to mutate state, which is exactly what these tests measure.
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import worker from "./local-news-proxy.js";

const TOKEN = "test-hubspot-token";
const EMAIL = "reader@example.com";
const BASE = "https://nexus-local.example.workers.dev";

let hubspotCalls = [];
const realFetch = globalThis.fetch;

beforeEach(() => {
  hubspotCalls = [];
  globalThis.fetch = async (url, init) => {
    hubspotCalls.push({ url: String(url), method: init?.method || "GET" });
    return new Response("{}", { status: 200 });
  };
});

// Mirrors hmacHex() in the worker: HMAC-SHA256 of the email under HUBSPOT_TOKEN.
async function sign(email, secret = TOKEN) {
  const { createHmac } = await import("node:crypto");
  return createHmac("sha256", secret).update(email).digest("hex");
}

const call = async (method, { email = EMAIL, token } = {}) => {
  const t = token ?? (await sign(email));
  const url = `${BASE}/unsubscribe?e=${encodeURIComponent(email)}&t=${t}`;
  const res = await worker.fetch(new Request(url, { method }), { HUBSPOT_TOKEN: TOKEN });
  return { res, body: await res.text() };
};

// The regression. Mail scanners, safe-link rewriters and prefetchers GET every
// URL in an email; each of those visits used to unsubscribe the reader.
test("a GET does not unsubscribe anyone", async () => {
  const { res, body } = await call("GET");
  assert.equal(res.status, 200);
  assert.deepEqual(hubspotCalls, [], "a GET must not reach HubSpot at all");
  assert.match(body, /Nothing has changed yet/);
  assert.match(body, /reader@example\.com/, "the page says whose subscription it is");
});

test("the GET page offers a POST form back to the same signed URL", async () => {
  const { body } = await call("GET");
  assert.match(body, /<form method="POST"/);
  assert.match(body, /\/unsubscribe\?e=reader%40example\.com&amp;t=/);
  assert.match(body, /noindex/, "crawlers are told to skip it as well");
});

test("HEAD does not unsubscribe either", async () => {
  await call("HEAD");
  assert.deepEqual(hubspotCalls, [], "HEAD is a read, like GET");
});

test("a POST does unsubscribe — one-click still works", async () => {
  const { res } = await call("POST");
  assert.equal(res.status, 200);
  assert.ok(hubspotCalls.length > 0, "POST is the method that acts");
  assert.match(hubspotCalls[0].url, /unsubscribe-all\?channel=EMAIL/);
  assert.equal(hubspotCalls[0].method, "POST");
});

test("a forged or missing token is rejected before the method is considered", async () => {
  for (const method of ["GET", "POST"]) {
    const { res } = await call(method, { token: "deadbeef" });
    assert.equal(res.status, 400, `${method} with a bad token`);
    assert.deepEqual(hubspotCalls, [], "a bad signature never reaches HubSpot");
  }
});

test("one reader's token cannot unsubscribe another reader", async () => {
  const stolen = await sign("someone-else@example.com");
  const { res } = await call("POST", { email: EMAIL, token: stolen });
  assert.equal(res.status, 400);
  assert.deepEqual(hubspotCalls, []);
});

test("an incomplete link is rejected", async () => {
  const res = await worker.fetch(new Request(`${BASE}/unsubscribe`, { method: "POST" }), { HUBSPOT_TOKEN: TOKEN });
  assert.equal(res.status, 400);
  assert.deepEqual(hubspotCalls, []);
});

test.after(() => {
  globalThis.fetch = realFetch;
});
