/**
 * Ask the small server for a real public-transport time (OneMap).
 *
 * Never throws and never blocks the answer: any failure (no server
 * configured, offline, slow, error) returns null, and the app falls back
 * to the family's own time or the labelled estimate.
 */

/** Set once the server is deployed, e.g. 'https://drive-or-mrt-proxy.vercel.app'. Empty = feature off. */
export const PROXY_URL = '';

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
