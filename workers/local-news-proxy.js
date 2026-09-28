// NEXUS local-news proxy: a Cloudflare Worker (free tier is plenty).
//
// Why this exists: visitors' browsers can't call a news API with a hidden key,
// and Google News RSS blocks Cloudflare/datacenter IPs outright. This worker
// calls the GNews API server-side (key stays secret here) and returns clean,
// CORS-enabled JSON, so every visitor gets local news for THEIR zipcode on a
// fully static site.
//
// SETUP (~5 minutes):
//   1. Get a free API key at https://gnews.io  (100 requests/day free).
//   2. Cloudflare dashboard → your worker → Settings → Variables and Secrets →
//      add a variable named  GNEWS_KEY  with your key as the value → Save.
//      (Alternative provider: NewsData.io: see the commented block below.)
//   3. Edit code → paste this file → Deploy.
//   4. The worker URL is already wired into the site via the LOCAL_NEWS_PROXY
//      repo variable; nothing else to change.
//
// FOREIGN REPORTING (/translate route):
//   Translates foreign headlines using Workers AI. To enable:
//     a. Worker → Settings → Bindings → add a Workers AI binding named  AI .
//     b. Add a secret  TRANSLATE_KEY  (any long random string) and set the same
//        value as a GitHub Actions secret of the same name.
//   The key is not optional. Workers AI gives 10,000 free neurons a day and
//   bills past that, so an unauthenticated translate endpoint is someone else's
//   free GPU and your invoice.
//
// NEWSLETTER UNSUBSCRIBE (/unsubscribe route):
//   The newsletter footer links here to unsubscribe people in one click. For it
//   to work, also add a  HUBSPOT_TOKEN  variable (same HubSpot service key used
//   by GitHub) with these scopes: communication_preferences.read_write. The link
//   carries a signed token (HMAC of the email using HUBSPOT_TOKEN) so nobody can
//   unsubscribe anyone else.
//
// RETURNING SUBSCRIBERS (/subscribe-intent and /resubscribe routes):
//   Someone who unsubscribed and signs up again is emailed a confirmation link,
//   and only clicking it restores their subscription. Needs, on this worker:
//     - RESEND_API_KEY secret (the same Resend key GitHub uses), to send the link
//     - HUBSPOT_TOKEN scopes: communication_preferences.read_write,
//       crm.objects.contacts.read and crm.objects.contacts.write
//   Optional: NEWSLETTER_FROM to override the "NEXUS <brief@arok.ai>" sender.
//
// ON-TIME DAILY BRIEF (cron trigger):
//   GitHub's scheduler runs the newsletter hours late and drops most slots.
//   Cloudflare's cron is on time, so this worker presses "Run workflow" at
//   4:15 AM Denver. To enable:
//     a. GitHub → Settings → Developer settings → Fine-grained tokens → new token:
//        repository access "Only select repositories: srwim/nexus",
//        permission "Actions: Read and write", nothing else.
//     b. Worker → Settings → Variables and Secrets → add secret
//        GITHUB_DISPATCH_TOKEN with that token. Paste it there, nowhere else.
//     c. Worker → Settings → Triggers → Cron Triggers → add  15 10,11 * * *
//        (10:15 and 11:15 UTC: one of them is 4:15 AM Denver year-round).

export default {
  // Cloudflare cron entry point. waitUntil keeps the worker alive until the
  // GitHub call finishes; a scheduled event has no response to hold it open.
  async scheduled(event, env, ctx) {
    ctx.waitUntil(dispatchNewsletter(env, new Date(event.scheduledTime)));
  },

  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname.replace(/\/+$/, "").endsWith("/unsubscribe")) {
      return handleUnsubscribe(request, url, env);
    }
    if (url.pathname.replace(/\/+$/, "").endsWith("/subscribe-intent")) {
      return handleSubscribeIntent(request, url, env);
    }
    if (url.pathname.replace(/\/+$/, "").endsWith("/resubscribe")) {
      return handleResubscribe(request, url, env);
    }
    if (url.pathname.replace(/\/+$/, "").endsWith("/translate")) {
      return handleTranslate(request, env);
    }
    if (url.pathname.replace(/\/+$/, "").endsWith("/c")) {
      return handleClick(url, env);
    }

    const cors = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Content-Type": "application/json",
      "Cache-Control": "public, max-age=900", // 15-min edge cache: conserves the daily API quota
    };
    if (request.method === "OPTIONS") return new Response(null, { headers: cors });

    const zip = url.searchParams.get("zip") || "";
    if (!/^\d{5}$/.test(zip)) {
      return new Response(JSON.stringify({ error: "zip must be 5 digits" }), { status: 400, headers: cors });
    }
    if (!env.GNEWS_KEY) {
      return new Response(
        JSON.stringify({ error: "GNEWS_KEY not set: add it in the worker's Variables and Secrets settings." }),
        { status: 500, headers: cors }
      );
    }

    try {
      // Zipcode -> city / state (cached a day).
      const zipRes = await fetch(`https://api.zippopotam.us/us/${zip}`, {
        cf: { cacheTtl: 86400, cacheEverything: true },
      });
      if (!zipRes.ok) {
        return new Response(JSON.stringify({ error: "unknown zip" }), { status: 404, headers: cors });
      }
      const p = (await zipRes.json()).places?.[0];
      const place = { city: p["place name"], state: p["state abbreviation"] };
      const stateFull = p["state"] || place.state;

      // Quoted city keeps results local; the full state name disambiguates
      // common city names without over-restricting.
      const q = `"${place.city}" ${stateFull}`;

      // Without a date window, "give me 10 results" returns the 10 most recent
      // EVER: so a town with little coverage backfills with two-week-old
      // stories. Bounding it means quiet markets return fewer items instead of
      // stale ones. Keep in step with MAX_AGE_DAYS in lib/clientLocal.js.
      //
      // The boundary is rounded to midnight so the URL stays identical all day
      // and the edge cache still works; a live timestamp would make every
      // request unique and burn the 100/day free quota.
      const since = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);
      const apiUrl =
        `https://gnews.io/api/v4/search?q=${encodeURIComponent(q)}` +
        `&country=us&lang=en&max=10&sortby=publishedAt&from=${since}T00:00:00Z` +
        `&apikey=${env.GNEWS_KEY}`;

      const res = await fetch(apiUrl, { cf: { cacheTtl: 900, cacheEverything: true } });
      if (!res.ok) {
        return new Response(JSON.stringify({ error: `news api ${res.status}`, place, items: [] }), {
          status: 200,
          headers: cors,
        });
      }
      const data = await res.json();
      const items = (data.articles || []).map((a) => ({
        title: a.title || "",
        link: a.url || "",
        source: a.source?.name || "",
        date: a.publishedAt || null,
        summary: a.description || "",
      }));

      return new Response(JSON.stringify({ place, items }), { headers: cors });
    } catch (e) {
      return new Response(JSON.stringify({ error: e.message }), { status: 502, headers: cors });
    }
  },
};

// ── On-time daily brief ──────────────────────────────────────────────────────
// Triggers the newsletter workflow through GitHub's workflow_dispatch API.
//
// Why not just GitHub's cron: it is documented as best-effort, and in practice
// it fired one of the workflow's eight daily slots, three to five hours late,
// and on days it landed after the send window the brief silently didn't go.
// Cloudflare's cron fires on the minute. GitHub's schedule stays in place as
// the backup, and the send's per-day idempotency key means whichever run lands
// first mails everyone and every later one is a no-op.
//
// The cron fires at 10:15 and 11:15 UTC. Only the one that is 4 AM in Denver
// dispatches, so daylight saving needs no second schedule and there is exactly
// one dispatch a day. A dispatched run skips the send window, like any manual
// run, so it always goes out.
export async function dispatchNewsletter(env, now = new Date()) {
  const hour = Number(
    new Intl.DateTimeFormat("en-US", { timeZone: "America/Denver", hour: "numeric", hourCycle: "h23" }).format(now)
  );
  if (hour !== 4) return "skipped: not 4 AM in Denver";
  if (!env.GITHUB_DISPATCH_TOKEN) {
    console.warn("newsletter: GITHUB_DISPATCH_TOKEN not set on the worker; relying on GitHub's own schedule");
    return "skipped: no token";
  }

  const repo = env.GITHUB_REPO || "srwim/nexus";
  try {
    const res = await fetch(`https://api.github.com/repos/${repo}/actions/workflows/newsletter.yml/dispatches`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.GITHUB_DISPATCH_TOKEN}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "nexus-worker", // GitHub rejects API calls without one
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ ref: "main" }),
    });
    if (res.ok) {
      console.log("newsletter: dispatched the daily brief");
      return "dispatched";
    }
    // 401/403 here almost always means the token expired or lacks Actions: write.
    console.warn(`newsletter: dispatch failed (${res.status}: ${(await res.text()).slice(0, 160)})`);
    return `failed: ${res.status}`;
  } catch (e) {
    console.warn(`newsletter: dispatch errored (${e?.message || e})`);
    return "failed: network";
  }
}

// ── Sponsor click counting ───────────────────────────────────────────────────
// GET /c?id=<campaignId>&p=<placement>  ->  302 to that campaign's destination.
//
// THE DESTINATION IS NEVER A PARAMETER. That is the whole design. A redirector
// that takes ?u=<url> is an open redirect: anyone can hand out
// nexus-local.…workers.dev/c?u=https://phishing.example and borrow the
// reputation of a domain readers trust. Here the id is looked up in the
// published sponsors.json, so the only reachable destinations are ones already
// committed to the repo: the allowlist is the sponsor list, by construction.
//
// Belt and braces on top of that: the resolved URL must still parse as http(s),
// so a bad entry reaching sponsors.json cannot produce a "javascript:" redirect.
const SPONSORS_URL = "https://arok.ai/nexus/sponsors.json";

async function loadCampaigns() {
  try {
    // Edge-cached: a click should not cost a round trip to the origin, and the
    // sponsor list changes at most daily.
    const res = await fetch(SPONSORS_URL, { cf: { cacheTtl: 600, cacheEverything: true } });
    if (!res.ok) return [];
    return (await res.json())?.campaigns || [];
  } catch {
    return [];
  }
}

function safeDestination(raw) {
  try {
    const u = new URL(String(raw));
    return u.protocol === "https:" || u.protocol === "http:" ? u : null;
  } catch {
    return null;
  }
}

async function handleClick(url, env) {
  const id = (url.searchParams.get("id") || "").slice(0, 64);
  const placement = (url.searchParams.get("p") || "").slice(0, 16);
  // Explicitly ignored, and named so nobody "helpfully" adds it later.
  if (url.searchParams.has("u") || url.searchParams.has("url")) {
    return new Response("This endpoint does not take a destination URL.", { status: 400 });
  }
  if (!id) return Response.redirect("https://arok.ai/nexus/", 302);

  const campaign = (await loadCampaigns()).find((c) => c.id === id);
  const dest = campaign ? safeDestination(campaign.url) : null;
  // An unknown or malformed campaign goes to the site, not to nowhere and not
  // to something a query string suggested.
  if (!dest) return Response.redirect("https://arok.ai/nexus/", 302);

  dest.searchParams.set("utm_source", "nexus");
  dest.searchParams.set("utm_medium", "email");
  dest.searchParams.set("utm_campaign", id);
  if (placement) dest.searchParams.set("utm_content", placement);

  // Counting is optional: no KV binding means the redirect still works. Add a
  // KV namespace bound as SPONSOR_STATS to switch it on.
  //
  // ponytail: read-modify-write on a per-day, per-campaign key. Two clicks in
  // the same second can lose one, which is fine for a reach estimate and not
  // fine for billing per click. Upgrade path is Analytics Engine or a Durable
  // Object counter if a sponsor ever pays on exact clicks.
  if (env.SPONSOR_STATS) {
    const day = new Date().toISOString().slice(0, 10);
    const key = `clicks:${day}:${id}:${placement || "none"}`;
    try {
      const current = Number((await env.SPONSOR_STATS.get(key)) || 0);
      await env.SPONSOR_STATS.put(key, String(current + 1), { expirationTtl: 60 * 60 * 24 * 400 });
    } catch {
      /* never let a counter failure break the reader's click */
    }
  }

  return Response.redirect(dest.toString(), 302);
}

// ── Translation for Foreign Reporting ────────────────────────────────────────
// POST /translate  { "source": "ja", "texts": ["…", "…"] }
//   -> { "translations": ["…", "…"] }   (null in a slot that failed)
//
// M2M100 is a dedicated translation model, not an instruction-following one.
// That is deliberate: the input here is headline text from foreign news feeds,
// which is untrusted. An instruct LLM would happily obey a headline that reads
// "ignore previous instructions"; a translation model has no instruction channel
// to hijack. It also costs far fewer neurons.
const TRANSLATE_MODEL = "@cf/meta/m2m100-1.2b";
const MAX_TEXTS = 60; // one batch per country per build, comfortably
const MAX_CHARS = 600; // headlines and snippets; anything longer is not a headline

async function handleTranslate(request, env) {
  const json = (body, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

  if (request.method !== "POST") return json({ error: "POST only" }, 405);
  if (!env.TRANSLATE_KEY) return json({ error: "TRANSLATE_KEY not set on the worker" }, 500);

  // Constant-time-ish compare is overkill for a build-time key, but rejecting
  // before touching the AI binding is what keeps the quota ours.
  const given = request.headers.get("x-translate-key") || "";
  if (given !== env.TRANSLATE_KEY) return json({ error: "unauthorized" }, 401);
  if (!env.AI) return json({ error: "no AI binding: add one named AI in the worker settings" }, 500);

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "bad json" }, 400);
  }

  const source = String(body?.source || "").slice(0, 8);
  const texts = Array.isArray(body?.texts) ? body.texts.slice(0, MAX_TEXTS) : [];
  if (!source || !texts.length) return json({ error: "source and texts required" }, 400);

  const translations = [];
  for (const raw of texts) {
    const text = String(raw ?? "").slice(0, MAX_CHARS).trim();
    if (!text) {
      translations.push(null);
      continue;
    }
    try {
      const out = await env.AI.run(TRANSLATE_MODEL, {
        text,
        source_lang: source,
        target_lang: "en",
      });
      const t = (out?.translated_text || "").trim();
      // An empty or echoed result is a failed translation, not a translation.
      translations.push(t && t !== text ? t : null);
    } catch {
      translations.push(null);
    }
  }
  return json({ translations });
}

// ── One-click unsubscribe ────────────────────────────────────────────────────
// POST /unsubscribe?e=<email>&t=<hmac> opts the address out in HubSpot. A GET
// renders a confirmation page instead and changes nothing.
//
// This used to act on ANY method: handleUnsubscribe wasn't even given the
// request, only the URL: which made the link a trap. Mail providers and
// security products follow URLs in mail as a matter of course: Gmail and
// Outlook prefetch, Defender/Proofpoint "safe links" rewrite and visit every
// URL to scan it, and corporate filters crawl them on delivery. Every one of
// those visits silently unsubscribed the reader.
//
// It did no visible damage for six weeks because nothing read subscription
// status: then "Honour unsubscribes" (6332c8c) landed on 8 Sep and the send
// started obeying those phantom opt-outs. Every subscriber stopped receiving
// the brief roughly a day after their last delivery, because the scan of THAT
// delivery is what unsubscribed them. RFC 8058 requires POST for exactly this
// reason: a GET must never be the thing that changes state.
async function handleUnsubscribe(request, url, env) {
  const email = (url.searchParams.get("e") || "").trim().toLowerCase();
  const token = url.searchParams.get("t") || "";

  if (!email || !token || !env.HUBSPOT_TOKEN) {
    return page("This unsubscribe link is incomplete. Email unsubscribe@arok.ai and we'll remove you.", 400);
  }
  const expected = await hmacHex(email, env.HUBSPOT_TOKEN);
  if (token !== expected) {
    return page("This unsubscribe link isn't valid. Email unsubscribe@arok.ai and we'll remove you.", 400);
  }

  // A reader clicking the footer link arrives by GET and gets a button. The
  // List-Unsubscribe-Post one-click header sends a real POST, so genuine
  // one-click unsubscribes still complete without this extra step.
  if (request.method !== "POST") {
    return confirmPage(email, url);
  }

  try {
    const auth = { Authorization: `Bearer ${env.HUBSPOT_TOKEN}`, "Content-Type": "application/json" };

    // Unsubscribe from ALL email, not one guessed subscription type. NEXUS
    // sends exactly one kind of email, so "all" is what the reader means, and
    // it sets the global hs_email_optout flag the send loop also checks, so
    // there is no type-matching heuristic left to get wrong.
    const all = await fetch(
      `https://api.hubapi.com/communication-preferences/v4/statuses/${encodeURIComponent(email)}/unsubscribe-all?channel=EMAIL`,
      { method: "POST", headers: auth }
    );
    let done = all.ok || (await saysAlreadyUnsubscribed(all));

    // Fallback to the per-type v3 call if v4 is unavailable on this portal.
    if (!done) {
      const defsRes = await fetch("https://api.hubapi.com/communication-preferences/v3/definitions", { headers: auth });
      if (defsRes.ok) {
        const subs = (await defsRes.json()).subscriptionDefinitions || [];
        const sub = subs.find((s) => /market/i.test(s.name || "")) || subs[0];
        if (sub) {
          const res = await fetch("https://api.hubapi.com/communication-preferences/v3/unsubscribe", {
            method: "POST",
            headers: auth,
            body: JSON.stringify({ emailAddress: email, subscriptionId: String(sub.id) }),
          });
          done = res.ok || (await saysAlreadyUnsubscribed(res));
        }
      }
    }

    // Only a confirmed success gets the success page. This used to treat any
    // 400 as "already unsubscribed": which is also what a bad token scope, a
    // wrong subscription id or a malformed request return: so a reader could
    // be told they were unsubscribed while nothing had happened. Being told
    // it failed, with somewhere to write, beats being told it worked.
    if (done) {
      return page(`You're unsubscribed. ${escapeHtml(email)} will no longer receive the NEXUS Daily Brief.`, 200);
    }
    return page(
      "We couldn't process that unsubscribe automatically. Please email unsubscribe@arok.ai and we'll remove you by hand.",
      502
    );
  } catch {
    return page("Something went wrong. Please email unsubscribe@arok.ai and we'll remove you by hand.", 502);
  }
}

// ── Returning subscribers: double opt-in ─────────────────────────────────────
// Someone who unsubscribed and later signs up again ends up with two HubSpot
// records in conflict: fresh consent from the form, and an older opt-out that
// the send obeys. The opt-out wins, so to them, signing up does nothing.
//
// The form must not be what reverses the opt-out. Anyone can type any address
// into a form, so if submitting one re-subscribed an opted-out address, a
// stranger could undo someone's "stop emailing me", which is exactly what
// CAN-SPAM and GDPR forbid. A returning address is instead emailed a link, and
// only a click from that inbox restores it.
//
// POST /subscribe-intent   body {"email": "..."} sent as text/plain (no preflight)
//   Answers {"ok": true} for every well-formed address, confirmation sent or
//   not. Answering differently for opted-out addresses would let anyone probe
//   who has unsubscribed, and that is personal data about them.
// GET  /resubscribe?e=&x=&t=   a page with a button; changes nothing (scanners GET)
// POST /resubscribe?e=&x=&t=   restores, then re-reads HubSpot and reports
//   success only if the send will actually include them.
//
// ponytail: the HubSpot calls below duplicate scripts/resubscribe.mjs. This
// file is deployed by pasting it into Cloudflare's editor, so it cannot import
// from lib/. If the two drift, the send's rule in scripts/integrations.mjs is
// the one to match.
const RESUB_TTL_MS = 72 * 60 * 60 * 1000;

// Domain-separated from the unsubscribe token, which is HMAC(email) under the
// same key. Without the prefix and expiry in the message, a leaked unsubscribe
// link would double as a valid resubscribe link for the same address.
const resubMessage = (email, exp) => `resubscribe|${email}|${exp}`;

const isEmail = (e) => typeof e === "string" && e.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);

// The send drops a contact if ANY email subscription reads UNSUBSCRIBED or the
// global hs_email_optout flag is set (scripts/integrations.mjs). This checks
// the same two things: restoring one and not the other would tell a reader
// they are back while the send still skips them.
async function optOutState(email, auth) {
  try {
    const st = await fetch(
      `https://api.hubapi.com/communication-preferences/v4/statuses/${encodeURIComponent(email)}?channel=EMAIL`,
      { headers: auth }
    );
    let channelOut = false;
    if (st.ok) {
      channelOut = ((await st.json())?.results || []).some((r) => String(r.status).toUpperCase() === "UNSUBSCRIBED");
    } else if (st.status !== 404) {
      return { state: "unknown" }; // 404 just means HubSpot has never heard of them
    }

    const search = await fetch("https://api.hubapi.com/crm/v3/objects/contacts/search", {
      method: "POST",
      headers: auth,
      body: JSON.stringify({
        filterGroups: [{ filters: [{ propertyName: "email", operator: "EQ", value: email }] }],
        properties: ["email", "hs_email_optout"],
        limit: 1,
      }),
    });
    if (!search.ok) return { state: "unknown" };
    const contact = (await search.json())?.results?.[0] || null;
    const flag = String(contact?.properties?.hs_email_optout || "").toLowerCase() === "true";
    return { state: channelOut || flag ? "out" : "in", contactId: contact?.id || null, flag };
  } catch {
    return { state: "unknown" };
  }
}

async function handleSubscribeIntent(request, url, env) {
  const cors = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Content-Type": "application/json",
  };
  const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: cors });
  if (request.method === "OPTIONS") return new Response(null, { headers: cors });
  if (request.method !== "POST") return json({ ok: false, error: "POST only" }, 405);

  let email = "";
  try {
    email = String(JSON.parse(await request.text())?.email || "").trim().toLowerCase();
  } catch {
    /* falls through to the validity check */
  }
  if (!isEmail(email)) return json({ ok: false, error: "invalid email" }, 400);
  if (!env.HUBSPOT_TOKEN) return json({ ok: true });

  const auth = { Authorization: `Bearer ${env.HUBSPOT_TOKEN}`, "Content-Type": "application/json" };
  // Only a definite opt-out earns an email. "unknown" does not: this endpoint
  // is public, and mailing addresses we can't classify would make it a way to
  // send our mail to arbitrary strangers.
  if ((await optOutState(email, auth)).state === "out") {
    const sent = await sendResubConfirmation(email, url.origin, env);
    // Visible in the worker's logs, deliberately not in the response.
    if (!sent) console.warn("resubscribe: confirmation email not sent (check RESEND_API_KEY on the worker)");
  }
  return json({ ok: true });
}

async function sendResubConfirmation(email, origin, env) {
  if (!env.RESEND_API_KEY) return false;
  const exp = Date.now() + RESUB_TTL_MS;
  const t = await hmacHex(resubMessage(email, exp), env.HUBSPOT_TOKEN);
  const link = `${origin}/resubscribe?e=${encodeURIComponent(email)}&x=${exp}&t=${t}`;
  const day = new Date().toISOString().slice(0, 10);

  const text =
    "You asked to receive the NEXUS Daily Brief at this address. It unsubscribed in the past, " +
    "so we need you to confirm before we start sending again.\n\n" +
    `Confirm: ${link}\n\n` +
    "This link works for 3 days. If you didn't ask for this, ignore this email and nothing will change.";
  const html =
    `<div style="font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;max-width:480px;margin:0 auto;padding:32px 20px;color:#1a1815;">` +
    `<div style="font-size:22px;font-weight:800;letter-spacing:2px;color:#9c552b;margin-bottom:18px;">NEXUS</div>` +
    `<p style="font-size:15px;line-height:1.6;">You asked to receive the NEXUS Daily Brief at this address. ` +
    `It unsubscribed in the past, so we need you to confirm before we start sending again.</p>` +
    `<p style="margin:26px 0;"><a href="${escapeHtml(link)}" style="display:inline-block;background:#9c552b;color:#ffffff;` +
    `text-decoration:none;font-weight:600;font-size:15px;padding:12px 24px;">Confirm my subscription</a></p>` +
    `<p style="font-size:13px;line-height:1.6;color:#6b665c;">This link works for 3 days. ` +
    `If you didn't ask for this, ignore this email and nothing will change.</p></div>`;

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
        // One confirmation per address per UTC day, enforced by Resend itself.
        // Without a cap this endpoint could fill an opted-out stranger's inbox,
        // and burn the free sending quota the daily brief depends on.
        "Idempotency-Key": `nexus-resub-${day}-${email}`,
      },
      body: JSON.stringify({
        from: env.NEWSLETTER_FROM || "NEXUS <brief@arok.ai>",
        to: [email],
        subject: "Confirm your NEXUS subscription",
        text,
        html,
      }),
    });
    return res.ok || res.status === 409; // 409: today's confirmation already went out
  } catch {
    return false;
  }
}

async function handleResubscribe(request, url, env) {
  const email = (url.searchParams.get("e") || "").trim().toLowerCase();
  const exp = Number(url.searchParams.get("x") || 0);
  const token = url.searchParams.get("t") || "";
  const again = "Sign up again at arok.ai/nexus and we'll send a fresh link.";

  if (!isEmail(email) || !Number.isFinite(exp) || !exp || !token || !env.HUBSPOT_TOKEN) {
    return page(`This confirmation link is incomplete. ${again}`, 400);
  }
  if (token !== (await hmacHex(resubMessage(email, exp), env.HUBSPOT_TOKEN))) {
    return page(`This confirmation link isn't valid. ${again}`, 400);
  }
  if (Date.now() > exp) {
    return page(`This confirmation link has expired. ${again}`, 410);
  }

  // Same rule the unsubscribe route learned the hard way: mail scanners GET
  // every link, so a GET only ever shows the button.
  if (request.method !== "POST") {
    return actionPage(
      `Start sending the NEXUS Daily Brief to <strong>${escapeHtml(email)}</strong> again?`,
      "Yes, resubscribe me",
      `${url.pathname}?e=${encodeURIComponent(email)}&x=${exp}&t=${token}`
    );
  }

  try {
    const auth = { Authorization: `Bearer ${env.HUBSPOT_TOKEN}`, "Content-Type": "application/json" };
    const explanation =
      "Re-opted in: submitted the NEXUS signup form with explicit consent, then confirmed by clicking " +
      `a link emailed to this address on ${new Date().toISOString()}.`;

    const restored = await restoreEachType(email, auth, explanation);

    // The global flag is a separate switch; the send checks it too.
    const before = await optOutState(email, auth);
    let flagNote = "not set";
    if (before.flag && before.contactId) {
      const patch = await fetch(`https://api.hubapi.com/crm/v3/objects/contacts/${before.contactId}`, {
        method: "PATCH",
        headers: auth,
        body: JSON.stringify({ properties: { hs_email_optout: "false" } }),
      });
      flagNote = patch.ok ? "cleared" : `PATCH ${patch.status}`;
    }

    // Verified, not assumed: the success page only appears if the send's own
    // rule now lets them through.
    const after = await optOutState(email, auth);
    if (after.state === "in") {
      console.log(`resubscribe: restored ${maskEmail(email)} (${restored.summary}; flag ${flagNote})`);
      return page(`You're resubscribed. ${escapeHtml(email)} will receive the NEXUS Daily Brief from the next edition.`, 200);
    }
    // The reader gets a plain message; the operator gets HubSpot's own words.
    // Without this line the first failure of this route was undiagnosable.
    console.warn(
      `resubscribe: NOT restored ${maskEmail(email)}: ${restored.summary}; flag ${flagNote}; ` +
        `still reads ${after.state}${after.flag ? " (hs_email_optout set)" : ""}`
    );
    return page("We couldn't finish resubscribing you automatically. Email privacy@arok.ai and we'll sort it out by hand.", 502);
  } catch (e) {
    console.warn(`resubscribe: errored for ${maskEmail(email)}: ${e?.message || e}`);
    return page("Something went wrong. Email privacy@arok.ai and we'll sort it out by hand.", 502);
  }
}

// Put back every email subscription type the contact is unsubscribed from.
//
// HubSpot has no "subscribe-all": only unsubscribe-all exists, and the first
// version of this route called a subscribe-all endpoint that isn't there. Nor
// does the v3 subscribe call help: HubSpot documents that it "will not allow
// you to resubscribe contacts who have opted out". The documented way back is
// the v4 status update, one call per subscription type, which HubSpot marks
// RESUBSCRIBE_OCCURRED when it takes.
//
// Every UNSUBSCRIBED type is restored, not just one, because the send drops a
// contact if ANY type reads UNSUBSCRIBED.
async function restoreEachType(email, auth, explanation) {
  const base = `https://api.hubapi.com/communication-preferences/v4/statuses/${encodeURIComponent(email)}`;
  const st = await fetch(`${base}?channel=EMAIL`, { headers: auth });
  if (!st.ok) return { summary: `status read failed (${st.status})` };

  const out = ((await st.json())?.results || []).filter((r) => String(r.status).toUpperCase() === "UNSUBSCRIBED");
  if (!out.length) return { summary: "no unsubscribed types" };

  const parts = [];
  for (const r of out) {
    const res = await fetch(base, {
      method: "POST",
      headers: auth,
      body: JSON.stringify({
        subscriptionId: Number(r.subscriptionId),
        statusState: "SUBSCRIBED",
        legalBasis: "CONSENT_WITH_NOTICE",
        legalBasisExplanation: explanation,
        channel: "EMAIL",
      }),
    });
    let detail = `${res.status}`;
    try {
      const body = await res.text();
      const reason = body.match(/"setStatusSuccessReason"\s*:\s*"([A-Z_]+)"/)?.[1];
      if (reason) detail += ` ${reason}`;
      else if (!res.ok) detail += ` ${body.slice(0, 160)}`;
    } catch {
      /* the status code is enough to go on */
    }
    parts.push(`type ${r.subscriptionId}: ${detail}`);
  }
  return { summary: parts.join(", ") };
}

// Cloudflare's logs are private to the account, but there's no reason for a
// subscriber's full address to sit in them either.
function maskEmail(email) {
  const [user = "", domain = ""] = String(email).split("@");
  return `${user.slice(0, 1)}***@${domain}`;
}

// HubSpot returns 4xx with a message when the contact is already opted out.
// That is a success from the reader's point of view; any other 4xx is not.
async function saysAlreadyUnsubscribed(res) {
  if (res.ok || res.status >= 500) return false;
  try {
    const body = await res.clone().text();
    return /already/i.test(body) && /unsubscri/i.test(body);
  } catch {
    return false;
  }
}

async function hmacHex(message, secret) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(message));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}

// The GET landing page: says what will happen, and does nothing until the
// reader presses the button. The form posts back to this same signed URL, so no
// token is re-derived and nothing new has to be trusted.
function confirmPage(email, url) {
  return actionPage(
    `Unsubscribe <strong>${escapeHtml(email)}</strong> from the NEXUS Daily Brief?`,
    "Yes, unsubscribe me",
    `${url.pathname}?e=${encodeURIComponent(email)}&t=${url.searchParams.get("t") || ""}`
  );
}

// Shared by unsubscribe and resubscribe: a question, one button that POSTs back
// to the same signed URL, and nothing changed until it is pressed.
// `questionHtml` must already be escaped; `rawAction` is escaped here.
function actionPage(questionHtml, button, rawAction) {
  const action = escapeHtml(rawAction);
  const html =
    `<!doctype html><html lang="en"><head><meta charset="utf-8">` +
    `<meta name="viewport" content="width=device-width, initial-scale=1"><title>NEXUS</title>` +
    // Belt and braces: keep this page out of crawlers and prefetchers too.
    `<meta name="robots" content="noindex,nofollow"></head>` +
    `<body style="margin:0;background:#0b0b0f;color:#e7e7ee;font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;text-align:center;padding:64px 20px;">` +
    `<div style="font-size:24px;font-weight:800;letter-spacing:2px;color:#6ee7b7;margin-bottom:18px;">NEXUS</div>` +
    `<p style="font-size:15px;line-height:1.6;max-width:460px;margin:0 auto 24px;">` +
    `${questionHtml}</p>` +
    `<form method="POST" action="${action}">` +
    `<button type="submit" style="font:inherit;font-size:15px;font-weight:600;padding:12px 28px;border:0;border-radius:8px;background:#6ee7b7;color:#0b0b0f;cursor:pointer;">` +
    `${escapeHtml(button)}</button></form>` +
    `<p style="font-size:13px;line-height:1.6;color:#9c988d;margin-top:24px;">Nothing has changed yet.</p>` +
    `</body></html>`;
  return new Response(html, {
    status: 200,
    headers: { "Content-Type": "text/html; charset=utf-8", "X-Robots-Tag": "noindex, nofollow" },
  });
}

function page(msg, status) {
  const html =
    `<!doctype html><html lang="en"><head><meta charset="utf-8">` +
    `<meta name="viewport" content="width=device-width, initial-scale=1"><title>NEXUS</title></head>` +
    `<body style="margin:0;background:#0b0b0f;color:#e7e7ee;font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;text-align:center;padding:64px 20px;">` +
    `<div style="font-size:24px;font-weight:800;letter-spacing:2px;color:#6ee7b7;margin-bottom:18px;">NEXUS</div>` +
    `<p style="font-size:15px;line-height:1.6;max-width:460px;margin:0 auto;">${msg}</p>` +
    `</body></html>`;
  return new Response(html, { status, headers: { "Content-Type": "text/html; charset=utf-8" } });
}

// ── Using NewsData.io instead? (free 200 credits/day) ────────────────────────
// Swap the apiUrl + parsing for:
//   const apiUrl = `https://newsdata.io/api/1/latest?apikey=${env.GNEWS_KEY}` +
//     `&q=${encodeURIComponent(`"${place.city}"`)}&country=us&language=en`;
//   const items = (data.results || []).map((a) => ({
//     title: a.title || "", link: a.link || "", source: a.source_id || "",
//     date: a.pubDate || null, summary: a.description || "",
//   }));
