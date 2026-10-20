/**
 * Personal Utility Agent SG — bounded intent and clarification layer.
 *
 * This module interprets what the user typed and returns structured fields.
 * It does not calculate transport facts, call providers, book rides, retain
 * history or learn weights. The deterministic calculator remains authoritative.
 */

const BOOKING_PATTERN = /\b(?:book|reserve|order|hail|call)\s+(?:me\s+)?(?:a\s+)?(?:grab|taxi|cab|ride)\b/i;

const PLACE_ALIASES = {
  sgh: ['sgh', 'singapore general hospital'],
  nuh: ['nuh', 'national university hospital'],
  ttsh: ['ttsh', 'tan tock seng'],
  cgh: ['cgh', 'changi general hospital'],
  ktph: ['ktph', 'khoo teck puat'],
  'mount-e': ['mount e', 'mount elizabeth'],
  gleneagles: ['gleneagles'],
  ion: ['ion', 'ion orchard'],
  'raffles-city': ['raffles city'],
  vivocity: ['vivocity', 'vivo city'],
  jem: ['jem'],
  'tampines-mall': ['tampines mall'],
  nex: ['nex'],
  'causeway-point': ['causeway point'],
  'changi-airport': ['changi airport', 'jewel'],
  'marina-bay-sands': ['marina bay sands', 'mbs'],
  sentosa: ['sentosa'],
  'sports-hub': ['sports hub', 'national stadium'],
};

const CONTEXT_PATTERNS = [
  ['medical', /\b(?:medical|doctor|hospital|clinic|appointment|check[- ]?up)\b/i],
  ['heavy', /\b(?:heavy|luggage|bags?|boxes|equipment|shopping haul)\b/i],
  ['kids', /\b(?:kids?|children|child|baby|babies|elderly|wheelchair|stroller)\b/i],
  ['event', /\b(?:event|concert|party|wedding|drinks?|alcohol)\b/i],
  ['errand', /\b(?:errand|grocer(?:y|ies)|shopping|collect|pickup|pick up)\b/i],
];

const normalise = (value) => String(value || '')
  .toLowerCase()
  .replace(/[’']/g, '')
  .replace(/[^a-z0-9.]+/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();

const boundedNumber = (match, ceiling) => {
  if (!match) return null;
  const value = Number(match[1]);
  return Number.isFinite(value) && value >= 0 ? Math.min(value, ceiling) : null;
};

function findPlace(query, places) {
  const haystack = ` ${normalise(query)} `;
  const candidates = places.flatMap((place) => {
    const aliases = new Set([
      place.id,
      place.label,
      place.source,
      ...(PLACE_ALIASES[place.id] || []),
    ].map(normalise).filter(Boolean));
    return [...aliases].map((alias) => ({ place, alias }));
  }).sort((a, b) => b.alias.length - a.alias.length);

  return candidates.find(({ alias }) => haystack.includes(` ${alias} `))?.place || null;
}

export function destinationTypeForPlace(place) {
  if (!place) return null;
  if (['mount-e', 'gleneagles'].includes(place.id)) return 'private-hosp';
  if (place.group === 'Hospitals') return 'public-hosp';
  if (['ion', 'raffles-city', 'marina-bay-sands'].includes(place.id)) return 'cbd';
  if (place.group === 'Malls & shopping') return 'heartland';
  return 'other';
}

export function interpretTripIntent(query, places = []) {
  const text = String(query || '').trim();
  const place = findPlace(text, places);
  const distance = boundedNumber(
    text.match(/\b(\d+(?:\.\d+)?)\s*(?:km|kilomet(?:er|re)s?)\b/i),
    300,
  );
  const parkHours = boundedNumber(
    text.match(/\b(?:park(?:ing|ed)?(?:\s+for)?\s*)?(\d+(?:\.\d+)?)\s*(?:h|hr|hrs|hour|hours)\b/i),
    72,
  );
  const arriveMatch = text.match(/\b(?:arrive|reach|be there)\s+(?:by|at)\s+(\d{1,2}(?::\d{2})?\s*(?:am|pm))\b/i)
    || text.match(/\bby\s+(\d{1,2}(?::\d{2})?\s*(?:am|pm))\b/i);
  const departMatch = text.match(/\b(?:depart|leave)\s+(?:at|by)\s+(\d{1,2}(?::\d{2})?\s*(?:am|pm))\b/i);
  const timingMode = arriveMatch ? 'arrive_by' : departMatch ? 'depart_at' : 'leave_now';
  const timingText = (arriveMatch?.[1] || departMatch?.[1])?.replace(/\s+/g, '').toUpperCase() || null;
  const context = CONTEXT_PATTERNS.find(([, pattern]) => pattern.test(text))?.[0] || null;

  return {
    text,
    blockedAction: BOOKING_PATTERN.test(text) ? 'ride_booking' : null,
    placeId: place?.id || null,
    placeLabel: place?.label || null,
    destinationType: destinationTypeForPlace(place),
    distance,
    parkHours,
    arrivalText: arriveMatch?.[1]?.replace(/\s+/g, '').toUpperCase() || null,
    timingMode,
    timingText,
    context,
  };
}

export function nextClarification({ hasDistance, hasParkHours, hasDestination = true, hasTiming = true, hasParkingRate = true }) {
  if (!hasDestination) {
    return {
      field: 'destination',
      message: 'Where are you going? Search for a place, landmark or postal code.',
    };
  }
  if (!hasTiming) {
    return {
      field: 'timing',
      message: 'Are you leaving now, departing at a time, or arriving by a time?',
    };
  }
  if (!hasDistance) {
    return {
      field: 'distance',
      message: 'Use your current location or enter the one-way distance so I can compare the trip.',
    };
  }
  if (!hasParkHours) {
    return {
      field: 'parkHours',
      message: 'How long do you expect to park? That is usually the swing variable.',
    };
  }
  if (!hasParkingRate) {
    return {
      field: 'parkRate',
      message: 'What parking rate should I use? This destination has no reliable default.',
    };
  }
  return null;
}

export function agentSetupMessage(intent, clarification) {
  if (!intent.text) return 'Tell me the trip in one sentence and I’ll set up the comparison.';

  const applied = [
    intent.placeLabel,
    intent.distance !== null ? `${intent.distance} km each way` : null,
    intent.parkHours !== null ? `${intent.parkHours} hours parking` : null,
  ].filter(Boolean);
  const notes = [];

  if (intent.blockedAction === 'ride_booking') {
    notes.push('I can compare Grab, but I cannot book or purchase a ride.');
  }
  if (intent.timingText) {
    notes.push(`${intent.timingMode === 'arrive_by' ? 'Arrive by' : 'Depart at'} ${intent.timingText} noted.`);
  }
  if (applied.length) notes.push(`I picked up ${applied.join(', ')}.`);
  if (clarification) notes.push(clarification.message);
  if (!clarification) notes.push('The comparison is ready. I’ll explain the result using the calculated figures.');

  return notes.join(' ');
}
