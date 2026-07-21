// NEXUS local-news proxy — a Cloudflare Worker (free tier is plenty).
//
// Why this exists: visitors' browsers can fetch weather directly from the
// National Weather Service, but Google News RSS blocks cross-origin browser
// requests. This tiny proxy fetches the local-news feed server-side and
// returns it with CORS enabled, so every visitor can get local news for
// THEIR zipcode on a fully static site.
//
// Deploy (~3 minutes):
//   1. dash.cloudflare.com → Workers & Pages → Create → Worker
//   2. Name it (e.g. "nexus-local"), deploy the hello-world, then Edit Code
//   3. Replace everything with this file → Deploy
//   4. Copy the worker URL (https://nexus-local.YOUR-SUBDOMAIN.workers.dev)
//      into "localNewsProxy" in nexus.config.json and commit.

export default {
  async fetch(request) {
    const cors = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Content-Type": "application/json",
      "Cache-Control": "public, max-age=600", // 10-minute edge cache
    };
    if (request.method === "OPTIONS") return new Response(null, { headers: cors });

    const zip = new URL(request.url).searchParams.get("zip") || "";
    if (!/^\d{5}$/.test(zip)) {
      return new Response(JSON.stringify({ error: "zip must be 5 digits" }), { status: 400, headers: cors });
    }

    try {
      const zipRes = await fetch(`https://api.zippopotam.us/us/${zip}`, {
        cf: { cacheTtl: 86400, cacheEverything: true },
      });
      if (!zipRes.ok) {
        return new Response(JSON.stringify({ error: "unknown zip" }), { status: 404, headers: cors });
      }
      const zipData = await zipRes.json();
      const p = zipData.places?.[0];
      const place = { city: p["place name"], state: p["state abbreviation"] };
      const stateFull = p["state"] || place.state; // "Utah", not "UT"

      // Quote the city (keeps results local) with the UNQUOTED full state name —
      // requiring the quoted abbreviation "UT" returns almost nothing, since
      // articles say "Utah". If that's still empty (small towns), fall back to
      // the bare quoted city so visitors always get something.
      // Google News RSS returns a "Sorry" block page to non-browser User-Agents
      // from datacenter IPs, so we must present a realistic desktop browser UA.
      const BROWSER_HEADERS = {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
      };

      const queries = [`"${place.city}" ${stateFull}`, `"${place.city}"`];
      let xml = "";
      for (const query of queries) {
        const feedUrl = `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=en-US&gl=US&ceid=US:en`;
        const feedRes = await fetch(feedUrl, {
          headers: BROWSER_HEADERS,
          cf: { cacheTtl: 600, cacheEverything: true },
        });
        xml = await feedRes.text();
        if (xml.includes("<item>")) break; // got results — stop
      }

      return new Response(JSON.stringify({ place, xml }), { headers: cors });
    } catch (e) {
      return new Response(JSON.stringify({ error: e.message }), { status: 502, headers: cors });
    }
  },
};
