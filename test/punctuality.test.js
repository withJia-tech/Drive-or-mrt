/**
 * Step 1 of "learn why she chooses" (2026-10-20): leaving time, arrival and
 * regret, recorded on the phone; her personal slip learned from them.
 * Every expected value is hand-checkable from the data above it.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { makeTripLog } from '../tripLog.js';
import { slipMinutes, pendingOutcome } from '../habits.js';

function memoryStorage() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)) };
}
const EVE = { band: 'evening', dayType: 'weekday', direction: 'work→home', purpose: null };
const MORN = { band: 'morning', dayType: 'weekday', direction: 'home→work', purpose: null };
const iso = (hhmm, day = 20) => new Date(`2026-10-${day}T${hhmm}:00+08:00`).toISOString();

describe('one trip, filled in over time', () => {
  test('"leaving now" first, then "I took": one record, both kept', () => {
    const log = makeTripLog(memoryStorage());
    const id = log.upsert({ at: iso('13:00'), context: EVE, shown: { recommended: 'mrt', suggestedLeaveBy: iso('13:18'), deadline: iso('14:00') }, leftAt: iso('13:26') });
    log.upsert({ id, chose: 'mrt' });
    const [r] = log.all();
    assert.equal(log.all().length, 1);
    assert.equal(r.v, 2);
    assert.equal(r.leftAt, iso('13:26'));
    assert.equal(r.chose, 'mrt');
    assert.equal(r.overrode, false);
    assert.equal(r.shown.suggestedLeaveBy, iso('13:18'));
  });

  test('costs and minutes shown at decision time are kept, as numbers only', () => {
    const log = makeTripLog(memoryStorage());
    log.upsert({ at: iso('13:00'), context: EVE, chose: 'drive', shown: { recommended: 'mrt', costs: { mrt: 3.6, drive: '13.45', grab: 16.79, lat: 1.3 }, minutes: { mrt: 31, drive: 17, grab: 19 } } });
    const [r] = log.all();
    assert.deepEqual(r.shown.costs, { mrt: 3.6, drive: 13.45, grab: 16.79 });
    assert.deepEqual(r.shown.minutes, { mrt: 31, drive: 17, grab: 19 });
  });

  test('outcome later: arrival and "same again"; junk values refused', () => {
    const log = makeTripLog(memoryStorage());
    const id = log.upsert({ at: iso('13:00'), context: EVE, chose: 'grab', shown: { recommended: 'mrt' } });
    log.upsert({ id, arrival: 'late', again: false, outcomeAsked: true });
    log.upsert({ id, arrival: 'very late', again: 'maybe' }); // ignored, keeps previous
    const [r] = log.all();
    assert.equal(r.arrival, 'late');
    assert.equal(r.again, false);
    assert.equal(r.outcomeAsked, true);
  });

  test('old v1 records still read and still count', () => {
    const store = memoryStorage();
    store.setItem('dom.tripLog.v1', JSON.stringify([{ v: 1, id: 'old', at: iso('08:00'), context: MORN, shown: { recommended: 'mrt', variant: 'show-only' }, chose: 'drive', overrode: true }]));
    const log = makeTripLog(store);
    log.upsert({ id: 'old', arrival: 'on-time' });
    const [r] = log.all();
    assert.equal(r.chose, 'drive');
    assert.equal(r.arrival, 'on-time');
  });

  test('upsert without a valid choice or anything useful: refused', () => {
    const log = makeTripLog(memoryStorage());
    assert.equal(log.upsert({ at: iso('13:00'), context: EVE, chose: 'boat' }), null);
    assert.equal(log.all().length, 0);
  });
});

/* A trip with a suggested leave-by and an actual leaving time. */
let n = 0;
const left = (ctx, lateBy, day = 1) => {
  n += 1;
  return {
    id: `t${n}`, at: iso('13:00', String(day).padStart(2, '0')), context: ctx,
    shown: { suggestedLeaveBy: iso('13:18', String(day).padStart(2, '0')) },
    leftAt: new Date(new Date(iso('13:18', String(day).padStart(2, '0'))).getTime() + lateBy * 60000).toISOString(),
  };
};

describe('her personal slip', () => {
  test('median of the last trips: late by 5, 8, 12 → 8 minutes', () => {
    const s = slipMinutes([left(EVE, 5, 1), left(EVE, 12, 2), left(EVE, 8, 3)], EVE);
    assert.equal(s.minutes, 8);
    assert.equal(s.of, 3);
  });

  test('fewer than 3 trips: no slip yet', () => {
    assert.equal(slipMinutes([left(EVE, 5), left(EVE, 9)], EVE), null);
  });

  test('she usually leaves early: no extra buffer, but it is reported', () => {
    const s = slipMinutes([left(EVE, -4, 1), left(EVE, -2, 2), left(EVE, -6, 3)], EVE);
    assert.equal(s.minutes, 0);
    assert.equal(s.median, -4);
  });

  test('capped at 30 minutes', () => {
    assert.equal(slipMinutes([left(EVE, 50, 1), left(EVE, 45, 2), left(EVE, 60, 3)], EVE).minutes, 30);
  });

  test('mornings and evenings are learned separately', () => {
    const log = [left(EVE, 10, 1), left(EVE, 10, 2), left(EVE, 10, 3), left(MORN, 2, 4), left(MORN, 2, 5), left(MORN, 2, 6)];
    assert.equal(slipMinutes(log, EVE).minutes, 10);
    assert.equal(slipMinutes(log, MORN).minutes, 2);
  });
});

describe('which trip to ask about next time she opens the app', () => {
  const NOW = new Date(iso('19:00'));
  test('the latest chosen trip, at least 20 minutes old, not yet asked', () => {
    const log = [
      { id: 'a', at: iso('09:00'), chose: 'drive', context: MORN, shown: {} },
      { id: 'b', at: iso('13:00'), chose: 'mrt', context: EVE, shown: { deadline: iso('14:00') } },
    ];
    const p = pendingOutcome(log, NOW);
    assert.equal(p.id, 'b');
    assert.equal(p.askArrival, true);
  });
  test('already asked, too recent, too old, or never chosen: nothing', () => {
    assert.equal(pendingOutcome([{ id: 'a', at: iso('13:00'), chose: 'mrt', outcomeAsked: true, shown: {} }], NOW), null);
    assert.equal(pendingOutcome([{ id: 'a', at: iso('18:50'), chose: 'mrt', shown: {} }], NOW), null);
    assert.equal(pendingOutcome([{ id: 'a', at: iso('13:00', 17), chose: 'mrt', shown: {} }], NOW), null);
    assert.equal(pendingOutcome([{ id: 'a', at: iso('13:00'), shown: {} }], NOW), null);
  });
  test('no deadline: only "same again?" is asked', () => {
    assert.equal(pendingOutcome([{ id: 'a', at: iso('13:00'), chose: 'mrt', shown: {} }], NOW).askArrival, false);
  });
});
