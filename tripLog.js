/**
 * What she actually took, kept on her phone only.
 *
 * Every storage call is wrapped: private browsing or blocked site data gives
 * an empty log and silent no-op writes, never a broken page. Records are
 * rebuilt from a whitelist, so coordinates cannot get in by accident.
 */
const MODES = ['mrt', 'drive', 'grab'];
const CONTEXT_KEYS = ['band', 'dayType', 'direction', 'purpose'];
const CAP = 500;

/** Reasons she can give for going against the verdict (step 2 uses them). */
export const REASONS = ['comfort', 'faster', 'carrying', 'weather', 'tired', 'habit'];
const ARRIVALS = ['early', 'on-time', 'late'];

const isoOk = (v) => typeof v === 'string' && !Number.isNaN(Date.parse(v));
/** {mrt, drive, grab} as numbers only; anything else dropped. */
const modeNumbers = (o) => {
  if (!o || typeof o !== 'object') return null;
  const out = {};
  for (const m of MODES) {
    const n = Number(o[m]);
    if (o[m] !== null && o[m] !== undefined && o[m] !== '' && Number.isFinite(n)) out[m] = n;
  }
  return Object.keys(out).length ? out : null;
};

export function makeTripLog(storage = globalThis.localStorage, key = 'dom.tripLog.v1') {
  const read = () => {
    try {
      const parsed = JSON.parse(storage?.getItem(key) || '[]');
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  };
  const write = (list) => {
    if (!storage) return false; // no storage at all: don't claim it was saved
    try { storage.setItem(key, JSON.stringify(list)); return true; } catch { return false; }
  };

  /**
   * Create a trip, or add to one by id. A trip fills in over time: "leaving
   * now", "I took", then arrival and "same again" the next day. Every field
   * is rebuilt from a whitelist, so coordinates cannot get in. Returns the
   * id, or null if refused (bad choice, or nothing was saved).
   */
  function upsert(fields = {}) {
    const { id, at, context, shown = {}, chose } = fields;
    if (chose !== undefined && chose !== null && !MODES.includes(chose)) return null;
    const list = read();
    const existing = id ? list.find((e) => e && e.id === id) : null;
    if (!existing && !isoOk(String(at))) return null;

    const prev = existing || {};
    const prevShown = prev.shown || {};
    const r = {
      v: 2,
      id: existing ? existing.id : (id || `${at}-${Math.random().toString(36).slice(2, 8)}`),
      at: existing ? existing.at : String(at),
      context: existing ? prev.context
        : Object.fromEntries(CONTEXT_KEYS.map((k) => [k, typeof context?.[k] === 'string' ? context[k] : null])),
      shown: {
        recommended: MODES.includes(shown.recommended) ? shown.recommended : (prevShown.recommended ?? null),
        variant: typeof shown.variant === 'string' ? shown.variant : (prevShown.variant || 'show-only'),
        costs: modeNumbers(shown.costs) || prevShown.costs || null,
        minutes: modeNumbers(shown.minutes) || prevShown.minutes || null,
        suggestedLeaveBy: isoOk(shown.suggestedLeaveBy) ? shown.suggestedLeaveBy : (prevShown.suggestedLeaveBy ?? null),
        deadline: isoOk(shown.deadline) ? shown.deadline : (prevShown.deadline ?? null),
      },
      chose: MODES.includes(chose) ? chose : (MODES.includes(prev.chose) ? prev.chose : null),
      leftAt: isoOk(fields.leftAt) ? fields.leftAt : (prev.leftAt ?? null),
      arrival: ARRIVALS.includes(fields.arrival) ? fields.arrival : (prev.arrival ?? null),
      again: typeof fields.again === 'boolean' ? fields.again : (prev.again ?? null),
      reasons: Array.isArray(fields.reasons)
        ? [...new Set(fields.reasons.filter((x) => REASONS.includes(x)))]
        : (Array.isArray(prev.reasons) ? prev.reasons : []),
      outcomeAsked: typeof fields.outcomeAsked === 'boolean' ? fields.outcomeAsked : (prev.outcomeAsked === true),
    };
    r.overrode = r.chose && r.shown.recommended ? r.chose !== r.shown.recommended : null;

    const next = list.filter((e) => e && e.id !== r.id);
    next.push(r);
    next.sort((a, b) => String(a.at).localeCompare(String(b.at)));
    return write(next.slice(-CAP)) ? r.id : null;
  }

  return {
    all: read,
    upsert,
    /** Kept for the "I took" tap: a choice is required. */
    record(fields) { return MODES.includes(fields?.chose) ? upsert(fields) : null; },
    exportJson: () => JSON.stringify(read(), null, 2),
  };
}

/** Saved Home / Work, on the phone only. Never part of the exported log. */
export function makeSavedPlaces(storage = globalThis.localStorage, key = 'dom.places.v1') {
  return {
    get() {
      try { return JSON.parse(storage?.getItem(key) || '{}') || {}; } catch { return {}; }
    },
    set(name, point) {
      if (!storage || !['home', 'work'].includes(name) || !point) return false;
      try {
        const places = JSON.parse(storage.getItem(key) || '{}') || {};
        places[name] = { lat: Number(point.lat), lng: Number(point.lng) };
        storage.setItem(key, JSON.stringify(places));
        return true;
      } catch {
        return false;
      }
    },
  };
}

/** Your car: petrol price and fuel economy, set once. ERP is per trip, never saved. */
export function makeCarSettings(storage = globalThis.localStorage, key = 'dom.car.v1') {
  const ok = (n, min, max) => Number.isFinite(n) && n >= min && n <= max;
  return {
    get() {
      try {
        const c = JSON.parse(storage?.getItem(key) || 'null');
        if (!c) return null;
        const petrol = Number(c.petrol);
        const fuel = Number(c.fuel);
        return ok(petrol, 0.5, 10) && ok(fuel, 1, 50) ? { petrol, fuel } : null;
      } catch { return null; }
    },
    set({ petrol, fuel }) {
      const p = Number(petrol);
      const f = Number(fuel);
      if (!storage || !ok(p, 0.5, 10) || !ok(f, 1, 50)) return false;
      try { storage.setItem(key, JSON.stringify({ petrol: p, fuel: f })); return true; } catch { return false; }
    },
  };
}

/**
 * Your car's full cost, set up once (step 3). Price is required; everything
 * else is checked against sensible ranges. On this phone only.
 */
export function makeOwnership(storage = globalThis.localStorage, key = 'dom.carOwn.v1') {
  const RANGES = {
    price: [1000, 2000000], endValue: [0, 2000000], yearsKept: [1, 20],
    insurancePerYear: [0, 20000], roadTaxPerYear: [0, 20000], servicingPerYear: [0, 20000],
    seasonParkingPerMonth: [0, 1000], kmPerYear: [1000, 100000],
  };
  const clean = (o) => {
    if (!o || typeof o !== 'object') return null;
    const c = {};
    for (const [k, [lo, hi]] of Object.entries(RANGES)) {
      const n = Number(o[k]);
      if (o[k] === null || o[k] === undefined || o[k] === '' || !Number.isFinite(n) || n < lo || n > hi) return null;
      c[k] = n;
    }
    return c.endValue <= c.price ? c : null;
  };
  return {
    get() {
      try { return clean(JSON.parse(storage?.getItem(key) || 'null')); } catch { return null; }
    },
    set(o) {
      const c = clean(o);
      if (!storage || !c) return false;
      try { storage.setItem(key, JSON.stringify(c)); return true; } catch { return false; }
    },
  };
}
