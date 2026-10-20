/**
 * Fallback mirror of /data/fare-defaults.json and /data/parking-defaults.json.
 *
 * WHY THIS EXISTS
 * The canonical assumptions live in /data/*.json so a non-developer can revise
 * them without touching calculator logic. That buys auditability and costs a
 * network request that can fail: a mistyped path, a partial deploy, a 404 on
 * a renamed file, a flaky connection. A cost calculator that renders nothing
 * in those cases is worse than one carrying a stale-but-labelled default, so
 * the JSON is the source of truth and this is the parachute.
 *
 * WHAT THIS DOES *NOT* RESCUE — measured, not assumed
 * Opening index.html straight off disk. Chromium blocks ES module imports
 * over file:// as a CORS violation, so this module never loads and the
 * fallback never runs; the page is inert before any fetch is attempted.
 * Serve the folder over http for local development:
 *     python3 -m http.server 8099
 * That is a property of ES modules, not of this design — inlining every
 * script to dodge it would cost the unit tests, which is the worse trade.
 *
 * WHY THIS DOES NOT ROT
 * A mirror maintained by hand is a drift bug waiting to happen. It does not
 * drift here because test/data-drift.test.js asserts these objects are deeply
 * equal to the JSON files and fails the moment they diverge. Edit the JSON,
 * run the tests, and the test tells you to update this file.
 */

export const FARE_DEFAULTS = {
  assumptionsVersion: '2026.08',
  lastReviewed: '2026-08-17',
  caveat:
    'Every value below is an assumption, not a live figure. The calculator stamps this version onto shared results so a stale number is visible rather than silently wrong.',
  trip: {
    petrolPrice: 3.0,
    fuelEconomy: 12,
    erp: 0,
    petrolNote: 'Sinopec with card ~$2.66 · Shell full price ~$3.46',
    fuelNote: 'A typical Singapore sedan does about 12.',
  },
  alternatives: {
    mrtFare: 1.8,
    walkTime: 10,
    hourlyRate: 25,
    fareNote:
      "Check the SMRT or bus app for the exact fare — we don't estimate it. Cross-island averages around $1.80.",
    hourlyNote: '$4,000 a month is roughly $25/hr (MoneySense).',
  },
  grabEstimate: {
    logicId: 'H2',
    base: 3.5,
    perKm: 0.55,
    caveat:
      'Ignores surge, time of day and platform fees. No public Grab API exists, so this stays an estimate and is always labelled as one.',
  },
  speeds: {
    driveKmh: 40,
    driveBufferMin: 4,
    mrtKmh: 25,
    grabKmh: 40,
    grabBufferMin: 6,
    grabWaitWorstMin: 15,
    grabWaitNote:
      'Assumption, not data. grabBufferMin is a typical wait for the car; grabWaitWorstMin is a bad-day wait (rain, peak). Arrive-by plans use the worst case so a Grab plan is never the one that makes you late.',
    returnJourney: true,
    caveat:
      'H3 and H4. No traffic model, no transfer or platform-wait model. The MRT figure is the most under-modelled number in the build.',
    note:
      'Times are for the whole return journey, matching the costs, which are all return figures too. The drive buffer is time spent finding a space; the Grab buffer is time spent waiting for the car.',
  },
  verdict: {
    logicId: 'D9',
    thresholdSgd: 5,
    caveat:
      'H7. A flat $5 band is arbitrary and does not scale with trip cost. A proportional band, max(5, 0.15 x driveTotal), is the noted fix path but is deliberately NOT implemented here, because D9 in the handoff specifies the flat threshold.',
  },
  limits: {
    maxDistanceKm: 300,
    maxParkHours: 72,
    caveat:
      'Guards against absurd input. Singapore is about 50 km end to end, so 300 km of one-way driving is already generous.',
  },
};

export const PARKING_DEFAULTS = {
  version: '1.1.0',
  lastReviewed: '2026-08-17',
  logicId: 'H1',
  status: 'heuristic',
  caveat:
    'Indicative flat hourly rates. Real Singapore carparks bill per 30 minutes with tiered escalation, and rates differ by day and time. These are approximations for comparison, not quotes.',
  upgradePath:
    'Phase 2 replaces this file with published HDB and URA carpark rates. Only the numbers change; the shape of this file does not.',
  destinations: [
    {
      id: 'hdb',
      label: 'HDB carpark',
      shortLabel: 'HDB carpark',
      rate: 0.6,
      source: 'Typical HDB short-term rate',
    },
    {
      id: 'heartland',
      label: 'Heartland mall — Tampines, JEM',
      shortLabel: 'heartland mall',
      rate: 2.0,
      source: 'Typical heartland mall rate',
    },
    {
      id: 'cbd',
      label: 'CBD or Orchard — ION, Raffles City',
      shortLabel: 'CBD or Orchard mall',
      rate: 5.0,
      source: 'Typical central-area weekday rate',
    },
    {
      id: 'public-hosp',
      label: 'Public hospital — SGH, NUH, TTSH',
      shortLabel: 'public hospital',
      rate: 3.0,
      source: 'Typical restructured-hospital visitor rate',
    },
    {
      id: 'private-hosp',
      label: 'Private hospital — Mt E, Gleneagles',
      shortLabel: 'private hospital',
      rate: 5.5,
      source: 'Typical private-hospital visitor rate',
    },
    {
      id: 'other',
      label: 'Other',
      shortLabel: 'this destination',
      rate: null,
      source: 'Your own figure',
    },
  ],
};

/**
 * Landmark coordinates for the "use my location" feature (H9).
 *
 * These convert the phone's detected position into the one figure the
 * calculator needs — the one-way distance — via the straight-line maths in
 * geo.js. The coordinates are approximate and the winding factor is a flat
 * guess, so this is a heuristic like PARKING_DEFAULTS: labelled in the UI,
 * carrying its own caveat and upgrade path, never presented as a routed
 * driving distance.
 *
 * Same mirror discipline as above: /data/landmarks.json is the source of
 * truth and test/data-drift.test.js fails the moment this copy diverges.
 */
export const LANDMARK_DEFAULTS = {
  version: '1.0.0',
  lastReviewed: '2026-08-23',
  logicId: 'H9',
  status: 'heuristic',
  windingFactor: 1.35,
  caveat:
    'Distance is the straight-line (great-circle) gap between your phone and the destination, multiplied by a flat 1.35 to approximate real roads. It is not a routed driving distance — no expressway, one-way or traffic model — so treat it as a starting estimate and edit the field if you know the real figure.',
  upgradePath:
    'Phase 2 swaps the flat winding factor and the fixed landmark list for a routing service or an on-map destination pin, turning the estimate into an actual road distance. Only the source of the two coordinates changes; the arithmetic in geo.js does not.',
  places: [
    { id: 'sgh', label: 'Singapore General Hospital', group: 'Hospitals', lat: 1.2793, lng: 103.8348, source: 'Outram Road' },
    { id: 'nuh', label: 'National University Hospital', group: 'Hospitals', lat: 1.2939, lng: 103.7834, source: 'Kent Ridge' },
    { id: 'ttsh', label: 'Tan Tock Seng Hospital', group: 'Hospitals', lat: 1.3216, lng: 103.8459, source: 'Novena' },
    { id: 'cgh', label: 'Changi General Hospital', group: 'Hospitals', lat: 1.3403, lng: 103.9490, source: 'Simei' },
    { id: 'ktph', label: 'Khoo Teck Puat Hospital', group: 'Hospitals', lat: 1.4241, lng: 103.8384, source: 'Yishun' },
    { id: 'mount-e', label: 'Mount Elizabeth Hospital', group: 'Hospitals', lat: 1.3050, lng: 103.8355, source: 'Orchard' },
    { id: 'gleneagles', label: 'Gleneagles Hospital', group: 'Hospitals', lat: 1.3074, lng: 103.8180, source: 'Napier Road' },
    { id: 'ion', label: 'ION Orchard', group: 'Malls & shopping', lat: 1.3040, lng: 103.8318, source: 'Orchard Road' },
    { id: 'raffles-city', label: 'Raffles City', group: 'Malls & shopping', lat: 1.2934, lng: 103.8534, source: 'City Hall' },
    { id: 'vivocity', label: 'VivoCity', group: 'Malls & shopping', lat: 1.2643, lng: 103.8222, source: 'HarbourFront' },
    { id: 'jem', label: 'JEM', group: 'Malls & shopping', lat: 1.3331, lng: 103.7434, source: 'Jurong East' },
    { id: 'tampines-mall', label: 'Tampines Mall', group: 'Malls & shopping', lat: 1.3527, lng: 103.9449, source: 'Tampines' },
    { id: 'nex', label: 'NEX', group: 'Malls & shopping', lat: 1.3505, lng: 103.8720, source: 'Serangoon' },
    { id: 'causeway-point', label: 'Causeway Point', group: 'Malls & shopping', lat: 1.4360, lng: 103.7862, source: 'Woodlands' },
    { id: 'changi-airport', label: 'Changi Airport / Jewel', group: 'Airport & landmarks', lat: 1.3592, lng: 103.9894, source: 'Changi' },
    { id: 'marina-bay-sands', label: 'Marina Bay Sands', group: 'Airport & landmarks', lat: 1.2834, lng: 103.8607, source: 'Marina Bay' },
    { id: 'sentosa', label: 'Sentosa (Beach Station)', group: 'Airport & landmarks', lat: 1.2494, lng: 103.8303, source: 'Sentosa' },
    { id: 'sports-hub', label: 'Singapore Sports Hub', group: 'Airport & landmarks', lat: 1.3040, lng: 103.8746, source: 'Kallang' },
  ],
};

/**
 * Load assumptions, preferring the canonical JSON and falling back to the
 * mirror above. Never rejects — the calculator must always have numbers.
 * Returns { fares, parking, landmarks, source } where source is 'data' or
 * 'fallback'. The three files stand or fall together: if any fetch fails the
 * whole set drops to the built-in mirror, so the page never runs on a mix of
 * live and stale assumptions.
 */
export async function loadAssumptions(basePath = './data') {
  try {
    const [fares, parking, landmarks] = await Promise.all([
      fetch(`${basePath}/fare-defaults.json`).then((r) => {
        if (!r.ok) throw new Error(`fare-defaults ${r.status}`);
        return r.json();
      }),
      fetch(`${basePath}/parking-defaults.json`).then((r) => {
        if (!r.ok) throw new Error(`parking-defaults ${r.status}`);
        return r.json();
      }),
      fetch(`${basePath}/landmarks.json`).then((r) => {
        if (!r.ok) throw new Error(`landmarks ${r.status}`);
        return r.json();
      }),
    ]);
    return { fares, parking, landmarks, source: 'data' };
  } catch (err) {
    console.warn(
      '[is-it-worth-it] Could not load /data/*.json, using built-in assumptions.',
      err,
    );
    return {
      fares: FARE_DEFAULTS,
      parking: PARKING_DEFAULTS,
      landmarks: LANDMARK_DEFAULTS,
      source: 'fallback',
    };
  }
}
