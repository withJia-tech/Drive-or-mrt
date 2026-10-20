/**
 * The small server (proxy/). Network is mocked; no real OneMap or LTA calls.
 *
 * FIXTURES ARE ASSUMED: the response shapes below come from secondary sources
 * (OpenTripPlanner-style for OneMap). Replace with real recorded responses
 * once credentials exist, then re-run.
 */
import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { parseLatLng, summariseItinerary, summariseAlerts, oneMapDateTime } from '../proxy/lib.js';
import { handle, _resetCaches } from '../proxy/handler.js';

const ONEMAP_ROUTE_ASSUMED = {
  plan: {
    itineraries: [
      { duration: 2460, walkTime: 540, transfers: 1, legs: [
        { mode: 'WALK' }, { mode: 'SUBWAY', route: 'NS' }, { mode: 'SUBWAY', route: 'EW' }, { mode: 'WALK' }] },
      { duration: 2100, walkTime: 600, transfers: 0, legs: [
        { mode: 'WALK' }, { mode: 'BUS', route: '145' }, { mode: 'WALK' }] },
    ],
  },
};
const LTA_ALERTS_ASSUMED = {
  value: { Status: 2, AffectedSegments: [{ Line: 'NEL' }, { Line: 'NEL' }], Message: [{ Content: 'NEL delay between HarbourFront and Dhoby Ghaut' }] },
};

const TOA_PAYOH = '1.3343,103.8563';
const SGH = '1.2793,103.8348';
const ENV = { ONEMAP_EMAIL: 'x@example.com', ONEMAP_PASSWORD: 'pw', LTA_ACCOUNT_KEY: 'k' };
const NOW = Date.parse('2026-10-20T12:00:00+08:00');

/** A fake fetch that answers by URL and records every call. */
function fakeFetch({ routeStatus = 200, routeBody = ONEMAP_ROUTE_ASSUMED } = {}) {
  const calls = [];
  const impl = async (url, init = {}) => {
    calls.push({ url: String(url), init });
    const u = String(url);
    if (u.includes('/getToken')) {
      return Response.json({ access_token: 'T', expiry_timestamp: String(NOW / 1000 + 3 * 86400) });
    }
    if (u.includes('/routingsvc/route')) return Response.json(routeBody, { status: routeStatus });
    if (u.includes('TrainServiceAlerts')) return Response.json(LTA_ALERTS_ASSUMED);
    throw new Error('unexpected ' + u);
  };
  return { impl, calls };
}
const req = (path, headers = {}) => new Request(`https://proxy.example${path}`, { headers });

beforeEach(() => _resetCaches());

describe('pure helpers', () => {
  test('coordinates: Singapore only', () => {
    assert.deepEqual(parseLatLng(TOA_PAYOH), { lat: 1.3343, lng: 103.8563 });
    assert.equal(parseLatLng('51.5,-0.12'), null);      // London
    assert.equal(parseLatLng('1.3,103.8,9'), null);
    assert.equal(parseLatLng('abc'), null);
    assert.equal(parseLatLng(null), null);
  });

  test('fastest itinerary wins; minutes rounded; walking legs dropped', () => {
    const s = summariseItinerary(ONEMAP_ROUTE_ASSUMED);
    assert.equal(s.minutes, 35); // 2100 s
    assert.equal(s.walkMinutes, 10);
    assert.equal(s.transfers, 0);
    assert.deepEqual(s.legs, [{ mode: 'BUS', line: '145' }]);
  });

  test('no usable route is null, not zero minutes', () => {
    assert.equal(summariseItinerary({}), null);
    assert.equal(summariseItinerary({ plan: { itineraries: [] } }), null);
    assert.equal(summariseItinerary({ plan: { itineraries: [{ duration: 0 }] } }), null);
  });

  test('alerts: disrupted, unique lines, first message', () => {
    assert.deepEqual(summariseAlerts(LTA_ALERTS_ASSUMED), {
      disrupted: true, lines: ['NEL'], message: 'NEL delay between HarbourFront and Dhoby Ghaut',
    });
    assert.equal(summariseAlerts({ value: { Status: 1 } }).disrupted, false);
  });

  test('OneMap date and time are Singapore time', () => {
    assert.deepEqual(oneMapDateTime(new Date('2026-10-20T04:05:06Z')), { date: '10-20-2026', time: '12:05:06' });
  });
});

describe('handler', () => {
  test('route: happy path returns only the summary', async () => {
    const f = fakeFetch();
    const res = await handle(req(`/api/route?from=${TOA_PAYOH}&to=${SGH}`), ENV, { fetchImpl: f.impl, now: NOW });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.deepEqual(Object.keys(body).sort(), ['legs', 'minutes', 'source', 'transfers', 'walkMinutes']);
    assert.equal(body.source, 'onemap');
    assert.equal(f.calls[1].init.headers.Authorization, 'T');
  });

  test('the OneMap token is reused, not fetched every time', async () => {
    const f = fakeFetch();
    for (let i = 0; i < 3; i += 1) {
      await handle(req(`/api/route?from=${TOA_PAYOH}&to=${SGH}`), ENV, { fetchImpl: f.impl, now: NOW });
    }
    assert.equal(f.calls.filter((c) => c.url.includes('getToken')).length, 1);
  });

  test('bad or foreign coordinates are refused before any network call', async () => {
    const f = fakeFetch();
    const res = await handle(req(`/api/route?from=51.5,-0.12&to=${SGH}`), ENV, { fetchImpl: f.impl, now: NOW });
    assert.equal(res.status, 400);
    assert.equal(f.calls.length, 0);
  });

  test('missing secrets: 503, so the app falls back', async () => {
    const res = await handle(req(`/api/route?from=${TOA_PAYOH}&to=${SGH}`), {}, { fetchImpl: fakeFetch().impl, now: NOW });
    assert.equal(res.status, 503);
  });

  test('a browser on another site is refused', async () => {
    const res = await handle(req('/api/alerts', { Origin: 'https://evil.example' }), ENV, { fetchImpl: fakeFetch().impl, now: NOW });
    assert.equal(res.status, 403);
  });

  test('the app origin gets CORS headers', async () => {
    const res = await handle(req('/api/alerts', { Origin: 'https://withjia-tech.github.io' }), ENV, { fetchImpl: fakeFetch().impl, now: NOW });
    assert.equal(res.headers.get('Access-Control-Allow-Origin'), 'https://withjia-tech.github.io');
  });

  test('upstream failure never echoes the coordinates', async () => {
    const boom = async () => { throw new Error(`failed for ${TOA_PAYOH}`); };
    const res = await handle(req(`/api/route?from=${TOA_PAYOH}&to=${SGH}`), ENV, { fetchImpl: boom, now: NOW });
    assert.equal(res.status, 502);
    assert.doesNotMatch(await res.text(), /1\.3343|103\.8563/);
  });

  test('alerts are cached for 60 seconds', async () => {
    const f = fakeFetch();
    await handle(req('/api/alerts'), ENV, { fetchImpl: f.impl, now: NOW });
    await handle(req('/api/alerts'), ENV, { fetchImpl: f.impl, now: NOW + 30_000 });
    await handle(req('/api/alerts'), ENV, { fetchImpl: f.impl, now: NOW + 61_000 });
    assert.equal(f.calls.filter((c) => c.url.includes('TrainServiceAlerts')).length, 2);
  });
});
