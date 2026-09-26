// Returning subscribers: the double opt-in that lets someone who unsubscribed
// come back, without letting anyone else bring them back.
//
// Tested against the real worker. HubSpot and Resend are stubbed through
// globalThis.fetch with a tiny in-memory model of one contact, so each test can
// ask "what did the worker change?" rather than "what did it try to call?".
import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import worker from "./local-news-proxy.js";

const TOKEN = "test-hubspot-token";
const EMAIL = "returning@example.com";
const BASE = "https://nexus-local.example.workers.dev";
const ENV = { HUBSPOT_TOKEN: TOKEN, RESEND_API_KEY: "re_test" };

let hs; // the one HubSpot contact, as the stub sees it
let calls; // every outbound request, for asserting what did NOT happen
const realFetch = globalThis.fetch;

beforeEach(() => {
  hs = {
    channelOut: true, // an UNSUBSCRIBED status on the email channel
    flag: false, // hs_email_optout
    exists: true,
    statusFails: false,
    subscribeWorks: true,
    patchWorks: true,
  };
  calls = [];
  globalThis.fetch = async (input, init = {}) => {
    const url = String(input);
    const method = init.method || "GET";
    const headers = Object.fromEntries(Object.entries(init.headers || {}).map(([k, v]) => [k.toLowerCase(), v]));
    calls.push({ url, method, headers, body: init.body ? String(init.body) : "" });
    const json = (b, s = 200) => new Response(JSON.stringify(b), { status: s });

    if (url.includes("/v4/statuses/") && url.includes("/subscribe-all")) {
      if (hs.subscribeWorks) hs.channelOut = false;
      return json({}, hs.subscribeWorks ? 200 : 400);
    }
    if (url.includes("/v4/statuses/")) {
      if (hs.statusFails) return json({ message: "boom" }, 500);
      if (!hs.exists) return json({ message: "not found" }, 404);
      return json({ results: [{ status: hs.channelOut ? "UNSUBSCRIBED" : "SUBSCRIBED" }] });
    }
    if (url.includes("/v3/definitions")) return json({ subscriptionDefinitions: [] });
    if (url.includes("/contacts/search")) {
      return json({ results: hs.exists ? [{ id: "101", properties: { email: EMAIL, hs_email_optout: String(hs.flag) } }] : [] });
    }
    if (url.includes("/crm/v3/objects/contacts/101") && method === "PATCH") {
      if (hs.patchWorks) hs.flag = false;
      return json({}, hs.patchWorks ? 200 : 403);
    }
    if (url.includes("api.resend.com")) return json({ id: "email_1" });
    return json({}, 404);
  };
});

afterEach(() => {
  globalThis.fetch = realFetch;
});

const resubToken = (email, exp) => createHmac("sha256", TOKEN).update(`resubscribe|${email}|${exp}`).digest("hex");
const unsubToken = (email) => createHmac("sha256", TOKEN).update(email).digest("hex");

const resub = async (method, { email = EMAIL, exp = Date.now() + 3600_000, token } = {}) => {
  const t = token ?? resubToken(email, exp);
  const url = `${BASE}/resubscribe?e=${encodeURIComponent(email)}&x=${exp}&t=${t}`;
  const res = await worker.fetch(new Request(url, { method }), ENV);
  return { res, body: await res.text() };
};

const intent = async (payload, { method = "POST", env = ENV } = {}) => {
  const init = { method };
  if (method === "POST") init.body = typeof payload === "string" ? payload : JSON.stringify(payload);
  const res = await worker.fetch(new Request(`${BASE}/subscribe-intent`, init), env);
  return { res, body: await res.text() };
};

const mutations = () => calls.filter((c) => c.method === "PATCH" || /subscribe-all|\/v3\/subscribe/.test(c.url));
const emailsSent = () => calls.filter((c) => c.url.includes("api.resend.com"));

// ── the confirmation link ────────────────────────────────────────────────────

test("opening the link changes nothing: scanners GET every URL in an email", async () => {
  const { res, body } = await resub("GET");
  assert.equal(res.status, 200);
  assert.match(body, /Yes, resubscribe me/);
  assert.match(body, /method="POST"/);
  assert.equal(mutations().length, 0, "a GET must never write to HubSpot");
  assert.equal(hs.channelOut, true, "still unsubscribed");
});

test("pressing the button restores the subscription under a consent legal basis", async () => {
  const { res, body } = await resub("POST");
  assert.equal(res.status, 200);
  assert.match(body, /You're resubscribed/);
  assert.equal(hs.channelOut, false);
  const sub = calls.find((c) => c.url.includes("/subscribe-all"));
  const payload = JSON.parse(sub.body);
  assert.equal(payload.legalBasis, "CONSENT_WITH_NOTICE", "the person asked for this; it is not legitimate interest");
  assert.match(payload.legalBasisExplanation, /confirmed by clicking/);
});

test("the global opt-out flag is cleared too, since the send checks both", async () => {
  hs.flag = true;
  const { res } = await resub("POST");
  assert.equal(res.status, 200);
  assert.equal(hs.flag, false);
});

test("success is only claimed once HubSpot actually reads as subscribed", async () => {
  hs.subscribeWorks = false;
  const { res, body } = await resub("POST");
  assert.equal(res.status, 502);
  assert.doesNotMatch(body, /You're resubscribed/, "telling someone it worked when it didn't is the old unsubscribe bug");
  assert.match(body, /privacy@arok\.ai/);
});

test("a channel restored with the flag still set is reported as a failure", async () => {
  hs.flag = true;
  hs.patchWorks = false; // e.g. the token lacks crm.objects.contacts.write
  const { res } = await resub("POST");
  assert.equal(res.status, 502, "the send would still drop them, so this is not success");
});

test("an expired link is refused before HubSpot is touched", async () => {
  const { res } = await resub("POST", { exp: Date.now() - 1000 });
  assert.equal(res.status, 410);
  assert.equal(calls.length, 0);
});

test("a link edited to name a different address is refused", async () => {
  const exp = Date.now() + 3600_000;
  const { res } = await resub("POST", { email: "someone-else@example.com", exp, token: resubToken(EMAIL, exp) });
  assert.equal(res.status, 400);
  assert.equal(calls.length, 0);
});

test("a link with its expiry pushed out is refused", async () => {
  const exp = Date.now() + 3600_000;
  const { res } = await resub("POST", { exp: exp + 86_400_000 * 30, token: resubToken(EMAIL, exp) });
  assert.equal(res.status, 400);
});

test("an unsubscribe link's token cannot be replayed as a resubscribe", async () => {
  // Both are HMACs under HUBSPOT_TOKEN. The "resubscribe|" prefix and the
  // expiry in the signed message are what keep them apart.
  const { res } = await resub("POST", { token: unsubToken(EMAIL) });
  assert.equal(res.status, 400);
  assert.equal(mutations().length, 0);
});

test("and a resubscribe token cannot be replayed as an unsubscribe", async () => {
  const exp = Date.now() + 3600_000;
  const url = `${BASE}/unsubscribe?e=${encodeURIComponent(EMAIL)}&t=${resubToken(EMAIL, exp)}`;
  const res = await worker.fetch(new Request(url, { method: "POST" }), ENV);
  assert.equal(res.status, 400);
});

// ── signing up again ─────────────────────────────────────────────────────────

test("an opted-out address that signs up again is emailed a confirmation link", async () => {
  const { res, body } = await intent({ email: EMAIL });
  assert.equal(res.status, 200);
  assert.deepEqual(JSON.parse(body), { ok: true });
  const sent = emailsSent();
  assert.equal(sent.length, 1);
  const msg = JSON.parse(sent[0].body);
  assert.deepEqual(msg.to, [EMAIL]);
  assert.match(msg.subject, /Confirm/);
  assert.equal(mutations().length, 0, "signing up alone must not re-subscribe anyone");
});

test("confirmations are capped at one per address per day", async () => {
  await intent({ email: EMAIL });
  const key = emailsSent()[0].headers["idempotency-key"];
  const today = new Date().toISOString().slice(0, 10);
  assert.equal(key, `nexus-resub-${today}-${EMAIL}`, "Resend drops a repeat of the same key within 24h");
});

test("the emailed link is real: it opens to a button and the button works", async () => {
  await intent({ email: EMAIL });
  const link = JSON.parse(emailsSent()[0].body).text.match(/https:\/\/\S+/)[0];
  assert.ok(link.startsWith(`${BASE}/resubscribe?`), "points at this worker");

  const get = await worker.fetch(new Request(link, { method: "GET" }), ENV);
  assert.equal(get.status, 200);
  assert.equal(hs.channelOut, true, "still unsubscribed after merely opening it");

  const post = await worker.fetch(new Request(link, { method: "POST" }), ENV);
  assert.equal(post.status, 200);
  assert.equal(hs.channelOut, false, "restored after the button");
});

test("a subscribed address gets no email, and an identical answer", async () => {
  const optedOut = (await intent({ email: EMAIL })).body;
  calls = [];
  hs.channelOut = false;
  const subscribed = (await intent({ email: EMAIL })).body;
  assert.equal(emailsSent().length, 0);
  assert.equal(subscribed, optedOut, "a different answer would let anyone probe who has unsubscribed");
});

test("a brand-new address HubSpot has never seen gets no email", async () => {
  hs.exists = false;
  const { body } = await intent({ email: "new@example.com" });
  assert.deepEqual(JSON.parse(body), { ok: true });
  assert.equal(emailsSent().length, 0);
});

test("an address HubSpot can't classify gets no email", async () => {
  // The endpoint is public: mailing addresses we can't classify would make it
  // a way to send our mail to arbitrary strangers.
  hs.statusFails = true;
  const { body } = await intent({ email: EMAIL });
  assert.deepEqual(JSON.parse(body), { ok: true });
  assert.equal(emailsSent().length, 0);
});

test("a missing Resend key sends nothing and still answers neutrally", async () => {
  const { body } = await intent({ email: EMAIL }, { env: { HUBSPOT_TOKEN: TOKEN } });
  assert.deepEqual(JSON.parse(body), { ok: true });
  assert.equal(emailsSent().length, 0);
});

test("only POST is accepted, and junk is rejected before HubSpot is asked", async () => {
  assert.equal((await intent(null, { method: "GET" })).res.status, 405);
  assert.equal((await intent({ email: "not-an-email" })).res.status, 400);
  assert.equal((await intent("{broken json")).res.status, 400);
  assert.equal(calls.length, 0);
});

test("the browser can read the answer cross-origin", async () => {
  const { res } = await intent({ email: EMAIL });
  assert.equal(res.headers.get("access-control-allow-origin"), "*");
});
