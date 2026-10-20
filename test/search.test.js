/** Typing a place: on-phone matches first, server results added, never blocking. */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { localMatches, mergeResults } from '../places.js';
import { searchPlaces } from '../transit.js';
import { makeCarSettings } from '../tripLog.js';
import { LANDMARK_DEFAULTS } from '../defaults.js';

const PLACES = [
  { id: 'saved:home', label: 'Home', group: 'Your places', lat: 1.33, lng: 103.85 },
  ...LANDMARK_DEFAULTS.places,
];

describe('on-phone matches', () => {
  test('every typed word must match; saved places come first', () => {
    assert.equal(localMatches('home', PLACES)[0].id, 'saved:home');
    assert.equal(localMatches('tan tock', PLACES)[0].id, 'ttsh');
    assert.deepEqual(localMatches('tock tan', PLACES).map((p) => p.id), ['ttsh']);
    assert.deepEqual(localMatches('', PLACES), []);
    assert.deepEqual(localMatches('zzzz', PLACES), []);
  });
  test('words match from their start: "ta" is not every hospi-ta-l', () => {
    assert.deepEqual(localMatches('ta', PLACES).map((p) => p.id), ['ttsh', 'tampines-mall']);
    assert.deepEqual(localMatches('vivo', PLACES).map((p) => p.id), ['vivocity']);
  });
  test('server duplicates of an on-phone match are dropped', () => {
    const local = localMatches('tan tock', PLACES);
    const merged = mergeResults(local, [{ label: 'TAN TOCK SENG HOSPITAL', lat: 1.32, lng: 103.84 }, { label: 'Tan Tock Seng Hospital (Blk 2)', lat: 1.32, lng: 103.84 }]);
    assert.equal(merged.length, 2);
    assert.equal(merged[1].label, 'Tan Tock Seng Hospital (Blk 2)');
  });
});

describe('searchPlaces never blocks', () => {
  const ok = (body) => async () => Response.json(body);
  test('results pass through; junk filtered', async () => {
    const out = await searchPlaces('ttsh', { baseUrl: 'https://p.example', fetchImpl: ok({ results: [{ label: 'A', lat: 1.3, lng: 103.8 }, { label: 'B' }] }) });
    assert.deepEqual(out, [{ label: 'A', lat: 1.3, lng: 103.8 }]);
  });
  test('short query, no server, error, offline: empty list and no throw', async () => {
    let calls = 0;
    const count = async () => { calls += 1; return Response.json({}); };
    assert.deepEqual(await searchPlaces('a', { baseUrl: 'https://p.example', fetchImpl: count }), []);
    assert.deepEqual(await searchPlaces('ttsh', { baseUrl: '', fetchImpl: count }), []);
    assert.equal(calls, 0);
    assert.deepEqual(await searchPlaces('ttsh', { baseUrl: 'https://p.example', fetchImpl: async () => new Response('x', { status: 502 }) }), []);
    assert.deepEqual(await searchPlaces('ttsh', { baseUrl: 'https://p.example', fetchImpl: async () => { throw new TypeError('offline'); } }), []);
  });
});

function memoryStorage() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)) };
}

describe('your car, set once', () => {
  test('saved and read back', () => {
    const car = makeCarSettings(memoryStorage());
    assert.equal(car.get(), null);
    assert.equal(car.set({ petrol: '2.66', fuel: '14' }), true);
    assert.deepEqual(car.get(), { petrol: 2.66, fuel: 14 });
  });
  test('absurd values are refused, not saved', () => {
    const car = makeCarSettings(memoryStorage());
    assert.equal(car.set({ petrol: 0, fuel: 14 }), false);
    assert.equal(car.set({ petrol: 3, fuel: 0 }), false);
    assert.equal(car.get(), null);
  });
  test('no storage: refuses honestly', () => {
    assert.equal(makeCarSettings(null).set({ petrol: 3, fuel: 12 }), false);
  });
});
