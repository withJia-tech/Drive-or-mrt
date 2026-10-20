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

/** "Weekday evenings, work → home: you took the MRT 4 of the last 5 times." */
export function describePattern(pattern, context, bands) {
  const has = (k) => pattern.level.includes(k);
  const bandLabel = bands.find((b) => b.id === context.band)?.label || 'Trips';
  const when = has('dayType')
    ? `${context.dayType === 'weekend' ? 'Weekend' : 'Weekday'} ${bandLabel.toLowerCase()}`
    : bandLabel;
  const parts = [when];
  if (has('direction') && context.direction && context.direction !== 'other') {
    parts.push(context.direction.replace('→', ' → '));
  }
  if (has('purpose') && context.purpose) parts.push(PURPOSE_LABELS[context.purpose] || context.purpose);
  return `${parts.join(', ')}: you ${VERB[pattern.mode]} ${pattern.count} of the last ${pattern.of} times.`;
}
