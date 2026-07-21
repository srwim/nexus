// Zipcode + weather lookups. Dependency-free and isomorphic: used by the
// build/newsletter scripts in Node AND directly in visitors' browsers
// (zippopotam.us and api.weather.gov both allow cross-origin requests).

const NWS_HEADERS = {
  "User-Agent": "NEXUS/1.0 (personal news reader)", // browsers drop this; Node sends it
  Accept: "application/geo+json",
};

// Hard-timeout wrapper. api.weather.gov and zippopotam occasionally hang;
// without this the build's data-fetch step can run for hours. AbortController
// works in both Node 20+ and browsers.
async function fetchT(url, opts = {}, ms = 8000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { ...opts, signal: ctrl.signal });
  } finally {
    clearTimeout(timer);
  }
}

const zipCache = new Map();

export async function lookupZip(zip) {
  if (!/^\d{5}$/.test(zip || "")) return null;
  if (zipCache.has(zip)) return zipCache.get(zip);
  try {
    const res = await fetchT(`https://api.zippopotam.us/us/${zip}`);
    if (!res.ok) return null;
    const data = await res.json();
    const place = data.places?.[0];
    if (!place) return null;
    const info = {
      city: place["place name"],
      state: place["state abbreviation"],
      lat: place.latitude,
      lon: place.longitude,
    };
    zipCache.set(zip, info);
    return info;
  } catch {
    return null;
  }
}

export async function getWeather(zip) {
  const out = { local: null, alerts: [] };
  try {
    const place = zip ? await lookupZip(zip) : null;
    if (place) {
      const ptRes = await fetchT(`https://api.weather.gov/points/${place.lat},${place.lon}`, {
        headers: NWS_HEADERS,
      });
      if (ptRes.ok) {
        const pt = await ptRes.json();
        const fcRes = await fetchT(pt.properties.forecast, { headers: NWS_HEADERS });
        if (fcRes.ok) {
          const fc = await fcRes.json();
          out.local = {
            city: place.city,
            state: place.state,
            periods: (fc.properties.periods || []).slice(0, 4).map((p) => ({
              name: p.name,
              temp: `${p.temperature}°${p.temperatureUnit}`,
              short: p.shortForecast,
              detailed: p.detailedForecast,
            })),
          };
        }
      }
    }
    // NWS rejects `limit` on /alerts/active with a 400 — omit it and cap the
    // results client-side (below) instead.
    const alertRes = await fetchT(
      "https://api.weather.gov/alerts/active?severity=Extreme,Severe",
      { headers: NWS_HEADERS }
    );
    if (alertRes.ok) {
      const alerts = await alertRes.json();
      out.alerts = (alerts.features || []).slice(0, 8).map((f) => ({
        title: f.properties.headline || f.properties.event,
        area: f.properties.areaDesc,
        severity: f.properties.severity,
        link: f.properties["@id"] || "https://www.weather.gov/alerts",
      }));
    }
  } catch {
    /* weather never breaks anything */
  }
  return out;
}
