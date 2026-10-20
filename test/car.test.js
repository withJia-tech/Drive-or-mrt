/**
 * Step 3 (2026-10-20): the true cost of owning the car, set up once.
 * Two lenses: this trip (cash + wear) and all-in (+ a share of fixed costs).
 * Every number below is hand-checkable.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { ownershipPerMonth, ownershipPerKm, wearPerKm, driveExtras, carYearSummary, computeAll, round2 } from '../calc.js';
import { makeOwnership } from '../tripLog.js';
import { FARE_DEFAULTS } from '../defaults.js';

const CAR = {
  price: 120000, endValue: 10000, yearsKept: 10,
  insurancePerYear: 1500, roadTaxPerYear: 744, servicingPerYear: 1000,
  seasonParkingPerMonth: 80, kmPerYear: 15000,
};

describe('ownership arithmetic', () => {
  test('per month: depreciation 916.67 + (1500 + 744)/12 + 80 = 1183.67', () => {
    assert.equal(round2((CAR.price - CAR.endValue) / (CAR.yearsKept * 12)), 916.67);
    assert.equal(round2(ownershipPerMonth(CAR)), 1183.67);
  });
  test('per km: 1183.67 × 12 / 15000 = 0.947; wear 1000 / 15000 = 0.067', () => {
    assert.equal(Math.round(ownershipPerKm(CAR) * 1000) / 1000, 0.947);
    assert.equal(Math.round(wearPerKm(CAR) * 1000) / 1000, 0.067);
  });
  test('a 10 km trip (20 km return): wear $1.33, ownership share $18.94', () => {
    assert.deepEqual(driveExtras({ distance: 10 }, CAR), { wear: 1.33, ownership: 18.94 });
  });
  test('no car set up: no extras', () => {
    assert.deepEqual(driveExtras({ distance: 10 }, null), { wear: 0, ownership: 0 });
  });
});

describe('the lens flows through the whole verdict', () => {
  const input = { distance: 10, fuelEconomy: 12, petrolPrice: 3, parkRate: 0.6, parkHours: 2, erp: 0, mrtFare: 1.8, walkTime: 10, hourlyRate: 25, grabFare: null };
  test('without extras, nothing changes', () => {
    const r = computeAll(input, FARE_DEFAULTS);
    assert.equal(r.drive, 6.2); // 20/12*3 = 5.00 + 1.20 parking
    assert.equal(r.driveExtra, 0);
  });
  test('cash lens adds wear; all-in adds the ownership share too; winner follows', () => {
    const cash = computeAll({ ...input, driveExtra: 1.33 }, FARE_DEFAULTS);
    assert.equal(cash.drive, 7.53);
    const allIn = computeAll({ ...input, driveExtra: 1.33 + 18.94 }, FARE_DEFAULTS);
    assert.equal(allIn.drive, 26.47);
    assert.equal(allIn.winner, 'mrt');
    assert.equal(allIn.driveExtra, 20.27);
  });
  test('nonsense extra is ignored', () => {
    assert.equal(computeAll({ ...input, driveExtra: -5 }, FARE_DEFAULTS).drive, 6.2);
    assert.equal(computeAll({ ...input, driveExtra: NaN }, FARE_DEFAULTS).drive, 6.2);
  });
});

describe('your car this year, from the trip log', () => {
  const d = (at, chose, costs) => ({ at, chose, shown: { costs } });
  const log = [
    d('2026-03-02T01:00:00.000Z', 'drive', { drive: 7.25, mrt: 3.6, grab: 9.75 }),
    d('2026-05-04T01:00:00.000Z', 'drive', { drive: 12.75, mrt: 3.6, grab: 20.25 }),
    d('2026-05-05T01:00:00.000Z', 'mrt', { drive: 7.25, mrt: 3.6, grab: 9.75 }), // not a drive
    d('2025-12-30T01:00:00.000Z', 'drive', { drive: 50, mrt: 3.6, grab: 30 }), // last year
  ];
  test('1 Jan to 1 Jul = 6 months of fixed costs; 2 drive trips; same trips by MRT and Grab', () => {
    const s = carYearSummary(log, CAR, new Date('2026-07-01T00:00:00+08:00'));
    assert.equal(s.driveTrips, 2);
    assert.equal(s.fixedSoFar, 7102); // 1183.67 × 6, to the dollar
    assert.equal(s.driveCash, 20); // 7.25 + 12.75
    assert.equal(s.sameByMrt, 7.2);
    assert.equal(s.sameByGrab, 30);
    assert.equal(s.perDriveTrip, 3561); // (7102 + 20) / 2
  });
  test('no car or no drive trips: null', () => {
    assert.equal(carYearSummary(log, null, new Date('2026-07-01T00:00:00+08:00')), null);
    assert.equal(carYearSummary([], CAR, new Date('2026-07-01T00:00:00+08:00')), null);
  });
});

function memoryStorage() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)) };
}

describe('saved on the phone, checked', () => {
  test('round trip', () => {
    const o = makeOwnership(memoryStorage());
    assert.equal(o.get(), null);
    assert.equal(o.set(CAR), true);
    assert.deepEqual(o.get(), CAR);
  });
  test('missing price, or end value above price, or absurd km: refused', () => {
    const o = makeOwnership(memoryStorage());
    assert.equal(o.set({ ...CAR, price: 0 }), false);
    assert.equal(o.set({ ...CAR, endValue: 200000 }), false);
    assert.equal(o.set({ ...CAR, kmPerYear: 10 }), false);
    assert.equal(o.get(), null);
  });
  test('no storage: refuses honestly', () => {
    assert.equal(makeOwnership(null).set(CAR), false);
  });
});

describe('typical figures ship labelled', () => {
  test('car defaults exist with a caveat and a COE hint with its round', () => {
    const c = FARE_DEFAULTS.car;
    assert.ok(c.caveat && c.coeHint && c.coeHint.round);
    assert.equal(c.yearsKept, 10);
  });
});
