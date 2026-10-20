/**
 * QA 2026-10-20: regression unit tests for D3–D6. Written before the fixes;
 * see docs/QA_REPORT.md. Expected values are worked out by hand.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { verdictCopy } from '../verdict.js';
import { checkField, FIELD_RULES } from '../calc.js';

// Result shapes as computeAll returns them (only the fields the copy reads).
const base = { petrol: 5, parking: 6, erp: 0, driveExtra: 0, drive: 11, mrt: 20, grab: 10, winner: 'grab', band: 'drive-wins', delta: 9 };
const meta = { destLabel: 'heartland mall', parkHours: 3, distance: 10 };

describe('D3: the explanation follows the actual winner', () => {
  test('Grab cheapest: leads with Grab, never says "Drive." or "take the train"', () => {
    const { html, share } = verdictCopy(base, meta);
    assert.match(html, /^Grab is cheapest at <strong>\$10\.00<\/strong>/);
    assert.match(html, /\$1\.00 less than driving and \$10\.00 less than the MRT/); // 11-10, 20-10
    assert.doesNotMatch(html, /Drive\.|take the train/);
    assert.match(share, /^Grab wins at \$10\.00/);
  });
  test('MRT and Drive outcomes are unchanged in direction', () => {
    assert.match(verdictCopy({ ...base, winner: 'mrt', band: 'mrt-wins', mrt: 3.6, drive: 11, delta: 7.4 }, meta).html, /^MRT saves you <strong>\$7\.40<\/strong>/);
    assert.match(verdictCopy({ ...base, winner: 'drive', band: 'drive-wins', drive: 4, mrt: 10, grab: 30, parking: 0.6, petrol: 3.4, delta: 6 }, meta).html, /^Driving is cheaper by <strong>\$6\.00<\/strong>/);
  });
  test('close call keeps the comfort-call wording', () => {
    assert.match(verdictCopy({ ...base, winner: 'mrt', band: 'line-ball', mrt: 3.6, drive: 7.25, delta: 3.65 }, meta).html, /^It's within <strong>\$3\.65<\/strong> either way/);
  });
});

describe('D4: names the real cost driver, with correct plurals', () => {
  const mrtWin = { ...base, winner: 'mrt', band: 'mrt-wins', mrt: 3.6, grab: 51, delta: 17 };
  test('petrol $20 vs parking $0.60: petrol is named, parking is not blamed', () => {
    const { html } = verdictCopy({ ...mrtWin, petrol: 20, parking: 0.6, drive: 20.6 }, { ...meta, distance: 40, parkHours: 1 });
    assert.doesNotMatch(html, /is the killer/);
    assert.match(html, /Petrol for the 80 km return trip \(\$20\.00\) is most of the driving cost/);
  });
  test('parking dominant: parking named, "1 hour" singular', () => {
    const { html } = verdictCopy({ ...mrtWin, petrol: 1.25, parking: 9, drive: 10.25, delta: 6.65 }, { ...meta, parkHours: 1 });
    assert.match(html, /Parking at a heartland mall is the killer — \$9\.00 for just 1 hour\./);
  });
  test('"3 hours" plural; "this destination" without "a"', () => {
    const { html } = verdictCopy({ ...mrtWin, petrol: 1.25, parking: 9, drive: 10.25 }, { destLabel: 'this destination', parkHours: 3, distance: 2.5 });
    assert.match(html, /Parking at this destination is the killer — \$9\.00 for just 3 hours\./);
  });
  test('drive wins with parking larger than petrol: no claim that petrol is most of it', () => {
    const { html } = verdictCopy({ ...base, winner: 'drive', band: 'drive-wins', petrol: 1, parking: 3, drive: 4, mrt: 10, delta: 6 }, meta);
    assert.doesNotMatch(html, /petrol is most of/);
    assert.match(html, /even with \$3\.00 of parking/);
  });
});

describe('D5/D6: inputs are checked, not silently changed', () => {
  test('blank means "use the default" for optional fields, "missing" for required ones', () => {
    assert.deepEqual(checkField('petrol', ''), { value: null, error: null });
    assert.deepEqual(checkField('distance', ''), { value: null, error: null });
  });
  test('valid values pass through as numbers', () => {
    assert.deepEqual(checkField('petrol', '3.50'), { value: 3.5, error: null });
    assert.deepEqual(checkField('fuel', '10'), { value: 10, error: null });
    assert.deepEqual(checkField('parkHours', '0'), { value: 0, error: null }); // drop-off: no parking
  });
  test('0 km/L, $0 petrol, negative and too-large values are errors with a message', () => {
    for (const [id, raw] of [['fuel', '0'], ['petrol', '0'], ['distance', '-5'], ['distance', '500'], ['distance', '0'], ['parkHours', '100'], ['parkRate', '-1'], ['fuel', 'abc']]) {
      const r = checkField(id, raw);
      assert.equal(r.value, null, `${id}=${raw}`);
      assert.ok(r.error && r.error.length > 10, `${id}=${raw} has a message`);
    }
  });
  test('every field the page reads has a rule', () => {
    for (const id of ['distance', 'parkHours', 'parkRate', 'petrol', 'fuel', 'erp', 'mrtFare', 'grabFare', 'walkTime', 'hourlyRate']) {
      assert.ok(FIELD_RULES[id], id);
    }
  });
});
