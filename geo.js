/**
 * Geometry layer — turning "where the phone is" into a trip distance.
 *
 * This is the deterministic sibling of calc.js: every function is pure, the
 * same inputs give the same outputs, and there is no DOM, no fetch and no
 * `navigator.geolocation` in this file. Reading the phone's position is a
 * side-effecting browser call and lives in the page; converting two
 * coordinates into a kilometre figure is arithmetic and lives here, where it
 * can be unit-tested exactly like D1-D10.
 *
 * The winding factor and the landmark coordinates are heuristics and live in
 * /data/landmarks.json, arriving as arguments. This file knows the geometry;
 * it does not know the guesses.
 */

/** Mean Earth radius in km. The standard spherical-earth value for haversine. */
export const EARTH_RADIUS_KM = 6371;

/** Degrees to radians. */
export const toRadians = (deg) => (deg * Math.PI) / 180;

/**
 * Great-circle distance between two {lat, lng} points, in kilometres.
 *
 * Haversine, not the flat-earth Pythagoras shortcut: over Singapore the error
 * is small, but the formula costs nothing extra and does not quietly break if
 * the calculator is ever pointed at a longer trip. Returns 0 for missing or
 * non-finite input rather than NaN, so no caller downstream has to defend
 * itself — the same discipline toNumber() applies in calc.js.
 */
export function haversineKm(a, b) {
  if (!a || !b) return 0;
  const lat1 = Number(a.lat);
  const lng1 = Number(a.lng);
  const lat2 = Number(b.lat);
  const lng2 = Number(b.lng);
  if (![lat1, lng1, lat2, lng2].every(Number.isFinite)) return 0;

  const dLat = toRadians(lat2 - lat1);
  const dLng = toRadians(lng2 - lng1);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) * Math.sin(dLng / 2) ** 2;

  return EARTH_RADIUS_KM * 2 * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * H9 — approximate a road distance from a straight-line one.
 *
 * A car does not fly to the destination, so the great-circle gap always
 * understates the drive. A flat multiplier is the honest floor of a fix here:
 * it is not a routed distance and knows nothing about expressways, one-way
 * streets or the Causeway. Anything derived from this must be labelled as an
 * estimate in the UI, which is why the factor lives in the data file with a
 * caveat beside it.
 *
 * `windingFactor` below 1 (or non-finite) would make the road shorter than the
 * straight line, which is impossible, so it clamps to 1.
 */
export function estimateRoadDistanceKm(straightLineKm, windingFactor = 1) {
  const km = Number.isFinite(straightLineKm) && straightLineKm > 0 ? straightLineKm : 0;
  const f = Number.isFinite(windingFactor) && windingFactor >= 1 ? windingFactor : 1;
  return km * f;
}

/**
 * The one call the page makes: origin + destination coordinates to an
 * estimated one-way road distance in km. Composed from the two functions
 * above so each stays independently testable.
 */
export function estimateTripDistanceKm(origin, destination, windingFactor = 1) {
  return estimateRoadDistanceKm(haversineKm(origin, destination), windingFactor);
}
