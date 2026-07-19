// Zipcode -> place + coordinates via zippopotam.us (free, no key).
const zipCache = new Map();

export async function lookupZip(zip) {
  if (!/^\d{5}$/.test(zip)) return null;
  if (zipCache.has(zip)) return zipCache.get(zip);
  try {
    const res = await fetch(`https://api.zippopotam.us/us/${zip}`);
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
