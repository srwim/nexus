// NEXUS local-news proxy — a Cloudflare Worker (free tier is plenty).
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
//      (Alternative provider: NewsData.io — see the commented block below.)
//   3. Edit code → paste this file → Deploy.
//   4. The worker URL is already wired into the site via the LOCAL_NEWS_PROXY
//      repo variable; nothing else to change.
//
// NEWSLETTER UNSUBSCRIBE (/unsubscribe route):
//   The newsletter footer links here to unsubscribe people in one click. For it
//   to work, also add a  HUBSPOT_TOKEN  variable (same HubSpot service key used
//   by GitHub) with these scopes: communication_preferences.read_write. The link
//   carries a signed token (HMAC of the email using HUBSPOT_TOKEN) so nobody can
//   unsubscribe anyone else.

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname.replace(/\/+$/, "").endsWith("/unsubscribe")) {
      return handleUnsubscribe(url, env);
    }

    const cors = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Content-Type": "application/json",
      "Cache-Control": "public, max-age=900", // 15-min edge cache — conserves the daily API quota
    };
    if (request.method === "OPTIONS") return new Response(null, { headers: cors });

    const zip = url.searchParams.get("zip") || "";
    if (!/^\d{5}$/.test(zip)) {
      return new Response(JSON.stringify({ error: "zip must be 5 digits" }), { status: 400, headers: cors });
    }
    if (!env.GNEWS_KEY) {
      return new Response(
        JSON.stringify({ error: "GNEWS_KEY not set — add it in the worker's Variables and Secrets settings." }),
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
      const apiUrl =
        `https://gnews.io/api/v4/search?q=${encodeURIComponent(q)}` +
        `&country=us&lang=en&max=10&apikey=${env.GNEWS_KEY}`;

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

// ── One-click unsubscribe ────────────────────────────────────────────────────
// GET or POST /unsubscribe?e=<email>&t=<hmac>. Verifies the signed token, then
// opts the address out of the marketing subscription in HubSpot so the daily
// send (which reads a list that excludes opt-outs) stops emailing them.
async function handleUnsubscribe(url, env) {
  const email = (url.searchParams.get("e") || "").trim().toLowerCase();
  const token = url.searchParams.get("t") || "";

  if (!email || !token || !env.HUBSPOT_TOKEN) {
    return page("This unsubscribe link is incomplete. Email unsubscribe@arok.ai and we'll remove you.", 400);
  }
  const expected = await hmacHex(email, env.HUBSPOT_TOKEN);
  if (token !== expected) {
    return page("This unsubscribe link isn't valid. Email unsubscribe@arok.ai and we'll remove you.", 400);
  }

  try {
    const auth = { Authorization: `Bearer ${env.HUBSPOT_TOKEN}`, "Content-Type": "application/json" };
    // Find the marketing subscription type id.
    const defsRes = await fetch("https://api.hubapi.com/communication-preferences/v3/definitions", {
      headers: auth,
    });
    if (!defsRes.ok) return page("We couldn't reach the subscription service. Please email unsubscribe@arok.ai.", 502);
    const defs = await defsRes.json();
    const subs = defs.subscriptionDefinitions || [];
    const sub = subs.find((s) => /market/i.test(s.name || "")) || subs[0];
    if (!sub) return page("No subscription type is configured. Please email unsubscribe@arok.ai.", 500);

    const res = await fetch("https://api.hubapi.com/communication-preferences/v3/unsubscribe", {
      method: "POST",
      headers: auth,
      body: JSON.stringify({ emailAddress: email, subscriptionId: String(sub.id) }),
    });
    // 200 = unsubscribed; 400/409 often means "already unsubscribed" — treat as success.
    if (res.ok || res.status === 400 || res.status === 409) {
      return page(`You're unsubscribed. ${escapeHtml(email)} will no longer receive the NEXUS Daily Brief.`, 200);
    }
    return page("Something went wrong unsubscribing. Please email unsubscribe@arok.ai.", 502);
  } catch {
    return page("Something went wrong. Please email unsubscribe@arok.ai.", 502);
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
