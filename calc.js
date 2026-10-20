/**
 * Calculator 4b — Drive There or MRT?
 * Deterministic layer (handoff section 5.1, rules D1-D10).
 *
 * Every function here is pure: same inputs, same outputs, no DOM, no fetch,
 * no module-level mutable state. That is what makes the file testable in Node
 * and droppable into the browser unchanged.
 *
 * Heuristic CONSTANTS do not live here. They live in /data/*.json and arrive
 * as arguments. This file knows the arithmetic; it does not know the guesses.
 */

/** Round to cents. Money is compared and displayed at 2dp, so round once, late. */
export const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;

/**
 * Coerce user input to a usable non-negative number.
 * Returns `fallback` for blank, non-numeric, negative or non-finite input.
 * Negative distance and 500-hour parking are the absurd cases called out in
 * the handoff; clamping here means no downstream rule has to defend itself.
 */
export function toNumber(value, fallback = 0, max = Infinity) {
  if (value === null || value === undefined || value === '') return fallback;
  const n = typeof value === 'number' ? value : Number(String(value).trim());
  if (!Number.isFinite(n) || n < 0) return fallback;
  return Math.min(n, max);
}

/* ---------------------------------------------------------------- D1-D6 */

/** D1 — petrol for the round trip. `distance` is one-way km. */
export function petrolCost({ distance, fuelEconomy, petrolPrice }) {
  if (!fuelEconomy) return 0; // guard: km/L of zero is undefined, not infinite
  return (distance * 2) / fuelEconomy * petrolPrice;
}

/** D2 — parking at the destination. The variable the product exists to surface. */
export function parkingCost({ parkRate, parkHours }) {
  return parkRate * parkHours;
}

/** D3 — total cost of driving. */
export function driveTotal({ distance, fuelEconomy, petrolPrice, parkRate, parkHours, erp }) {
  return (
    petrolCost({ distance, fuelEconomy, petrolPrice }) +
    parkingCost({ parkRate, parkHours }) +
    erp
  );
}

/** D4 — MRT fare, both ways. Excludes walk time cost by design (H8). */
export function mrtTotal({ mrtFare }) {
  return mrtFare * 2;
}

/**
 * D5 — the money value of walking to and from the station.
 * Reported as a separate line and never folded into D4. Whether your own time
 * is a cash cost is the user's call, not ours, so we show it and let them judge.
 */
export function walkCost({ walkTime, hourlyRate }) {
  return (walkTime * 2) / 60 * hourlyRate;
}

/** D6 — Grab, both ways. `grabFare` is a one-way fare. */
export function grabTotal({ grabFare }) {
  return grabFare * 2;
}

/**
 * H2 — one-way Grab fare estimate, used only when the user leaves the fare blank.
 * Anything derived from this must be labelled as estimated in the UI.
 */
export function estimateGrabFare({ distance }, { base, perKm }) {
  return base + perKm * distance;
}

/* ------------------------------------------------------------------ D7-D9 */

/**
 * D7 — cheapest option. Ties resolve to the earlier option in this order,
 * which is deliberate: on a dead heat the train is the better default advice.
 */
export function selectWinner({ drive, mrt, grab }) {
  const options = [
    { id: 'mrt', total: mrt },
    { id: 'drive', total: drive },
    { id: 'grab', total: grab },
  ];
  return options.reduce((best, o) => (o.total < best.total ? o : best)).id;
}

/** D8 — parking as a share of the drive total, 0..1. */
export function parkingShare({ parking, drive }) {
  if (drive <= 0) return 0;
  return parking / drive;
}

/**
 * D9 — verdict band on (drive - mrt), against a flat threshold.
 * > threshold   : the train is meaningfully cheaper
 * < -threshold  : driving is meaningfully cheaper
 * otherwise     : too close to call
 */
export function verdictBand({ drive, mrt }, threshold) {
  const delta = drive - mrt;
  if (delta > threshold) return 'mrt-wins';
  if (delta < -threshold) return 'drive-wins';
  return 'line-ball';
}

/* -------------------------------------------------------------------- time */

/**
 * Journey time estimates in minutes, for the whole return journey.
 *
 * Return rather than one-way, deliberately: every cost in this calculator is
 * a return figure, so a one-way time sitting beside a return cost invites
 * exactly the wrong comparison.
 *
 * Assumed average speeds, no live data. The two buffers are different things
 * — the drive buffer is time spent finding a space, the Grab buffer is time
 * spent waiting for the car to turn up.
 */
export function journeyTimes({ distance, walkTime }, speeds) {
  return {
    drive: (distance / speeds.driveKmh) * 60 * 2 + speeds.driveBufferMin,
    mrt: (distance / speeds.mrtKmh) * 60 * 2 + walkTime * 2,
    grab: (distance / speeds.grabKmh) * 60 * 2 + speeds.grabBufferMin,
  };
}

/** One-way journey estimates used by the arrival-first recommendation layer. */
export function oneWayJourneyTimes({ distance, walkTime }, speeds) {
  return {
    drive: (distance / speeds.driveKmh) * 60 + speeds.driveBufferMin,
    mrt: (distance / speeds.mrtKmh) * 60 + walkTime,
    grab: (distance / speeds.grabKmh) * 60 + speeds.grabBufferMin,
  };
}

/**
 * One-way durations for the schedule rule, in two versions (brainstorm 2026-10-20):
 * - `durations`: the typical journey. If the family typed their own door-to-door
 *   train time (`mrtMinutes`), it replaces the 25 km/h guess. SMRT is predictable,
 *   so someone who makes the trip regularly knows better than the model.
 * - `worst`: the same, except Grab waits `grabWaitWorstMin` instead of the typical
 *   `grabBufferMin`. Train and drive are treated as predictable.
 * `sources.mrt` says which train time was used, so the UI can label it.
 */
export function scheduleDurations(input, speeds, { mrtMinutes } = {}) {
  const durations = oneWayJourneyTimes(input, speeds);
  const own = typeof mrtMinutes === 'number' ? mrtMinutes : Number(mrtMinutes);
  const hasOwn = mrtMinutes !== null && mrtMinutes !== '' && Number.isFinite(own) && own > 0;
  if (hasOwn) durations.mrt = own;
  const worstWait = Number.isFinite(speeds.grabWaitWorstMin) ? speeds.grabWaitWorstMin : speeds.grabBufferMin;
  const worst = { ...durations, grab: durations.grab - speeds.grabBufferMin + Math.max(worstWait, speeds.grabBufferMin) };
  return { durations, worst, sources: { mrt: hasOwn ? 'yours' : 'estimate' } };
}

const asDate = (value) => {
  // new Date(null) is 1 Jan 1970, a valid date: a blank time would read as a
  // deadline decades ago. Blank means no time given.
  if (value === null || value === undefined || value === '') return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

/**
 * Recommend a mode for a particular timing request.
 *
 * This is deliberately deterministic and conservative. A mode must satisfy
 * the requested clock constraint before its cost can make it preferable.
 * Public transport wins ties; a premium option wins only when it materially
 * improves feasibility or the departure time available to the user.
 */
export function recommendForSchedule({
  timingMode = 'leave_now',
  requestedAt = null,
  now = new Date(),
  bufferMin = 10,
  costs,
  durations,
  worstDurations = durations,
}) {
  const baseNow = asDate(now) || new Date();
  const requested = asDate(requestedAt);
  const ids = ['mrt', 'drive', 'grab'];
  const candidates = ids.map((id) => {
    const durationMin = Math.max(0, Number(durations[id]) || 0);
    // Arrive-by plans on the bad-day duration, so a leave-by time is safe.
    const worstMin = Math.max(durationMin, Number(worstDurations[id]) || 0);
    let departAt = new Date(baseNow);
    if (timingMode === 'depart_at' && requested) departAt = new Date(requested);
    let typicalOk = true;
    if (timingMode === 'arrive_by' && requested) {
      departAt = new Date(requested.getTime() - (worstMin + bufferMin) * 60000);
      typicalOk = requested.getTime() - (durationMin + bufferMin) * 60000 >= baseNow.getTime();
    }
    const arriveAt = new Date(departAt.getTime() + durationMin * 60000);
    const feasible = timingMode !== 'arrive_by' || !requested || departAt >= baseNow;
    // On time only if the wait is typical, not on a bad day.
    const gamble = !feasible && typicalOk;
    return { id, cost: costs[id], durationMin, worstMin, departAt, arriveAt, feasible, gamble };
  });
  const gambles = candidates.filter((candidate) => candidate.gamble).map((candidate) => candidate.id);

  const feasible = candidates.filter((candidate) => candidate.feasible);
  const cheapest = (pool) => pool.reduce((best, candidate) =>
    candidate.cost < best.cost ? candidate : best);
  let recommended;
  let reason = 'compared';
  if (timingMode === 'arrive_by' && requested) {
    // Feasibility first (plan v0.2, owner decision 2026-10-19): if the train
    // is on time with the buffer, recommend it and stop. Leaving earlier is
    // not a cost here. Drive or Grab only when the train would be late, and
    // then the cheaper of those that are on time.
    const mrt = candidates.find((candidate) => candidate.id === 'mrt');
    if (mrt.feasible) {
      recommended = mrt;
      reason = 'train_on_time';
    } else if (feasible.length) {
      recommended = cheapest(feasible);
      reason = 'train_too_late';
    } else if (gambles.length) {
      // Nothing is safe, but something makes it on a typical day. Say so, leave now.
      recommended = { ...cheapest(candidates.filter((candidate) => candidate.gamble)), departAt: new Date(baseNow) };
      reason = gambles.includes('grab') ? 'grab_gamble' : 'gamble';
    } else {
      // Nobody makes it. Back-scheduled arrivals all equal the deadline, so
      // compare by leaving now: the shortest journey arrives least late.
      recommended = candidates.reduce((best, candidate) =>
        candidate.durationMin < best.durationMin ? candidate : best);
      recommended = { ...recommended, departAt: new Date(baseNow) };
      reason = 'none_on_time';
    }
  } else {
    const pool = feasible.length ? feasible : candidates;
    // For leave/depart requests, first avoid a premium when MRT is no more
    // than 15 minutes slower than the fastest available option.
    const fastest = Math.min(...pool.map((candidate) => candidate.durationMin));
    const sensible = pool.filter((candidate) => candidate.durationMin <= fastest + 15);
    recommended = sensible.reduce((best, candidate) =>
      candidate.cost < best.cost ? candidate : best);
  }

  return {
    timingMode,
    requestedAt: requested,
    bufferMin,
    recommended: recommended.id,
    reason,
    gambles,
    leaveBy: recommended.departAt,
    allFeasible: candidates.every((candidate) => candidate.feasible),
    candidates,
  };
}

/* --------------------------------------------------------------- aggregate */

/**
 * Run the whole deterministic layer once.
 * `input` is sanitised state; `assumptions` is the merged contents of
 * /data/fare-defaults.json. Returns every number the UI needs, rounded once.
 */
export function computeAll(input, assumptions) {
  const grabFare =
    input.grabFare === null || input.grabFare === undefined
      ? estimateGrabFare(input, assumptions.grabEstimate)
      : input.grabFare;
  const grabEstimated = input.grabFare === null || input.grabFare === undefined;

  const petrol = petrolCost(input);
  const parking = parkingCost(input);
  const drive = driveTotal(input);
  const mrt = mrtTotal(input);
  const grab = grabTotal({ grabFare });
  const walk = walkCost(input);

  return {
    petrol: round2(petrol),
    parking: round2(parking),
    erp: round2(input.erp),
    drive: round2(drive),
    mrt: round2(mrt),
    grab: round2(grab),
    walk: round2(walk),
    /* Shown as a secondary line so the user can see what pricing their own
       walking time would do, without it ever entering the headline (H8). */
    mrtWithWalk: round2(mrt + walk),
    grabFareOneWay: round2(grabFare),
    grabEstimated,
    winner: selectWinner({ drive, mrt, grab }),
    parkingShare: parkingShare({ parking, drive }),
    band: verdictBand({ drive, mrt }, assumptions.verdict.thresholdSgd),
    delta: round2(Math.abs(drive - mrt)),
    times: journeyTimes(input, assumptions.speeds),
    oneWayTimes: oneWayJourneyTimes(input, assumptions.speeds),
  };
}

/* ---------------------------------------------------------------------- D10 */

const money = (n) => `$${n.toFixed(2)}`;

/**
 * D10 — share string for WhatsApp and Telegram.
 *
 * Deliberately plain: no tabs, no column padding, no markdown tables. Both
 * clients render variable-width text and collapse runs of whitespace, so any
 * alignment we fake here arrives broken. Label-and-value survives everywhere.
 *
 * Stamped with the assumptions version so a result shared today can still be
 * read honestly after the petrol default moves.
 */
export function shareString({ input, result, destinationLabel, verdict, assumptionsVersion }) {
  const trip = destinationLabel
    ? `${destinationLabel} (${input.parkHours}h parking)`
    : `${input.distance}km trip (${input.parkHours}h parking)`;

  const driveParts = [
    `petrol ${money(result.petrol)}`,
    `parking ${money(result.parking)}`,
    result.erp > 0 ? `ERP ${money(result.erp)}` : null,
  ].filter(Boolean).join(' + ');

  const lines = [
    'Drive There or MRT? 🚗🚇',
    '',
    `${trip}:`,
    `🚗 Drive: ${money(result.drive)} (${driveParts})`,
    `🚇 MRT: ${money(result.mrt)}`,
    `🚕 Grab: ${money(result.grab)}${result.grabEstimated ? ' (est)' : ''}`,
    '',
    verdict,
    '',
    `via Is It Worth It? — estimates only, assumptions ${assumptionsVersion}`,
  ];
  return lines.join('\n');
}
