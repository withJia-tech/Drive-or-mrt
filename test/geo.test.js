/**
 * Unit tests for the geometry layer (geo.js).
 *
 * Run: node --test test/
 *
 * Reading the phone's GPS position is a side effect and is not tested here —
 * you cannot unit-test a permission prompt. Converting two coordinates into a
 * distance is arithmetic, and arithmetic is where a wrong answer is a defect
 * rather than a disagreement, so it gets tests exactly like calc.js does.
 *
 * The landmark coordinates and the winding factor are heuristics and are
 * asserted for shape in data-drift.test.js, not for value here.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  EARTH_RADIUS_KM,
  toRadians,
  haversineKm,
  estimateRoadDistanceKm,
  estimateTripDistanceKm,
} from '../geo.js';

import { LANDMARK_DEFAULTS } from '../defaults.js';

const near = (actual, expected, tol, msg) =>
  assert.ok(Math.abs(actual - expected) <= tol, `${msg}: expected ~${expected}, got ${actual}`);

describe('toRadians', () => {
  test('converts the cardinal angles', () => {
    assert.equal(toRadians(0), 0);
    near(toRadians(180), Math.PI, 1e-12, '180 degrees is pi radians');
    near(toRadians(90), Math.PI / 2, 1e-12, '90 degrees is pi/2 radians');
  });
});

describe('haversineKm', () => {
  test('a point is zero distance from itself', () => {
    assert.equal(haversineKm({ lat: 1.3521, lng: 103.8198 }, { lat: 1.3521, lng: 103.8198 }), 0);
  });

  test('one degree of latitude at the equator is ~111.2 km', () => {
    // The canonical sanity check: R * (pi/180) = 6371 * 0.0174533 = 111.19 km.
    const d = haversineKm({ lat: 0, lng: 0 }, { lat: 1, lng: 0 });
    near(d, (EARTH_RADIUS_KM * Math.PI) / 180, 0.001, 'one degree of latitude');
  });

  test('is symmetric — order of the two points does not matter', () => {
    const a = { lat: 1.2793, lng: 103.8348 }; // SGH
    const b = { lat: 1.3216, lng: 103.8459 }; // TTSH
    assert.equal(haversineKm(a, b), haversineKm(b, a));
  });

  test('a known Singapore pair lands in the expected range', () => {
    // SGH (Outram) to TTSH (Novena) is a short cross-town straight line — a
    // few km, nowhere near zero and nowhere near the length of the island.
    const d = haversineKm({ lat: 1.2793, lng: 103.8348 }, { lat: 1.3216, lng: 103.8459 });
    near(d, 4.86, 0.3, 'SGH to TTSH straight line');
  });

  test('missing or non-finite coordinates return 0, never NaN', () => {
    assert.equal(haversineKm(null, { lat: 1, lng: 103 }), 0);
    assert.equal(haversineKm({ lat: 1, lng: 103 }, undefined), 0);
    assert.equal(haversineKm({ lat: NaN, lng: 103 }, { lat: 1, lng: 103 }), 0);
    assert.equal(haversineKm({ lat: 1 }, { lat: 1, lng: 103 }), 0); // lng missing
  });
});

describe('estimateRoadDistanceKm — H9', () => {
  test('applies the winding factor', () => {
    assert.equal(estimateRoadDistanceKm(10, 1.35), 13.5);
  });

  test('a factor below 1 clamps to 1 — a road is never shorter than the crow flies', () => {
    assert.equal(estimateRoadDistanceKm(10, 0.5), 10);
    assert.equal(estimateRoadDistanceKm(10, -3), 10);
  });

  test('a missing or non-finite factor defaults to 1', () => {
    assert.equal(estimateRoadDistanceKm(10), 10);
    assert.equal(estimateRoadDistanceKm(10, NaN), 10);
  });

  test('non-positive or junk straight-line distance yields 0', () => {
    assert.equal(estimateRoadDistanceKm(0, 1.35), 0);
    assert.equal(estimateRoadDistanceKm(-5, 1.35), 0);
    assert.equal(estimateRoadDistanceKm(NaN, 1.35), 0);
  });
});

describe('estimateTripDistanceKm — the composed call', () => {
  test('road estimate is the straight line times the factor', () => {
    const a = { lat: 1.2793, lng: 103.8348 };
    const b = { lat: 1.3216, lng: 103.8459 };
    const straight = haversineKm(a, b);
    assert.equal(
      estimateTripDistanceKm(a, b, LANDMARK_DEFAULTS.windingFactor),
      straight * LANDMARK_DEFAULTS.windingFactor,
    );
  });

  test('is always at least as long as the straight-line distance', () => {
    const a = { lat: 1.3644, lng: 103.9915 }; // near Changi
    const b = { lat: 1.3331, lng: 103.7434 }; // JEM, across the island
    assert.ok(
      estimateTripDistanceKm(a, b, LANDMARK_DEFAULTS.windingFactor) >= haversineKm(a, b),
    );
  });
});
