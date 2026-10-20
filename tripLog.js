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

  return {
    all: read,

    /** Add, or replace the record with the same id (changing your tap). Returns the id, or null. */
    record({ id, at, context = {}, shown = {}, chose }) {
      if (!MODES.includes(chose)) return null;
      const clean = {
        v: 1,
        id: id || `${at}-${Math.random().toString(36).slice(2, 8)}`,
        at: String(at),
        context: Object.fromEntries(CONTEXT_KEYS.map((k) => [k, typeof context[k] === 'string' ? context[k] : null])),
        shown: {
          recommended: MODES.includes(shown.recommended) ? shown.recommended : null,
          variant: typeof shown.variant === 'string' ? shown.variant : 'show-only',
        },
        chose,
        overrode: MODES.includes(shown.recommended) ? chose !== shown.recommended : null,
      };
      const list = read().filter((e) => e && e.id !== clean.id);
      list.push(clean);
      list.sort((a, b) => String(a.at).localeCompare(String(b.at)));
      return write(list.slice(-CAP)) ? clean.id : null;
    },

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
