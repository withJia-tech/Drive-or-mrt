/**
 * The small server: one web-standard handler, no host-specific features.
 * Vercel adapters live in the repo's top-level api/; a Cloudflare Worker would be
 *   export default { fetch: (req, env) => handle(req, env) }
 *
 * Holds the OneMap login and LTA key so they never ship in app code.
 * Never logs coordinates or query strings. Stores nothing about users.
 */
import {
  parseLatLng, corsHeaders, DEFAULT_ORIGINS, summariseItinerary, summariseAlerts, oneMapDateTime, summariseSearch,
} from './lib.js';

const ONEMAP = 'https://www.onemap.gov.sg';
const LTA_ALERTS = 'https://datamall2.mytransport.sg/ltaodataservice/TrainServiceAlerts';
const UPSTREAM_TIMEOUT_MS = 8000;

// Per-instance caches. Lost on cold start, which only costs one extra login.
let tokenCache = { token: null, expiresAt: 0 };
let alertsCache = { body: null, at: 0 };

/** For tests: start each case from a clean slate. */
export function _resetCaches() {
  tokenCache = { token: null, expiresAt: 0 };
  alertsCache = { body: null, at: 0 };
}

function reply(body, status, cors, extra = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...(cors || {}), ...extra },
  });
}

async function oneMapToken(env, fetchImpl, now) {
  // Refresh an hour early; token lifetime (~3 days) is from a secondary source.
  if (tokenCache.token && now < tokenCache.expiresAt - 3600_000) return tokenCache.token;
  const res = await fetchImpl(`${ONEMAP}/api/auth/post/getToken`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: env.ONEMAP_EMAIL, password: env.ONEMAP_PASSWORD }),
    signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`token ${res.status}`);
  const data = await res.json();
  if (!data?.access_token) throw new Error('token missing');
  const expirySec = Number(data.expiry_timestamp);
  tokenCache = {
    token: data.access_token,
    expiresAt: Number.isFinite(expirySec) ? expirySec * 1000 : now + 24 * 3600_000,
  };
  return tokenCache.token;
}

async function route(url, env, fetchImpl, now, cors) {
  const from = parseLatLng(url.searchParams.get('from'));
  const to = parseLatLng(url.searchParams.get('to'));
  if (!from || !to) return reply({ error: 'from and to must be lat,lng inside Singapore' }, 400, cors);
  if (!env.ONEMAP_EMAIL || !env.ONEMAP_PASSWORD) return reply({ error: 'not configured' }, 503, cors);

  const atParam = url.searchParams.get('at');
  const at = atParam ? new Date(atParam) : new Date(now);
  if (Number.isNaN(at.getTime())) return reply({ error: 'bad at' }, 400, cors);
  const { date, time } = oneMapDateTime(at);

  const q = new URLSearchParams({
    start: `${from.lat},${from.lng}`, end: `${to.lat},${to.lng}`,
    routeType: 'pt', mode: 'TRANSIT', date, time, maxWalkDistance: '1000', numItineraries: '3',
  });
  if (url.searchParams.get('arriveBy') === '1') q.set('arriveBy', 'true'); // assumed parameter

  const token = await oneMapToken(env, fetchImpl, now);
  const res = await fetchImpl(`${ONEMAP}/api/public/routingsvc/route?${q}`, {
    headers: { Authorization: token },
    signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
  });
  if (!res.ok) return reply({ error: `onemap ${res.status}` }, 502, cors);
  const summary = summariseItinerary(await res.json());
  if (!summary) return reply({ error: 'no route' }, 404, cors);
  return reply({ ...summary, source: 'onemap' }, 200, cors);
}

/** Place search. OneMap search needs no login. Never logs or echoes the query. */
async function search(url, fetchImpl, cors) {
  const q = (url.searchParams.get('q') || '').trim();
  if (q.length < 2 || q.length > 80) return reply({ error: 'q must be 2 to 80 characters' }, 400, cors);
  const params = new URLSearchParams({ searchVal: q, returnGeom: 'Y', getAddrDetails: 'Y', pageNum: '1' });
  const res = await fetchImpl(`${ONEMAP}/api/common/elastic/search?${params}`, {
    signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
  });
  if (!res.ok) return reply({ error: `onemap ${res.status}` }, 502, cors);
  return reply({ results: summariseSearch(await res.json()), source: 'onemap' }, 200, cors);
}

async function alerts(env, fetchImpl, now, cors) {
  if (!env.LTA_ACCOUNT_KEY) return reply({ error: 'not configured' }, 503, cors);
  if (alertsCache.body && now - alertsCache.at < 60_000) {
    return reply(alertsCache.body, 200, cors, { 'Cache-Control': 'public, max-age=60' });
  }
  const res = await fetchImpl(LTA_ALERTS, {
    headers: { AccountKey: env.LTA_ACCOUNT_KEY, accept: 'application/json' },
    signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
  });
  if (!res.ok) return reply({ error: `lta ${res.status}` }, 502, cors);
  const summary = summariseAlerts(await res.json());
  if (!summary) return reply({ error: 'unreadable' }, 502, cors);
  const body = { ...summary, source: 'lta', checkedAt: new Date(now).toISOString() };
  alertsCache = { body, at: now };
  return reply(body, 200, cors, { 'Cache-Control': 'public, max-age=60' });
}

/**
 * @param {Request} request
 * @param {Record<string,string>} env  secrets + optional ALLOWED_ORIGINS (comma-separated)
 * @param {{fetchImpl?: typeof fetch, now?: number}} deps  injectable for tests
 */
export async function handle(request, env = {}, { fetchImpl = fetch, now = Date.now() } = {}) {
  const url = new URL(request.url);
  const origin = request.headers.get('Origin');
  const allowed = env.ALLOWED_ORIGINS ? env.ALLOWED_ORIGINS.split(',').map((s) => s.trim()) : DEFAULT_ORIGINS;
  const cors = corsHeaders(origin, allowed);
  // Browsers from other sites are refused. No Origin (curl, a native widget) is allowed.
  if (origin && !cors) return reply({ error: 'origin not allowed' }, 403, null);
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors || {} });
  if (request.method !== 'GET') return reply({ error: 'GET only' }, 405, cors);

  try {
    if (url.pathname.endsWith('/route')) return await route(url, env, fetchImpl, now, cors);
    if (url.pathname.endsWith('/alerts')) return await alerts(env, fetchImpl, now, cors);
    if (url.pathname.endsWith('/search')) return await search(url, fetchImpl, cors);
    return reply({ error: 'not found' }, 404, cors);
  } catch (err) {
    // Message only: never the URL, which carries coordinates or what was typed.
    return reply({ error: 'upstream failed' }, 502, cors);
  }
}
