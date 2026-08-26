import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import {
  agentSetupMessage,
  destinationTypeForPlace,
  interpretTripIntent,
  nextClarification,
} from '../agent.js';

const places = [
  { id: 'nuh', label: 'National University Hospital', group: 'Hospitals', source: 'Kent Ridge' },
  { id: 'mount-e', label: 'Mount Elizabeth Hospital', group: 'Hospitals', source: 'Orchard' },
  { id: 'tampines-mall', label: 'Tampines Mall', group: 'Malls & shopping', source: 'Tampines' },
  { id: 'ion', label: 'ION Orchard', group: 'Malls & shopping', source: 'Orchard Road' },
];

describe('bounded trip-intent interpretation', () => {
  test('extracts destination, distance, parking duration, arrival and context', () => {
    const intent = interpretTripIntent(
      'Medical appointment at NUH by 2pm, 12 km away and parking for 3 hours',
      places,
    );
    assert.equal(intent.placeId, 'nuh');
    assert.equal(intent.destinationType, 'public-hosp');
    assert.equal(intent.distance, 12);
    assert.equal(intent.parkHours, 3);
    assert.equal(intent.arrivalText, '2PM');
    assert.equal(intent.context, 'medical');
  });

  test('distinguishes private hospitals and central malls locally', () => {
    assert.equal(destinationTypeForPlace(places[1]), 'private-hosp');
    assert.equal(destinationTypeForPlace(places[2]), 'heartland');
    assert.equal(destinationTypeForPlace(places[3]), 'cbd');
  });

  test('recognises common Singapore aliases without an external API', () => {
    assert.equal(interpretTripIntent('Going to NUH', places).placeId, 'nuh');
    assert.equal(interpretTripIntent('ION Orchard for 2 hrs', places).placeId, 'ion');
  });

  test('bounds extracted numbers to the calculator ceilings', () => {
    const intent = interpretTripIntent('3000 km and parking 200 hours', places);
    assert.equal(intent.distance, 300);
    assert.equal(intent.parkHours, 72);
  });
});

describe('one useful clarification', () => {
  test('asks for distance before parking duration', () => {
    assert.equal(nextClarification({ hasDistance: false, hasParkHours: false }).field, 'distance');
  });

  test('asks only for parking duration once distance exists', () => {
    assert.equal(nextClarification({ hasDistance: true, hasParkHours: false }).field, 'parkHours');
  });

  test('returns no clarification when the comparison is ready', () => {
    assert.equal(nextClarification({ hasDistance: true, hasParkHours: true }), null);
  });

  test('asks for destination type before treating blank parking as free', () => {
    const clarification = nextClarification({
      hasDistance: true,
      hasParkHours: true,
      hasDestination: false,
      hasParkingRate: false,
    });
    assert.equal(clarification.field, 'destType');
  });

  test('asks for a parking rate when the selected type has no default', () => {
    const clarification = nextClarification({
      hasDistance: true,
      hasParkHours: true,
      hasDestination: true,
      hasParkingRate: false,
    });
    assert.equal(clarification.field, 'parkRate');
  });
});

describe('permanent agent boundaries', () => {
  test('a booking request is identified and converted to comparison-only help', () => {
    const intent = interpretTripIntent('Book me a Grab to NUH', places);
    assert.equal(intent.blockedAction, 'ride_booking');
    const message = agentSetupMessage(intent, nextClarification({ hasDistance: false, hasParkHours: false }));
    assert.match(message, /cannot book or purchase/i);
    assert.match(message, /compare Grab/i);
  });

  test('the interpreter exposes no memory, reward or learning output', () => {
    const intent = interpretTripIntent('NUH, 12 km, parking 3 hours', places);
    assert.deepEqual(Object.keys(intent).sort(), [
      'arrivalText', 'blockedAction', 'context', 'destinationType', 'distance',
      'parkHours', 'placeId', 'placeLabel', 'text',
    ]);
  });
});
