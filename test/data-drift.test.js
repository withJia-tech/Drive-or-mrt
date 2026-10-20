/**
 * The guard that makes externalised assumptions safe.
 *
 * /data/*.json is the source of truth a non-developer edits. defaults.js is
 * the inline mirror that keeps the page working from file:// and offline.
 * Two copies of the same numbers is exactly the arrangement that rots.
 *
 * It does not rot here, because this test fails the moment they diverge and
 * tells you which file to fix. That is the whole argument for keeping the
 * mirror: the duplication is real, but it is checked.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import { FARE_DEFAULTS, PARKING_DEFAULTS, LANDMARK_DEFAULTS } from '../defaults.js';

const readJson = async (relative) =>
  JSON.parse(await readFile(fileURLToPath(new URL(relative, import.meta.url)), 'utf8'));

describe('data files and their inline mirror', () => {
  test('fare-defaults.json matches FARE_DEFAULTS', async () => {
    const json = await readJson('../data/fare-defaults.json');
    assert.deepEqual(
      json,
      FARE_DEFAULTS,
      'data/fare-defaults.json and defaults.js have drifted apart. ' +
        'The JSON is the source of truth — update the mirror to match it.',
    );
  });

  test('parking-defaults.json matches PARKING_DEFAULTS', async () => {
    const json = await readJson('../data/parking-defaults.json');
    assert.deepEqual(
      json,
      PARKING_DEFAULTS,
      'data/parking-defaults.json and defaults.js have drifted apart. ' +
        'The JSON is the source of truth — update the mirror to match it.',
    );
  });

  test('landmarks.json matches LANDMARK_DEFAULTS', async () => {
    const json = await readJson('../data/landmarks.json');
    assert.deepEqual(
      json,
      LANDMARK_DEFAULTS,
      'data/landmarks.json and defaults.js have drifted apart. ' +
        'The JSON is the source of truth — update the mirror to match it.',
    );
  });
});

describe('the assumption files stay usable', () => {
  test('every destination has a label, a source and a rate or an explicit null', async () => {
    const { destinations } = await readJson('../data/parking-defaults.json');
    assert.ok(destinations.length >= 6, 'six destination categories were specified');
    for (const d of destinations) {
      assert.ok(d.id, 'destination needs an id');
      assert.ok(d.label, `${d.id} needs a label`);
      // shortLabel is what the verdict copy reads mid-sentence ("parking at a
      // heartland mall is the killer"), so the long dropdown label with its
      // example carparks cannot be reused there.
      assert.ok(d.shortLabel, `${d.id} needs a shortLabel for the verdict copy`);
      assert.ok(d.source, `${d.id} needs a stated source — the UI shows it to the user`);
      assert.ok(
        d.rate === null || (typeof d.rate === 'number' && d.rate >= 0),
        `${d.id} rate must be a non-negative number or an explicit null`,
      );
    }
  });

  test('exactly one destination opts out of auto-fill', async () => {
    const { destinations } = await readJson('../data/parking-defaults.json');
    const nulls = destinations.filter((d) => d.rate === null);
    assert.equal(nulls.length, 1, 'only the "somewhere else" option should have no default rate');
  });

  test('assumptions carry a version and a review date', async () => {
    const fares = await readJson('../data/fare-defaults.json');
    assert.match(fares.assumptionsVersion, /^\d{4}\.\d{2}$/, 'version is year.month');
    assert.match(fares.lastReviewed, /^\d{4}-\d{2}-\d{2}$/, 'review date is ISO');
  });

  test('every heuristic block explains itself', async () => {
    // If a constant cannot say why it is what it is, it should not be shipped
    // as fact. The UI reads these caveats straight out of the file.
    const fares = await readJson('../data/fare-defaults.json');
    for (const key of ['grabEstimate', 'speeds', 'verdict', 'limits', 'habits']) {
      assert.ok(fares[key].caveat, `${key} needs a caveat`);
    }
    const parking = await readJson('../data/parking-defaults.json');
    assert.ok(parking.caveat);
    assert.ok(parking.upgradePath, 'H1 must state how it stops being a heuristic');
  });
});

describe('the landmark file stays usable (H9)', () => {
  // Singapore's rough bounding box. A coordinate outside it is a typo, and a
  // typo here would silently produce a wildly wrong distance.
  const SG_BOUNDS = { minLat: 1.15, maxLat: 1.48, minLng: 103.6, maxLng: 104.1 };

  test('the winding factor is a real multiplier of at least 1', async () => {
    const { windingFactor } = await readJson('../data/landmarks.json');
    assert.ok(
      typeof windingFactor === 'number' && windingFactor >= 1,
      'a road is never shorter than the straight line, so the factor must be >= 1',
    );
  });

  test('every place has an id, a label, a group and coordinates inside Singapore', async () => {
    const { places } = await readJson('../data/landmarks.json');
    assert.ok(places.length >= 1, 'the picker needs at least one destination');
    const ids = new Set();
    for (const p of places) {
      assert.ok(p.id, 'place needs an id');
      assert.ok(!ids.has(p.id), `duplicate place id: ${p.id}`);
      ids.add(p.id);
      assert.ok(p.label, `${p.id} needs a label`);
      assert.ok(p.group, `${p.id} needs a group for the dropdown optgroup`);
      assert.ok(p.source, `${p.id} needs a stated source`);
      assert.ok(
        typeof p.lat === 'number' && p.lat >= SG_BOUNDS.minLat && p.lat <= SG_BOUNDS.maxLat,
        `${p.id} latitude ${p.lat} is outside Singapore`,
      );
      assert.ok(
        typeof p.lng === 'number' && p.lng >= SG_BOUNDS.minLng && p.lng <= SG_BOUNDS.maxLng,
        `${p.id} longitude ${p.lng} is outside Singapore`,
      );
    }
  });

  test('the heuristic explains itself and states its upgrade path', async () => {
    const landmarks = await readJson('../data/landmarks.json');
    assert.ok(landmarks.caveat, 'H9 needs a caveat — the UI shows it to the user');
    assert.ok(landmarks.upgradePath, 'H9 must state how it stops being a heuristic');
  });
});
