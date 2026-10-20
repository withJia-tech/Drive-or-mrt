/**
 * Learning from her choices, show-only (owner decision 2026-10-20).
 * Patterns are counted, not inferred: every expected value here can be
 * checked by hand from the log above it.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { contextOf, directionOf, patternFor, describePattern } from '../habits.js';
import { makeTripLog } from '../tripLog.js';
import { FARE_DEFAULTS } from '../defaults.js';

const BANDS = FARE_DEFAULTS.habits.bands;
const sg = (iso) => new Date(`${iso}+08:00`);

describe('situation, in Singapore time', () => {
  test('band edges', () => {
    // 2026-10-20 is a Tuesday.
    assert.equal(contextOf(sg('2026-10-20T04:59'), {}, BANDS).band, 'late');
    assert.equal(contextOf(sg('2026-10-20T05:00'), {}, BANDS).band, 'morning');
    assert.equal(contextOf(sg('2026-10-20T09:59'), {}, BANDS).band, 'morning');
    assert.equal(contextOf(sg('2026-10-20T10:00'), {}, BANDS).band, 'day');
    assert.equal(contextOf(sg('2026-10-20T17:00'), {}, BANDS).band, 'evening');
    assert.equal(contextOf(sg('2026-10-20T21:00'), {}, BANDS).band, 'late');
  });

  test('Singapore time, not the machine clock: 01:30 UTC is 09:30 in Singapore', () => {
    assert.equal(contextOf(new Date('2026-10-20T01:30:00Z'), {}, BANDS).band, 'morning');
  });

  test('weekday vs weekend, by the Singapore date', () => {
    assert.equal(contextOf(sg('2026-10-24T12:00'), {}, BANDS).dayType, 'weekend'); // Saturday
    assert.equal(contextOf(sg('2026-10-20T12:00'), {}, BANDS).dayType, 'weekday');
    // Friday 23:30 UTC is already Saturday 07:30 in Singapore.
    assert.equal(contextOf(new Date('2026-10-23T23:30:00Z'), {}, BANDS).dayType, 'weekend');
  });

  test('direction and purpose pass through; defaults are honest', () => {
    const c = contextOf(sg('2026-10-20T18:30'), { direction: 'work→home', purpose: 'errand' }, BANDS);
    assert.deepEqual(c, { band: 'evening', dayType: 'weekday', direction: 'work→home', purpose: 'errand' });
    assert.deepEqual(contextOf(sg('2026-10-20T18:30'), {}, BANDS),
      { band: 'evening', dayType: 'weekday', direction: 'other', purpose: null });
  });
});

describe('trip direction from saved Home and Work', () => {
  const places = { home: { lat: 1.3343, lng: 103.8563 }, work: { lat: 1.2834, lng: 103.8513 } };
  test('within 300 m counts as being there', () => {
    // ~0.11 km from home -> work
    assert.equal(directionOf({ lat: 1.3353, lng: 103.8563 }, places.work, places, 300), 'home→work');
    assert.equal(directionOf(places.work, places.home, places, 300), 'work→home');
    assert.equal(directionOf(places.work, { lat: 1.3000, lng: 103.8400 }, places, 300), 'work→other');
  });
  test('without saved places, or far from both: other', () => {
    assert.equal(directionOf(places.home, places.work, {}, 300), 'other');
    assert.equal(directionOf({ lat: 1.40, lng: 103.90 }, { lat: 1.30, lng: 103.80 }, places, 300), 'other');
  });
});

/* A log entry; `at` only orders entries. */
let t = 0;
const trip = (chose, ctx) => ({ at: new Date(Date.UTC(2026, 9, 1) + (t += 60000)).toISOString(), chose, context: ctx });
const EVE = { band: 'evening', dayType: 'weekday', direction: 'work→home', purpose: null };
const EVE_ERRAND = { ...EVE, purpose: 'errand' };
const MORNING = { band: 'morning', dayType: 'weekday', direction: 'home→work', purpose: null };

describe('patterns: 3 of the last 5, most specific situation first', () => {
  test('2 of 5 is not a pattern; 3 of 5 is', () => {
    const two = ['mrt', 'mrt', 'grab', 'drive', 'grab'].map((m) => trip(m, EVE));
    assert.equal(patternFor(two, EVE, { minSame: 3, window: 5 }), null);
    const three = ['mrt', 'grab', 'mrt', 'drive', 'mrt'].map((m) => trip(m, EVE));
    assert.deepEqual(patternFor(three, EVE, { minSame: 3, window: 5 }),
      { mode: 'mrt', count: 3, of: 5, level: ['band', 'direction', 'dayType', 'purpose'] });
  });

  test('only the last 5 count: old habits fade', () => {
    const log = [...['mrt', 'mrt', 'mrt'].map((m) => trip(m, EVE)), ...['grab', 'grab', 'grab', 'mrt', 'drive'].map((m) => trip(m, EVE))];
    assert.equal(patternFor(log, EVE, { minSame: 3, window: 5 }).mode, 'grab');
  });

  test('too little data in the exact situation: back off to a broader one', () => {
    // Only 1 errand evening, but 4 plain weekday evenings work→home.
    const log = [...['mrt', 'mrt', 'mrt', 'drive'].map((m) => trip(m, EVE)), trip('grab', EVE_ERRAND)];
    const p = patternFor(log, EVE_ERRAND, { minSame: 3, window: 5 });
    assert.equal(p.mode, 'mrt');
    assert.deepEqual(p.level, ['band', 'direction', 'dayType']);
    assert.equal(p.count, 3);
    assert.equal(p.of, 5); // 4 plain + 1 errand evening share band, direction, dayType
  });

  test('enough data but genuinely mixed: no pattern, no back-off', () => {
    const log = ['mrt', 'grab', 'drive', 'mrt', 'grab'].map((m) => trip(m, EVE));
    assert.equal(patternFor(log, EVE, { minSame: 3, window: 5 }), null);
  });

  test("the owner's example: mornings drive, evenings MRT", () => {
    const log = [
      ...['drive', 'grab', 'drive', 'drive'].map((m) => trip(m, MORNING)),
      ...['mrt', 'mrt', 'mrt', 'grab'].map((m) => trip(m, EVE)),
    ];
    assert.equal(patternFor(log, MORNING, { minSame: 3, window: 5 }).mode, 'drive');
    assert.equal(patternFor(log, EVE, { minSame: 3, window: 5 }).mode, 'mrt');
  });

  test('empty or junk log: null, no crash', () => {
    assert.equal(patternFor([], EVE), null);
    assert.equal(patternFor([{ chose: 'teleport', context: EVE }, null, {}], EVE), null);
  });
});

describe('the pattern line says exactly which situation it counted', () => {
  test('full level', () => {
    const p = { mode: 'mrt', count: 4, of: 5, level: ['band', 'direction', 'dayType', 'purpose'] };
    assert.equal(describePattern(p, EVE_ERRAND, BANDS),
      'Weekday evenings, work → home, errands: you took the MRT 4 of the last 5 times.');
  });
  test('backed-off level drops what it ignored', () => {
    const p = { mode: 'drive', count: 3, of: 4, level: ['band'] };
    assert.equal(describePattern(p, MORNING, BANDS), 'Mornings: you drove 3 of the last 4 times.');
  });
});

/* In-memory stand-in for localStorage. */
function memoryStorage() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) };
}
const throwing = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); }, removeItem() { throw new Error('blocked'); } };

describe('trip log on the phone', () => {
  test('one tap records; a second tap changes it rather than adding', () => {
    const log = makeTripLog(memoryStorage());
    const id = log.record({ at: '2026-10-20T10:30:00.000Z', context: EVE, shown: { recommended: 'grab' }, chose: 'grab' });
    log.record({ id, at: '2026-10-20T10:30:00.000Z', context: EVE, shown: { recommended: 'grab' }, chose: 'mrt' });
    const all = log.all();
    assert.equal(all.length, 1);
    assert.equal(all[0].chose, 'mrt');
    assert.equal(all[0].overrode, true);
    assert.equal(all[0].shown.variant, 'show-only');
  });

  test('never stores coordinates, whatever it is handed', () => {
    const log = makeTripLog(memoryStorage());
    log.record({ at: '2026-10-20T10:30:00.000Z', context: { ...EVE, lat: 1.3, lng: 103.8 }, shown: { recommended: 'mrt' }, chose: 'mrt', origin: { lat: 1.3343, lng: 103.8563 } });
    const text = log.exportJson();
    assert.doesNotMatch(text, /lat|lng|1\.3343|103\.85/);
  });

  test('blocked storage: no crash, empty log, record is a no-op', () => {
    const log = makeTripLog(throwing);
    assert.deepEqual(log.all(), []);
    assert.doesNotThrow(() => log.record({ at: '2026-10-20T10:30:00.000Z', context: EVE, shown: { recommended: 'mrt' }, chose: 'mrt' }));
  });

  test('no storage at all: record reports failure instead of claiming success', () => {
    const log = makeTripLog(null);
    assert.equal(log.record({ at: '2026-10-20T10:30:00.000Z', context: EVE, shown: { recommended: 'mrt' }, chose: 'mrt' }), null);
  });

  test('capped at 500, oldest dropped', () => {
    const log = makeTripLog(memoryStorage());
    for (let i = 0; i < 505; i += 1) {
      log.record({ at: new Date(Date.UTC(2026, 0, 1) + i * 60000).toISOString(), context: EVE, shown: { recommended: 'mrt' }, chose: 'mrt' });
    }
    const all = log.all();
    assert.equal(all.length, 500);
    assert.equal(all[0].at, new Date(Date.UTC(2026, 0, 1) + 5 * 60000).toISOString());
  });

  test('invalid choice is refused', () => {
    const log = makeTripLog(memoryStorage());
    assert.equal(log.record({ at: '2026-10-20T10:30:00.000Z', context: EVE, shown: { recommended: 'mrt' }, chose: 'boat' }), null);
    assert.equal(log.all().length, 0);
  });
});
