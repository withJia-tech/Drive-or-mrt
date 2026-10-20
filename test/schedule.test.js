/**
 * Feasibility-first schedule rule (plan v0.2, owner decision 2026-10-19).
 *
 * Arrive-by: if the train gets you there on time (with the buffer), recommend
 * the train and say when to leave. Drive or Grab only when the train would be
 * late. Cost decides between drive and Grab, never against an on-time train.
 *
 * Durations are fixed here on purpose so every expected time is checkable by
 * hand: MRT 31 min, drive 17 min, Grab 19 min, buffer 10 min.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { recommendForSchedule, scheduleDurations } from '../calc.js';

const NOW = new Date('2026-10-19T12:00:00+08:00');
const at = (hhmm) => new Date(`2026-10-19T${hhmm}:00+08:00`);
const durations = { mrt: 31, drive: 17, grab: 19 };
const costs = { mrt: 3.6, drive: 13.45, grab: 16.79 };
const arriveBy = (hhmm, extra = {}) => recommendForSchedule({
  timingMode: 'arrive_by', requestedAt: at(hhmm), now: NOW, bufferMin: 10, costs, durations, ...extra,
});
const hhmm = (d) => d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Singapore' });

describe('arrive-by: train first when it is on time', () => {
  test('two hours of slack: take the train, leave by 13:19', () => {
    // 14:00 - 31 min - 10 min buffer = 13:19
    const out = arriveBy('14:00');
    assert.equal(out.recommended, 'mrt');
    assert.equal(out.reason, 'train_on_time');
    assert.equal(hhmm(out.leaveBy), '13:19');
  });

  test('tight but still on time: still the train', () => {
    // 12:41 - 41 = 12:00, exactly now: on time, no slack left
    const out = arriveBy('12:41');
    assert.equal(out.recommended, 'mrt');
    assert.equal(hhmm(out.leaveBy), '12:00');
  });

  test('a cheaper train is never beaten by a faster car when both are on time', () => {
    // Adversarial: make driving free. The train is still on time, so it still wins.
    const out = arriveBy('14:00', { costs: { mrt: 3.6, drive: 0, grab: 0 } });
    assert.equal(out.recommended, 'mrt');
  });
});

describe('arrive-by: escalate only when the train would be late', () => {
  test('train one minute late: cheapest on-time option instead (drive)', () => {
    // 12:40 - 41 = 11:59, already past: train late. Drive leaves 12:13, Grab 12:11.
    const out = arriveBy('12:40');
    assert.equal(out.recommended, 'drive');
    assert.equal(out.reason, 'train_too_late');
    assert.equal(hhmm(out.leaveBy), '12:13');
  });

  test('when Grab is cheaper than driving, Grab', () => {
    const out = arriveBy('12:40', { costs: { mrt: 3.6, drive: 30, grab: 16.79 } });
    assert.equal(out.recommended, 'grab');
  });

  test('nothing makes it: fastest arrival, flagged as late', () => {
    // 12:20 is unreachable for every mode with a 10-minute buffer.
    const out = arriveBy('12:20');
    assert.equal(out.reason, 'none_on_time');
    assert.equal(out.recommended, 'drive');
    assert.equal(out.allFeasible, false);
    assert.equal(hhmm(out.leaveBy), '12:00'); // leave now, not a time in the past
  });
});

describe('arrive-by: inputs that must not mislead', () => {
  test('missing arrival time behaves like leaving now, not like a deadline', () => {
    const out = recommendForSchedule({ timingMode: 'arrive_by', requestedAt: null, now: NOW, costs, durations });
    assert.notEqual(out.reason, 'train_too_late');
    assert.notEqual(out.reason, 'none_on_time');
  });

  test('same inputs, same answer (no hidden state)', () => {
    assert.deepEqual(arriveBy('14:00'), arriveBy('14:00'));
  });
});

/* ------------------------------------------------ brainstorm 2026-10-20 */

const SPEEDS = { driveKmh: 40, driveBufferMin: 4, mrtKmh: 25, grabKmh: 40, grabBufferMin: 6, grabWaitWorstMin: 15 };
const TRIP = { distance: 8.9, walkTime: 10 };

describe('your own train time', () => {
  test('a typed train time replaces the 25 km/h estimate', () => {
    const d = scheduleDurations(TRIP, SPEEDS, { mrtMinutes: 35 });
    assert.equal(d.durations.mrt, 35);
    assert.equal(d.sources.mrt, 'yours');
  });

  test('it moves the leave-by time exactly: 14:00 - 35 - 10 = 13:15', () => {
    const d = scheduleDurations(TRIP, SPEEDS, { mrtMinutes: 35 });
    const out = recommendForSchedule({
      timingMode: 'arrive_by', requestedAt: at('14:00'), now: NOW, bufferMin: 10,
      costs, durations: d.durations, worstDurations: d.worst,
    });
    assert.equal(out.recommended, 'mrt');
    assert.equal(hhmm(out.leaveBy), '13:15');
  });

  test('blank, zero, negative or nonsense falls back to the estimate', () => {
    for (const mrtMinutes of [null, undefined, '', 0, -5, 'abc', Infinity]) {
      const d = scheduleDurations(TRIP, SPEEDS, { mrtMinutes });
      assert.equal(d.sources.mrt, 'estimate', String(mrtMinutes));
      assert.equal(Math.round(d.durations.mrt), 31); // 8.9 km / 25 km/h = 21.4 + 10 walk
    }
  });
});

describe('Grab wait as a range', () => {
  test('worst case only lengthens Grab: 19 typical becomes 28', () => {
    const d = scheduleDurations(TRIP, SPEEDS);
    assert.equal(Math.round(d.durations.grab), 19); // 13.35 + 6
    assert.equal(Math.round(d.worst.grab), 28);     // 13.35 + 15
    assert.equal(d.worst.mrt, d.durations.mrt);
    assert.equal(d.worst.drive, d.durations.drive);
  });

  test('cheaper Grab that only makes it on a good day loses to on-time driving', () => {
    // Arrive 12:35. Drive leaves 12:08 (17+10). Grab typical 12:06, worst 11:57 (late).
    const out = recommendForSchedule({
      timingMode: 'arrive_by', requestedAt: at('12:35'), now: NOW, bufferMin: 10,
      costs: { mrt: 3.6, drive: 30, grab: 16.79 },
      durations, worstDurations: { ...durations, grab: 28 },
    });
    assert.equal(out.recommended, 'drive');
    assert.deepEqual(out.gambles, ['grab']);
  });

  test('when only a lucky Grab makes it, say it is a gamble and leave now', () => {
    // Drive is slow here (40 min), so nothing is safe; Grab works only on a typical wait.
    const out = recommendForSchedule({
      timingMode: 'arrive_by', requestedAt: at('12:35'), now: NOW, bufferMin: 10,
      costs, durations: { mrt: 31, drive: 40, grab: 19 }, worstDurations: { mrt: 31, drive: 40, grab: 28 },
    });
    assert.equal(out.recommended, 'grab');
    assert.equal(out.reason, 'grab_gamble');
    assert.equal(hhmm(out.leaveBy), '12:00');
  });

  test('an on-time train still wins outright, worst cases or not', () => {
    const out = arriveBy('14:00', { worstDurations: { ...durations, grab: 28 } });
    assert.equal(out.recommended, 'mrt');
    assert.equal(hhmm(out.leaveBy), '13:19');
  });
});
