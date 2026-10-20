/**
 * Ask the small server for a real public-transport time (OneMap).
 *
 * Never throws and never blocks the answer: any failure (no server
 * configured, offline, slow, error) returns null, and the app falls back
 * to the family's own time or the labelled estimate.
 */

/** The small server (same Vercel project as the app). Empty = all network features off. */
export const PROXY_URL = 'https://driveormrt.vercel.app';

const fmt = ({ lat, lng }) => `${Number(lat).toFixed(5)},${Number(lng).toFixed(5)}`;

/**
 * @returns {Promise<{minutes:number, walkMinutes:number|null, transfers:number|null, legs:Array}|null>}
 */
export async function fetchTransitMinutes(from, to, {
  arriveBy = null, baseUrl = PROXY_URL, fetchImpl = globalThis.fetch, timeoutMs = 4000,
} = {}) {
  if (!baseUrl || !from || !to || typeof fetchImpl !== 'function') return null;
  const q = new URLSearchParams({ from: fmt(from), to: fmt(to) });
  if (arriveBy instanceof Date && !Number.isNaN(arriveBy.getTime())) {
    q.set('at', arriveBy.toISOString());
    q.set('arriveBy', '1');
  }
  try {
    const res = await fetchImpl(`${baseUrl.replace(/\/$/, '')}/api/route?${q}`, {
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) return null;
    const body = await res.json();
    return Number.isFinite(body?.minutes) && body.minutes > 0 ? body : null;
  } catch {
    return null;
  }
}

/**
 * Search places by name, address or postal code through the server (OneMap).
 * Never throws: any failure gives [] and the on-phone matches still show.
 */
export async function searchPlaces(query, {
  baseUrl = PROXY_URL, fetchImpl = globalThis.fetch, timeoutMs = 4000,
} = {}) {
  const q = String(query || '').trim();
  if (!baseUrl || q.length < 2 || q.length > 80 || typeof fetchImpl !== 'function') return [];
  try {
    const res = await fetchImpl(`${baseUrl.replace(/\/$/, '')}/api/search?${new URLSearchParams({ q })}`, {
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) return [];
    const body = await res.json();
    return Array.isArray(body?.results)
      ? body.results.filter((r) => r && typeof r.label === 'string' && Number.isFinite(r.lat) && Number.isFinite(r.lng))
      : [];
  } catch {
    return [];
  }
}
