/**
 * Pure helpers for the small server. No network, no environment, no logging,
 * so every rule here is unit-tested in Node (test/proxy.test.js).
 *
 * ASSUMED SHAPES: the OneMap routing and LTA alert response shapes below come
 * from secondary sources, not official docs. Replace the test fixtures with
 * real recorded responses once the owner's credentials exist.
 */

/** Rough Singapore bounding box. Anything outside is refused, not routed. */
const SG = { latMin: 1.15, latMax: 1.48, lngMin: 103.59, lngMax: 104.1 };

/** "1.3343,103.8563" → { lat, lng } inside Singapore, or null. */
export function parseLatLng(text) {
  if (typeof text !== 'string') return null;
  const parts = text.split(',');
  if (parts.length !== 2) return null;
  const lat = Number(parts[0]);
  const lng = Number(parts[1]);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat < SG.latMin || lat > SG.latMax || lng < SG.lngMin || lng > SG.lngMax) return null;
  return { lat, lng };
}

/** CORS headers for an allowed origin; null if the origin is not allowed. */
export function corsHeaders(origin, allowed) {
  if (!origin || !allowed.includes(origin)) return null;
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}

export const DEFAULT_ORIGINS = [
  'https://withjia-tech.github.io',
  'http://127.0.0.1:8099',
  'http://localhost:8099',
  'capacitor://localhost', // the native app, later
];

/**
 * OneMap public-transport plan → the few numbers the app needs.
 * Picks the fastest itinerary. Durations in OneMap's response are seconds
 * (assumed, OpenTripPlanner-style). Returns null if there is no usable route.
 */
export function summariseItinerary(json) {
  const itineraries = json?.plan?.itineraries;
  if (!Array.isArray(itineraries) || itineraries.length === 0) return null;
  const valid = itineraries.filter((it) => Number.isFinite(it?.duration) && it.duration > 0);
  if (valid.length === 0) return null;
  const best = valid.reduce((a, b) => (b.duration < a.duration ? b : a));
  const legs = Array.isArray(best.legs) ? best.legs : [];
  return {
    minutes: Math.round(best.duration / 60),
    walkMinutes: Number.isFinite(best.walkTime) ? Math.round(best.walkTime / 60) : null,
    transfers: Number.isFinite(best.transfers) ? best.transfers : null,
    legs: legs
      .filter((leg) => leg?.mode && leg.mode !== 'WALK')
      .map((leg) => ({ mode: String(leg.mode), line: leg.route ? String(leg.route) : null })),
  };
}

/**
 * LTA TrainServiceAlerts → { disrupted, lines, message }.
 * Status 1 = normal, 2 = disrupted (assumed from secondary sources).
 */
export function summariseAlerts(json) {
  const v = json?.value;
  if (!v || typeof v !== 'object') return null;
  const segments = Array.isArray(v.AffectedSegments) ? v.AffectedSegments : [];
  const messages = Array.isArray(v.Message) ? v.Message : [];
  return {
    disrupted: Number(v.Status) === 2,
    lines: [...new Set(segments.map((s) => s?.Line).filter(Boolean).map(String))],
    message: messages.map((m) => m?.Content).filter(Boolean).map(String)[0] || null,
  };
}

/** OneMap wants MM-DD-YYYY and HH:MM:SS in Singapore time. */
export function oneMapDateTime(date) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Singapore', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  }).formatToParts(date).map((p) => [p.type, p.value]));
  return { date: `${parts.month}-${parts.day}-${parts.year}`, time: `${parts.hour}:${parts.minute}:${parts.second}` };
}
