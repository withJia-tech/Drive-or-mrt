/**
 * QA 2026-10-20 — unit and integration tests against independently worked
 * numbers. Case IDs (QA-U-xx, QA-I-xx) match docs/QA_REPORT.md.
 * Every expected value is written out by hand in the comment beside it.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  petrolCost, parkingCost, driveTotal, mrtTotal, grabTotal, estimateGrabFare, walkCost,
  selectWinner, verdictBand, journeyTimes, round2, computeAll, shareString,
  scheduleDurations, recommendForSchedule, driveExtras,
} from '../calc.js';
import { verdictCopy } from '../verdict.js';
import { FARE_DEFAULTS } from '../defaults.js';

const A = FARE_DEFAULTS;
const trip = (o = {}) => ({ distance: 10, fuelEconomy: 12, petrolPrice: 3, parkRate: 0, parkHours: 0, erp: 0, mrtFare: 1.8, walkTime: 10, hourlyRate: 25, grabFare: null, ...o });

describe('QA-U: arithmetic against hand-worked values', () => {
  test('QA-U-01 the reported case: 10 km one way, $3.50/L, 10 km/L → 20/10×3.50 = $7.00', () => {
    assert.equal(round2(petrolCost({ distance: 10, fuelEconomy: 10, petrolPrice: 3.5 })), 7);
  });
  test('QA-U-02 defaults explain the $5: 20/12×3.00 = $5.00', () => {
    assert.equal(round2(petrolCost({ distance: 10, fuelEconomy: 12, petrolPrice: 3 })), 5);
  });
  test('QA-U-03 parking: 2.5 h × $3.00 = $7.50; 0 h = $0', () => {
    assert.equal(parkingCost({ parkRate: 3, parkHours: 2.5 }), 7.5);
    assert.equal(parkingCost({ parkRate: 3, parkHours: 0 }), 0);
  });
  test('QA-U-04 drive total: $5.00 petrol + $7.50 parking + $2.40 ERP = $14.90', () => {
    assert.equal(round2(driveTotal({ distance: 10, fuelEconomy: 12, petrolPrice: 3, parkRate: 3, parkHours: 2.5, erp: 2.4 })), 14.9);
  });
  test('QA-U-05 MRT return: 2 × $1.80 = $3.60', () => {
    assert.equal(round2(mrtTotal({ mrtFare: 1.8 })), 3.6);
  });
  test('QA-U-06 Grab: estimate 3.50 + 0.55×10 = $9.00 one way → $18.00 return; typed $12 → $24', () => {
    assert.equal(estimateGrabFare({ distance: 10 }, A.grabEstimate), 9);
    assert.equal(grabTotal({ grabFare: 9 }), 18);
    assert.equal(computeAll(trip({ grabFare: 12 }), A).grab, 24);
  });
  test('QA-U-07 walk value: 2 × 10 min at $25/h = $8.33, shown apart from the MRT fare', () => {
    assert.equal(round2(walkCost({ walkTime: 10, hourlyRate: 25 })), 8.33);
    const r = computeAll(trip(), A);
    assert.equal(r.mrt, 3.6, 'headline MRT excludes walk value');
    assert.equal(r.mrtWithWalk, 11.93);
  });
  test('QA-U-08 rounding to cents happens once, late: 0.1+0.2 → 0.30; 1.005 → 1.01', () => {
    assert.equal(round2(0.1 + 0.2), 0.3);
    assert.equal(round2(1.005), 1.01);
  });
  test('QA-U-09 close-call band: exactly $5 apart is a close call; $5.01 is not', () => {
    assert.equal(verdictBand({ drive: 8.6, mrt: 3.6 }, 5), 'line-ball');
    assert.equal(verdictBand({ drive: 8.61, mrt: 3.6 }, 5), 'mrt-wins');
    assert.equal(verdictBand({ drive: 3.6, mrt: 8.61 }, 5), 'drive-wins');
  });
  test('QA-U-10 journey times, return: drive 10/40×60×2+4 = 34; MRT 10/25×60×2+20 = 68; Grab 30+6 = 36', () => {
    assert.deepEqual(journeyTimes({ distance: 10, walkTime: 10 }, A.speeds), { drive: 34, mrt: 68, grab: 36 });
  });
});

describe('QA-U-11 no mode is favoured by the rule', () => {
  test('every ordering of three distinct costs picks the lowest', () => {
    const costs = [3, 7, 11];
    const perms = [[0, 1, 2], [0, 2, 1], [1, 0, 2], [1, 2, 0], [2, 0, 1], [2, 1, 0]];
    for (const [a, b, c] of perms) {
      const totals = { mrt: costs[a], drive: costs[b], grab: costs[c] };
      const expected = Object.entries(totals).sort((x, y) => x[1] - y[1])[0][0];
      assert.equal(selectWinner(totals), expected, JSON.stringify(totals));
    }
  });
  test('ties only: documented tie-break MRT, then Drive, then Grab', () => {
    assert.equal(selectWinner({ mrt: 5, drive: 5, grab: 5 }), 'mrt');
    assert.equal(selectWinner({ mrt: 9, drive: 5, grab: 5 }), 'drive');
  });
});

describe('QA-I: inputs → result → explanation, end to end without a browser', () => {
  test('QA-I-01 MRT cheapest: 10 km, 3 h at $3 → drive $14.00, MRT $3.60, Grab $18.00', () => {
    const r = computeAll(trip({ parkRate: 3, parkHours: 3 }), A);
    assert.deepEqual([r.drive, r.mrt, r.grab, r.winner, r.band], [14, 3.6, 18, 'mrt', 'mrt-wins']);
    assert.match(verdictCopy(r, { destLabel: 'public hospital', parkHours: 3, distance: 10 }).html, /^MRT saves you <strong>\$10\.40/);
  });
  test('QA-I-02 Drive cheapest: 2 km, 1 h at $0.60, MRT $5 one way → drive $1.60, MRT $10.00', () => {
    const r = computeAll(trip({ distance: 2, parkRate: 0.6, parkHours: 1, mrtFare: 5 }), A);
    assert.deepEqual([r.drive, r.mrt, r.winner, r.band], [1.6, 10, 'drive', 'drive-wins']); // petrol 4/12×3 = 1.00
    assert.match(verdictCopy(r, { destLabel: 'HDB carpark', parkHours: 1, distance: 2 }).html, /^Driving is cheaper by <strong>\$8\.40/);
  });
  test('QA-I-03 Grab cheapest: MRT $10 one way, Grab $5 → Grab $10.00 beats drive $11.00 and MRT $20.00', () => {
    const r = computeAll(trip({ parkRate: 2, parkHours: 3, mrtFare: 10, grabFare: 5 }), A);
    assert.deepEqual([r.drive, r.mrt, r.grab, r.winner], [11, 20, 10, 'grab']);
    assert.match(verdictCopy(r, { destLabel: 'heartland mall', parkHours: 3, distance: 10 }).html, /^Grab is cheapest/);
  });
  test('QA-I-04 close call: lowest cash still flagged, but the wording says comfort call', () => {
    const r = computeAll(trip({ parkRate: 0.6, parkHours: 1 }), A); // drive 5.60, MRT 3.60: $2 apart
    assert.equal(r.winner, 'mrt');
    assert.equal(r.band, 'line-ball');
    assert.match(verdictCopy(r, { destLabel: 'HDB carpark', parkHours: 1, distance: 10 }).html, /comfort call/);
  });
  test('QA-I-05 recommendation is not the same thing as cheapest: on-time MRT beats a cheaper drive when arriving by a time', () => {
    const r = computeAll(trip({ distance: 2, parkRate: 0.6, parkHours: 1, mrtFare: 5 }), A); // drive cheapest
    const d = scheduleDurations(trip({ distance: 2 }), A.speeds);
    const plan = recommendForSchedule({
      timingMode: 'arrive_by', requestedAt: new Date('2026-10-20T14:00:00+08:00'), now: new Date('2026-10-20T12:00:00+08:00'),
      costs: { mrt: r.mrt, drive: r.drive, grab: r.grab }, durations: d.durations, worstDurations: d.worst,
    });
    assert.equal(r.winner, 'drive');
    assert.equal(plan.recommended, 'mrt');
    assert.equal(plan.reason, 'train_on_time');
  });
  test('QA-I-06 with the car set up, the all-in lens can change the cheapest mode', () => {
    const car = { price: 120000, endValue: 10000, yearsKept: 10, insurancePerYear: 1500, roadTaxPerYear: 744, servicingPerYear: 1000, seasonParkingPerMonth: 80, kmPerYear: 15000 };
    const t = trip({ distance: 2, parkRate: 0.6, parkHours: 1, mrtFare: 2 }); // cash: drive 1.60 vs MRT 4.00
    const x = driveExtras(t, car); // 4 km: wear 0.27, ownership 3.79
    assert.equal(computeAll({ ...t, driveExtra: x.wear }, A).winner, 'drive');
    assert.equal(computeAll({ ...t, driveExtra: x.wear + x.ownership }, A).winner, 'mrt'); // 1.60+0.27+3.79 = 5.66 > 4.00
  });
  test('QA-I-07 share text: driving parts add up to the driving total, including your car (D7)', () => {
    const r = computeAll({ ...trip({ parkRate: 3, parkHours: 2 }), driveExtra: 1.33 }, A);
    const text = shareString({ input: { distance: 10, parkHours: 2 }, result: r, destinationLabel: null, verdict: 'x', assumptionsVersion: '2026.08' });
    const line = text.split('\n').find((l) => l.startsWith('🚗'));
    const parts = [...line.matchAll(/\$(\d+\.\d\d)/g)].map((m) => Number(m[1]));
    const [total, ...rest] = parts;
    assert.equal(round2(rest.reduce((a, b) => a + b, 0)), total, line);
  });
});
