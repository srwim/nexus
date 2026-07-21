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

export default {
  async fetch(request, env) {
    const cors = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Content-Type": "application/json",
      "Cache-Control": "public, max-age=900", // 15-min edge cache — conserves the daily API quota
    };
    if (request.method === "OPTIONS") return new Response(null, { headers: cors });

    const zip = new URL(request.url).searchParams.get("zip") || "";
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

// ── Using NewsData.io instead? (free 200 credits/day) ────────────────────────
// Swap the apiUrl + parsing for:
//   const apiUrl = `https://newsdata.io/api/1/latest?apikey=${env.GNEWS_KEY}` +
//     `&q=${encodeURIComponent(`"${place.city}"`)}&country=us&language=en`;
//   const items = (data.results || []).map((a) => ({
//     title: a.title || "", link: a.link || "", source: a.source_id || "",
//     date: a.pubDate || null, summary: a.description || "",
//   }));
