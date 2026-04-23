// Thin wrapper around Pexels Search API. Returns a single food photo
// match for a dish name, or null if nothing relevant. Fails soft — a
// missing / invalid / rate-limited key returns null and the caller
// shows the day card without an image.
//
// Free tier is 200 req/hour, 20k/month — plenty for week planning
// (7-14 photos per plan) even without caching, but we keep an in-memory
// cache per function instance to dedupe rerolls.

const photoCache = new Map();
const MAX_CACHE = 500;

async function fetchOnePhoto(key, query) {
  const url = `https://api.pexels.com/v1/search?query=${encodeURIComponent(query + ' food')}&per_page=1&orientation=landscape`;
  const res = await fetch(url, {
    headers: { Authorization: key },
    signal: AbortSignal.timeout(5000),
  });
  if (!res.ok) return null;
  const data = await res.json();
  const photo = data.photos?.[0];
  if (!photo) return null;
  return {
    url:              photo.src?.medium || photo.src?.large || photo.src?.original,
    thumbnail:        photo.src?.small || photo.src?.tiny,
    photographer:     photo.photographer,
    photographer_url: photo.photographer_url,
    alt:              photo.alt || query,
  };
}

export async function searchPhoto(query) {
  const key = process.env.PEXELS_API_KEY;
  if (!key || !query) return null;

  const cacheKey = query.trim().toLowerCase();
  if (photoCache.has(cacheKey)) return photoCache.get(cacheKey);

  try {
    let result = await fetchOnePhoto(key, query);

    // If the full name returns nothing, try with the first 2 words (often
    // enough to find a good food photo, e.g. "Chicken Tikka" from "Chicken
    // Tikka Masala with Garlic Naan").
    if (!result) {
      const shortened = query.split(/\s+/).slice(0, 2).join(' ');
      if (shortened !== query) result = await fetchOnePhoto(key, shortened);
    }

    if (photoCache.size > MAX_CACHE) {
      const firstKey = photoCache.keys().next().value;
      photoCache.delete(firstKey);
    }
    photoCache.set(cacheKey, result ?? null);
    return result ?? null;
  } catch {
    return null;
  }
}
