/**
 * App-side client for the small server, and the train-time precedence:
 * your own time > OneMap > estimate.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { fetchTransitMinutes } from '../transit.js';
import { scheduleDurations } from '../calc.js';

const FROM = { lat: 1.3343, lng: 103.8563 };
const TO = { lat: 1.2793, lng: 103.8348 };
const ok = (body) => async () => Response.json(body);

describe('fetchTransitMinutes never blocks the answer', () => {
  test('no server configured: null, no network call', async () => {
    let called = false;
    const out = await fetchTransitMinutes(FROM, TO, { baseUrl: '', fetchImpl: async () => { called = true; } });
    assert.equal(out, null);
    assert.equal(called, false);
  });

  test('server answers: minutes come through', async () => {
    const out = await fetchTransitMinutes(FROM, TO, { baseUrl: 'https://p.example', fetchImpl: ok({ minutes: 35, source: 'onemap' }) });
    assert.equal(out.minutes, 35);
  });

  test('server error, offline, or nonsense: null', async () => {
    const base = { baseUrl: 'https://p.example' };
    assert.equal(await fetchTransitMinutes(FROM, TO, { ...base, fetchImpl: async () => new Response('x', { status: 503 }) }), null);
    assert.equal(await fetchTransitMinutes(FROM, TO, { ...base, fetchImpl: async () => { throw new TypeError('offline'); } }), null);
    assert.equal(await fetchTransitMinutes(FROM, TO, { ...base, fetchImpl: ok({ minutes: 0 }) }), null);
  });

  test('slow server: gives up at the timeout', async () => {
    const slow = (url, { signal }) => new Promise((resolve, reject) => {
      const t = setTimeout(() => resolve(Response.json({ minutes: 35 })), 2000);
      signal.addEventListener('abort', () => { clearTimeout(t); reject(signal.reason); });
    });
    const started = Date.now();
    const out = await fetchTransitMinutes(FROM, TO, { baseUrl: 'https://p.example', fetchImpl: slow, timeoutMs: 50 });
    assert.equal(out, null);
    assert.ok(Date.now() - started < 1000);
  });

  test('arrive-by time is passed on', async () => {
    let seen;
    await fetchTransitMinutes(FROM, TO, {
      baseUrl: 'https://p.example', arriveBy: new Date('2026-10-20T06:00:00Z'),
      fetchImpl: async (url) => { seen = new URL(url); return Response.json({ minutes: 35 }); },
    });
    assert.equal(seen.searchParams.get('arriveBy'), '1');
    assert.equal(seen.searchParams.get('at'), '2026-10-20T06:00:00.000Z');
    assert.equal(seen.searchParams.get('from'), '1.33430,103.85630');
  });
});

const SPEEDS = { driveKmh: 40, driveBufferMin: 4, mrtKmh: 25, grabKmh: 40, grabBufferMin: 6, grabWaitWorstMin: 15 };
const TRIP = { distance: 8.9, walkTime: 10 };

describe('train time precedence: yours > OneMap > estimate', () => {
  test('OneMap replaces the estimate', () => {
    const d = scheduleDurations(TRIP, SPEEDS, { transitMinutes: 38 });
    assert.equal(d.durations.mrt, 38);
    assert.equal(d.sources.mrt, 'onemap');
  });

  test('your own time beats OneMap', () => {
    const d = scheduleDurations(TRIP, SPEEDS, { mrtMinutes: 35, transitMinutes: 38 });
    assert.equal(d.durations.mrt, 35);
    assert.equal(d.sources.mrt, 'yours');
  });

  test('neither: estimate', () => {
    const d = scheduleDurations(TRIP, SPEEDS, { transitMinutes: null });
    assert.equal(d.sources.mrt, 'estimate');
  });
});
