/**
 * Step 2 (2026-10-20): what her choices say. Counted, not inferred.
 * Costs are return-trip totals and minutes are one way, as the app shows
 * them, so time saved per trip is 2 × the one-way difference.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { valueOfTimeBounds, outcomeSummary, situationLabel, describeValueOfTime } from '../habits.js';
import { FARE_DEFAULTS } from '../defaults.js';

const BANDS = FARE_DEFAULTS.habits.bands;
const MORN = { band: 'morning', dayType: 'weekday', direction: 'home→work', purpose: null };
const EVE = { band: 'evening', dayType: 'weekday', direction: 'work→home', purpose: null };
let n = 0;
const trip = (ctx, chose, costs, minutes, extra = {}) => ({
  id: `t${(n += 1)}`, at: new Date(Date.UTC(2026, 9, 1, 0, n)).toISOString(), context: ctx, chose,
  shown: { costs, minutes }, ...extra,
});
// Only two modes compared, so each trip gives one clean bound.
const PAID = (ctx, dollars, minsSaved) => trip(ctx, 'drive', { drive: 3.6 + dollars, mrt: 3.6 }, { drive: 30 - minsSaved / 2, mrt: 30 });
const SAVED = (ctx, dollars, minsLost) => trip(ctx, 'mrt', { drive: 3.6 + dollars, mrt: 3.6 }, { drive: 30 - minsLost / 2, mrt: 30 });

describe('value of time from what she chose', () => {
  test('paid $10 more to save 20 min (per trip) → at least $30/hr', () => {
    const v = valueOfTimeBounds([PAID(MORN, 10, 20), PAID(MORN, 10, 20), PAID(MORN, 10, 20)], MORN);
    assert.equal(v.lower, 30);
    assert.equal(v.upper, null);
    assert.equal(v.informative, 3);
  });

  test('turned down saving 15 min for $12 → under $48/hr', () => {
    const v = valueOfTimeBounds([SAVED(EVE, 12, 15), SAVED(EVE, 12, 15), SAVED(EVE, 12, 15)], EVE);
    assert.equal(v.lower, null);
    assert.equal(v.upper, 48);
  });

  test('both kinds of choice: a range; the tightest bounds win', () => {
    const v = valueOfTimeBounds([PAID(MORN, 10, 20), PAID(MORN, 5, 20), SAVED(MORN, 20, 20)], MORN);
    assert.equal(v.lower, 30); // max of 30 and 15
    assert.equal(v.upper, 60);
    assert.equal(v.contradiction, false);
  });

  test('bounds that cross → not about money', () => {
    const v = valueOfTimeBounds([PAID(MORN, 30, 20), SAVED(MORN, 5, 20), PAID(MORN, 30, 20)], MORN);
    assert.equal(v.contradiction, true); // ≥ $90/hr but ≤ $15/hr
  });

  test('paid more AND was slower: counted as not about money or time', () => {
    const slowerDearer = trip(MORN, 'grab', { grab: 20, mrt: 3.6 }, { grab: 40, mrt: 30 });
    const v = valueOfTimeBounds([slowerDearer, slowerDearer, PAID(MORN, 10, 20)], MORN);
    assert.equal(v.notMoney, 2);
  });

  test('cheaper and faster choice says nothing about her time', () => {
    const easy = trip(MORN, 'mrt', { drive: 13, mrt: 3.6 }, { drive: 40, mrt: 30 });
    assert.equal(valueOfTimeBounds([easy, easy, easy], MORN), null);
  });

  test('too few informative trips: null (back-off still needs 3)', () => {
    assert.equal(valueOfTimeBounds([PAID(MORN, 10, 20), PAID(MORN, 10, 20)], MORN), null);
  });

  test('old records without shown costs/minutes are ignored, not crashed on', () => {
    assert.equal(valueOfTimeBounds([{ chose: 'drive', context: MORN, shown: {} }, null, {}], MORN), null);
  });
});

describe('outcomes and reasons', () => {
  const t = (arrival, again, reasons = []) => trip(EVE, 'mrt', null, null, { arrival, again, reasons, overrode: reasons.length > 0 });
  test('on-time rate, regret and top reasons', () => {
    const s = outcomeSummary([t('on-time', true, ['comfort']), t('late', false, ['comfort', 'habit']), t('early', true), t('on-time', true, ['comfort'])], EVE);
    assert.deepEqual(s.arrival, { onTime: 3, of: 4 }); // early counts as on time
    assert.deepEqual(s.regret, { no: 1, of: 4 });
    assert.deepEqual(s.reasons, [['comfort', 3], ['habit', 1]]);
  });
  test('nothing answered yet: null', () => {
    assert.equal(outcomeSummary([trip(EVE, 'mrt', null, null)], EVE), null);
  });
});

describe('plain words', () => {
  test('situation label says which situation was counted', () => {
    assert.equal(situationLabel(['band', 'direction', 'dayType'], MORN, BANDS), 'Weekday mornings, home → work');
    assert.equal(situationLabel(['band'], EVE, BANDS), 'Evenings');
  });
  test('value-of-time sentence', () => {
    assert.equal(describeValueOfTime({ lower: 30, upper: null, contradiction: false, notMoney: 0 }),
      'you have paid to save time: it seems worth at least $30/hr to you here');
    assert.equal(describeValueOfTime({ lower: null, upper: 48, contradiction: false, notMoney: 0 }),
      'you have passed on paying to save time: it seems worth under $48/hr to you here');
    assert.equal(describeValueOfTime({ lower: 30, upper: 60, contradiction: false, notMoney: 0 }),
      'your time seems worth between $30 and $60/hr to you here');
    assert.equal(describeValueOfTime({ lower: 14, upper: 14, contradiction: false, notMoney: 0 }),
      'your time seems worth about $14/hr to you here');
    assert.equal(describeValueOfTime({ lower: 90, upper: 15, contradiction: true, notMoney: 0 }),
      "it isn't about money or minutes here");
  });
});
