/**
 * Learning from her own choices: counted, not inferred (owner decision
 * 2026-10-20). Pure functions: no DOM, no storage, no clock of their own.
 *
 * SHOW-ONLY: a pattern is displayed beside the verdict and never changes it.
 * Letting patterns move the verdict is a later in-app experiment.
 */
import { haversineKm } from './geo.js';

const MODES = ['mrt', 'drive', 'grab'];

/** Situation of a trip, in Singapore time whatever the device clock says. */
export function contextOf(date, { direction = 'other', purpose = null } = {}, bands) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Singapore', hour: '2-digit', hourCycle: 'h23', weekday: 'short',
  }).formatToParts(date).map((p) => [p.type, p.value]));
  const hour = Number(parts.hour);
  const band = bands.find((b) => (b.fromHour < b.toHour
    ? hour >= b.fromHour && hour < b.toHour
    : hour >= b.fromHour || hour < b.toHour))?.id || 'unknown';
  const dayType = parts.weekday === 'Sat' || parts.weekday === 'Sun' ? 'weekend' : 'weekday';
  return { band, dayType, direction: direction || 'other', purpose: purpose || null };
}

/**
 * "home→work", "work→home", "home→other", … or "other".
 * A point counts as at a saved place within `radiusM`. Missing places never
 * match (haversineKm returns 0 for missing input, so check first).
 */
export function directionOf(origin, destination, places = {}, radiusM = 300) {
  const near = (point, place) => !!(point && place
    && Number.isFinite(place.lat) && Number.isFinite(place.lng)
    && haversineKm(point, place) * 1000 <= radiusM);
  const where = (point) => (near(point, places.home) ? 'home' : near(point, places.work) ? 'work' : 'other');
  const from = where(origin);
  const to = where(destination);
  return from === 'other' && to === 'other' ? 'other' : `${from}→${to}`;
}

/** Most specific first. Back off only when a level has too few trips. */
export const LEVELS = [
  ['band', 'direction', 'dayType', 'purpose'],
  ['band', 'direction', 'dayType'],
  ['band', 'direction'],
  ['band'],
];

/**
 * The mode she chose at least `minSame` times in the last `window` trips of
 * the most specific situation that has enough trips; otherwise null.
 * If the most specific level with enough trips is mixed, the answer is
 * "no pattern": a broader level would be answering a different question.
 */
export function patternFor(log, context, { minSame = 3, window = 5 } = {}) {
  const valid = (Array.isArray(log) ? log : [])
    .filter((e) => e && MODES.includes(e.chose) && e.context && typeof e.context === 'object')
    .sort((a, b) => String(a.at).localeCompare(String(b.at)));
  for (const level of LEVELS) {
    const same = valid.filter((e) => level.every((k) => (e.context[k] ?? null) === (context[k] ?? null)));
    if (same.length < minSame) continue;
    const recent = same.slice(-window);
    const counts = MODES.map((mode) => ({ mode, n: recent.filter((e) => e.chose === mode).length }));
    const top = counts.reduce((a, b) => (b.n > a.n ? b : a));
    return top.n >= minSame ? { mode: top.mode, count: top.n, of: recent.length, level } : null;
  }
  return null;
}

const PURPOSE_LABELS = {
  medical: 'medical trips', heavy: 'with heavy bags', kids: 'with kids', event: 'events', errand: 'errands',
};
const VERB = { mrt: 'took the MRT', drive: 'drove', grab: 'took a Grab' };

/** "Weekday evenings, work → home, errands": the situation a level counted. */
export function situationLabel(level, context, bands) {
  const has = (k) => level.includes(k);
  const bandLabel = bands.find((b) => b.id === context.band)?.label || 'Trips';
  const when = has('dayType')
    ? `${context.dayType === 'weekend' ? 'Weekend' : 'Weekday'} ${bandLabel.toLowerCase()}`
    : bandLabel;
  const parts = [when];
  if (has('direction') && context.direction && context.direction !== 'other') {
    parts.push(context.direction.replace('→', ' → '));
  }
  if (has('purpose') && context.purpose) parts.push(PURPOSE_LABELS[context.purpose] || context.purpose);
  return parts.join(', ');
}

/** "Weekday evenings, work → home: you took the MRT 4 of the last 5 times." */
export function describePattern(pattern, context, bands) {
  return `${situationLabel(pattern.level, context, bands)}: you ${VERB[pattern.mode]} ${pattern.count} of the last ${pattern.of} times.`;
}

/* ------------------------------------------------- punctuality (step 1) */

const median = (xs) => {
  const a = [...xs].sort((x, y) => x - y);
  const m = Math.floor(a.length / 2);
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
};

/**
 * Her usual slip: minutes between the suggested leave-by and when she
 * actually tapped "leaving now". Median of the last `window` trips in the
 * most specific situation with at least `min` of them (same back-off as
 * patternFor). The buffer it adds is 0..30 minutes; leaving early adds
 * nothing but is reported in `median`.
 */
export function slipMinutes(log, context, { min = 3, window = 7 } = {}) {
  const valid = (Array.isArray(log) ? log : [])
    .filter((e) => e && e.context && e.leftAt && e.shown && e.shown.suggestedLeaveBy
      && Number.isFinite(Date.parse(e.leftAt)) && Number.isFinite(Date.parse(e.shown.suggestedLeaveBy)))
    .sort((a, b) => String(a.at).localeCompare(String(b.at)));
  for (const level of LEVELS) {
    const same = valid.filter((e) => level.every((k) => (e.context[k] ?? null) === (context[k] ?? null)));
    if (same.length < min) continue;
    const recent = same.slice(-window);
    const deltas = recent.map((e) => (Date.parse(e.leftAt) - Date.parse(e.shown.suggestedLeaveBy)) / 60000);
    const med = Math.round(median(deltas));
    return { minutes: Math.min(30, Math.max(0, med)), median: med, of: recent.length, level };
  }
  return null;
}

/**
 * The one trip to ask about when she next opens the app: her latest chosen
 * trip, 20 min to 36 h old, not asked before. Arrival is only asked when the
 * trip had an arrive-by time. Older unasked trips are never chased.
 */
export function pendingOutcome(log, now = new Date(), { minAgeMin = 20, maxAgeHours = 36 } = {}) {
  const chosen = (Array.isArray(log) ? log : [])
    .filter((e) => e && MODES.includes(e.chose) && Number.isFinite(Date.parse(e.at)))
    .sort((a, b) => String(a.at).localeCompare(String(b.at)));
  const last = chosen[chosen.length - 1];
  if (!last || last.outcomeAsked) return null;
  const ageMin = (now.getTime() - Date.parse(last.at)) / 60000;
  if (ageMin < minAgeMin || ageMin > maxAgeHours * 60) return null;
  return { id: last.id, chose: last.chose, at: last.at, askArrival: !!last.shown?.deadline };
}

/* ------------------------------------------- what her choices say (step 2) */

const sameAt = (level, context) => (e) => level.every((k) => (e.context[k] ?? null) === (context[k] ?? null));

/**
 * What her time seems worth to her in a situation, from what she chose.
 * Each choice is compared with each alternative she was shown:
 *  - paid more to arrive sooner  → a lower bound ($ more ÷ minutes saved)
 *  - took cheaper but slower     → an upper bound ($ saved ÷ minutes lost)
 *  - paid more and was slower    → "not about money or minutes"
 *  - cheaper and faster          → says nothing
 * Costs are return totals and minutes one way, so minutes are doubled.
 * Needs 3 informative trips at a level (same back-off as patternFor).
 */
export function valueOfTimeBounds(log, context, { min = 3 } = {}) {
  const valid = (Array.isArray(log) ? log : [])
    .filter((e) => e && e.context && MODES.includes(e.chose) && e.shown && e.shown.costs && e.shown.minutes);
  for (const level of LEVELS) {
    let lower = null; let upper = null; let notMoney = 0; let informative = 0;
    for (const e of valid.filter(sameAt(level, context))) {
      const { costs, minutes } = e.shown;
      const c0 = costs[e.chose]; const m0 = minutes[e.chose];
      if (!Number.isFinite(c0) || !Number.isFinite(m0)) continue;
      let told = false;
      for (const a of MODES) {
        if (a === e.chose || !Number.isFinite(costs[a]) || !Number.isFinite(minutes[a])) continue;
        const dc = c0 - costs[a];
        const dt = (minutes[a] - m0) * 2;
        if (dc > 0 && dt > 0) { lower = Math.max(lower ?? 0, (dc / dt) * 60); told = true; }
        else if (dc < 0 && dt < 0) { const u = (-dc / -dt) * 60; upper = upper === null ? u : Math.min(upper, u); told = true; }
        else if (dc > 0 && dt <= 0) { notMoney += 1; told = true; break; }
      }
      if (told) informative += 1;
    }
    if (informative < min) continue;
    const r = (x) => (x === null ? null : Math.round(x));
    return {
      lower: r(lower), upper: r(upper), notMoney, informative, level,
      contradiction: lower !== null && upper !== null && lower > upper,
    };
  }
  return null;
}

export function describeValueOfTime(v) {
  if (v.contradiction || (v.lower === null && v.upper === null && v.notMoney > 0)) return "it isn't about money or minutes here";
  if (v.lower !== null && v.upper !== null) {
    return v.lower === v.upper
      ? `your time seems worth about $${v.lower}/hr to you here`
      : `your time seems worth between $${v.lower} and $${v.upper}/hr to you here`;
  }
  if (v.lower !== null) return `you have paid to save time: it seems worth at least $${v.lower}/hr to you here`;
  return `you have passed on paying to save time: it seems worth under $${v.upper}/hr to you here`;
}

/**
 * How trips turned out in a situation: arrived on time (early counts),
 * "same choice again?" answered no, and her reasons, most given first.
 */
export function outcomeSummary(log, context, { min = 3 } = {}) {
  const answered = (Array.isArray(log) ? log : []).filter((e) => e && e.context
    && (e.arrival || typeof e.again === 'boolean' || (Array.isArray(e.reasons) && e.reasons.length)));
  if (answered.length === 0) return null;
  const level = LEVELS.find((l) => answered.filter(sameAt(l, context)).length >= min) || LEVELS[LEVELS.length - 1];
  const same = answered.filter(sameAt(level, context));
  if (same.length === 0) return null;
  const arrived = same.filter((e) => e.arrival);
  const againAnswered = same.filter((e) => typeof e.again === 'boolean');
  const counts = new Map();
  same.forEach((e) => (e.reasons || []).forEach((x) => counts.set(x, (counts.get(x) || 0) + 1)));
  return {
    level,
    arrival: arrived.length ? { onTime: arrived.filter((e) => e.arrival !== 'late').length, of: arrived.length } : null,
    regret: againAnswered.length ? { no: againAnswered.filter((e) => e.again === false).length, of: againAnswered.length } : null,
    reasons: [...counts.entries()].sort((a, b) => b[1] - a[1]),
  };
}
