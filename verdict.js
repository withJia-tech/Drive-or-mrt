/**
 * The "Why this call" wording, as a pure function of computeAll's result.
 * No DOM, no AI: every sentence is built from the numbers it explains, so it
 * can be unit-tested (test/qa-verdict-validation.test.js).
 *
 * QA 2026-10-20 fixes:
 *  - D3: the copy follows the actual cheapest mode. Grab cheapest used to
 *    read "…Drive. Grab actually beats both…".
 *  - D4: the copy names the biggest part of the driving cost. It used to say
 *    parking "is the killer" even at $0.60 against $20 of petrol, and "1 hours".
 */
const money = (n) => `$${Number(n).toFixed(2)}`;
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const hours = (h) => `${h} hour${Number(h) === 1 ? '' : 's'}`;
const km = (n) => `${Number((n * 2).toFixed(1))} km`; // return trip, as the costs are

/** The largest part of the driving total: parking, petrol, ERP or your car's share. */
export function biggestDriveCost(r) {
  const parts = [
    ['parking', r.parking || 0],
    ['petrol', r.petrol || 0],
    ['erp', r.erp || 0],
    ['car', r.driveExtra || 0],
  ];
  return parts.reduce((a, b) => (b[1] > a[1] ? b : a))[0];
}

/**
 * @param r     computeAll result: petrol, parking, erp, driveExtra, drive, mrt, grab, winner, band, delta
 * @param meta  { destLabel, parkHours, distance } (distance one way, km)
 * @returns { html, share }
 */
export function verdictCopy(r, meta) {
  const dest = esc(meta.destLabel);
  // "at a hospital", but "at this destination" (not "at a this destination").
  const atDest = meta.destLabel === 'this destination' ? 'this destination' : `a ${dest}`;

  if (r.winner === 'grab') {
    return {
      html: `Grab is cheapest at <strong>${money(r.grab)}</strong> return — ${money(r.drive - r.grab)} less than driving and ${money(r.mrt - r.grab)} less than the MRT. Door to door, with no parking to pay.`,
      share: `Grab wins at ${money(r.grab)} (driving ${money(r.drive)}, MRT ${money(r.mrt)}).`,
    };
  }

  const gap = money(r.delta);
  if (r.band === 'mrt-wins') {
    const driver = biggestDriveCost(r);
    const why = {
      parking: `Parking at ${atDest} is the killer — ${money(r.parking)} for just ${hours(meta.parkHours)}.`,
      petrol: `Petrol for the ${km(meta.distance)} return trip (${money(r.petrol)}) is most of the driving cost.`,
      erp: `ERP (${money(r.erp)}) is the biggest part of the driving cost.`,
      car: `Your car's share of running and owning costs (${money(r.driveExtra)}) is the biggest part of driving.`,
    }[driver];
    return {
      html: `MRT saves you <strong>${gap}</strong> on this trip. ${why} Unless you need door-to-door, take the train.`,
      share: `MRT saves ${gap} vs driving. Door-to-door — your call.`,
    };
  }

  if (r.band === 'drive-wins') {
    const why = r.petrol >= r.parking
      ? `Parking at ${atDest} is reasonable enough that petrol is most of what you're really paying.`
      : `That's even with ${money(r.parking)} of parking.`;
    return {
      html: `Driving is cheaper by <strong>${gap}</strong>. ${why} Drive.`,
      share: `Driving wins by ${gap}. Parking isn't the killer here.`,
    };
  }

  return {
    html: `It's within <strong>${gap}</strong> either way — this is a comfort call, not a cost one.`,
    share: `Within ${gap} either way — comfort call.`,
  };
}
