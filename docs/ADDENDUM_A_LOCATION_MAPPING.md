# Addendum A — Location, destination search and routing

*Companion to the architecture handoff · Calculator 4b*  
*Audience: Architect; PM approval required before enabling metered services*

## 1. Decision summary

Treat location as four separate capabilities:

| Capability | Purpose | Typical mechanism | Key architectural consequence |
|---|---|---|---|
| Detect origin | Obtain the phone's coordinates | Browser Geolocation API | Free browser capability; HTTPS and user permission required |
| Resolve places | Turn coordinates into an address and search destinations | Google Places/Maps JavaScript or OneMap Search | Provider account, attribution, quotas and possibly billing |
| Calculate a route | Return driving distance and duration | Google Routes or OneMap Routing | Prefer a server-side proxy; never expose a web-service credential |
| Price parking | Calculate the charge at the selected car park and time | HDB/URA/LTA/operator data | Separate data product; place category alone is not a parking rate |

The current prototype already delivers the first capability and estimates distance to a maintained landmark list. That is a valid progressive-enhancement baseline. Do not describe reverse geocoding, autocomplete, routing or parking-rate lookup as part of “free geolocation.”

## 2. Target user journey

1. The user taps **Use my current location**.
2. The browser asks for permission and returns latitude, longitude and accuracy.
3. If a place provider is configured, the app shows a short origin label such as “Near Tampines.” Coordinates remain the source of truth.
4. The user chooses either:
   - **Popular places** — the maintained, zero-network fallback; or
   - **Postal code or place** — provider-backed ranked search.
5. Selecting a destination returns its coordinates.
6. Routing returns driving distance and duration and fills the distance field.
7. The app infers destination category, parking basis, transit fare and ride-hail estimate in the background; these are not landing-page sections.
8. Parking duration is asked as one concise inline clarification because it is trip intent and cannot be retrieved reliably.
9. The result discloses the inferred values. **Edit assumptions** reveals the parking and fare controls for correction.
10. If an inference fails, the app reveals only the relevant manual fallback and preserves the trip state.

This is intentionally not a map-first experience. The product needs a trustworthy distance and parking charge, not a decorative map.

## 3. Browser geolocation

Geolocation needs no application API key, but it does require a secure context and user permission. GitHub Pages and Vercel both provide HTTPS.

Request location from an explicit tap rather than on page load. This gives the permission prompt context and preserves the manual path. Treat denial, timeout and an unavailable fix as ordinary outcomes.

```js
function detectLocation() {
  if (!navigator.geolocation) {
    showFallback('Location is unavailable. Enter the distance manually.');
    return;
  }

  navigator.geolocation.getCurrentPosition(
    ({ coords }) => {
      const { latitude, longitude, accuracy } = coords;
      state.origin = { lat: latitude, lng: longitude };

      if (Number.isFinite(accuracy) && accuracy > 500) {
        showNotice('Your location is approximate. Check the route before using it.');
      }
    },
    (error) => {
      const message = {
        1: 'Location permission was declined.',
        2: 'Your location could not be determined.',
        3: 'The location request timed out.',
      }[error.code] || 'Location is unavailable.';

      showFallback(`${message} Enter the distance manually.`);
    },
    { enableHighAccuracy: true, timeout: 10000, maximumAge: 300000 },
  );
}
```

High accuracy may consume more battery and still performs poorly indoors. Surface accuracy when it is materially weak; do not imply that a GPS fix is an exact pickup point.

Recommended copy:

> Use my current location  
> Optional. Your location is used for this calculation and is not stored.

The manual-distance route should remain reachable in one action. It need not dominate the default interface.

## 4. Provider boundary

### Google

Google's browser SDKs and web services have different credential models:

| Surface | Example | Suitable for static hosting? | Credential treatment |
|---|---|---:|---|
| Browser SDK | Maps JavaScript and Places library | Yes | Website-restricted key; restrict enabled APIs |
| Web service | Routes, Places REST and Geocoding REST | Not directly | Call through a server; keep the credential out of the client |

Use separate keys and preferably separate projects for browser and server workloads. Google explicitly recommends restricting keys by application and API and using a proxy for client access to web services. A browser key is visible by design; its protection comes from website and API restrictions, monitoring and quotas.

Google replaced the general USD 200 monthly credit in March 2025 with per-SKU monthly free-usage caps. Most Essentials SKUs receive 10,000 free billable events, Pro 5,000 and Enterprise 1,000, but the exact SKU triggered depends on the fields requested. In particular, requesting a place's `primaryType` triggers Place Details Pro. Pricing must therefore be modelled from the final field mask, not from the name “Place Details.”

Autocomplete is not simply “free at all volumes.” Session pricing depends on how the session terminates; abandoned or incomplete sessions can be billed as individual autocomplete requests. Recheck Google's live pricing sheet before launch.

Authoritative references:

- [Google Maps Platform security guidance](https://developers.google.com/maps/api-security-best-practices)
- [March 2025 pricing change](https://developers.google.com/maps/billing-and-pricing/faq)
- [Current pricing table](https://developers.google.com/maps/billing-and-pricing/pricing)
- [Place fields and their SKUs](https://developers.google.com/maps/documentation/places/web-service/data-fields)

### OneMap

OneMap is the Singapore Land Authority's authoritative national map and supports Singapore address/postal-code search, reverse geocoding and routing. It is a strong fit for local address resolution, but its APIs now require token authentication. Keep token creation and authenticated requests server-side.

Do not call OneMap “unmetered.” Treat it as a quota-controlled external dependency even when no usage charge is published. Confirm current terms, limits and attribution requirements before launch.

References:

- [OneMap API documentation](https://www.onemap.gov.sg/apidocs/)
- [OneMap address and postal-code search](https://www.onemap.gov.sg/apidocs/search)

## 5. Parking is a separate data problem

Place type can improve defaults, but it cannot establish the parking price.

`hospital` does not distinguish public from private facilities. `shopping_mall` does not identify its operator, tariff bands, grace period, per-entry window or promotional rate. Mapping those categories directly to `$3.00` or `$5.50` creates polished false precision.

Use category inference only to narrow the next step:

1. identify the selected destination and coordinates;
2. find an actual car park near it;
3. load the applicable tariff from an authoritative source;
4. calculate the charge for the arrival time and intended duration; and
5. show the source, effective date and a manual override.

Preferred sources:

- HDB car-park metadata plus HDB's published short-term tariff rules;
- URA Car Park Details and Rates API for URA-managed facilities;
- LTA's published car-park rates as a reference for private developments; and
- the car-park operator or destination website where no authoritative structured feed exists.

Live lot availability is useful but does not supply the tariff. Keep availability and pricing as separate fields with separate timestamps.

## 6. Recommended provider strategy

Avoid a Google-plus-OneMap hybrid in the first mapped release unless testing proves that OneMap search is inadequate. Two providers double authentication, failure modes, attribution, monitoring and policy maintenance.

Recommended sequence:

1. **Now:** browser geolocation, popular landmarks and manual distance. This is the current fallback and remains fully functional offline.
2. **Next:** replace category averages with real HDB/URA parking rules and source-labelled private-car-park reference data.
3. **Then:** test OneMap search and routing behind one serverless adapter. If its ranked search is acceptable, use OneMap for postal-code/place resolution and routes.
4. **Only if needed:** add Google Places for superior autocomplete or richer place metadata. Limit the requested fields and keep category inference advisory.

This ordering improves answer quality before adding interface sophistication.

## 7. Serverless adapter

Expose narrow product endpoints such as `/api/search-place` and `/api/route`; do not expose a generic provider proxy.

```js
export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const origin = readCoordinatePair(req.query, 'origin');
  const destination = readCoordinatePair(req.query, 'destination');
  if (!origin || !destination || !insideSingapore(origin) || !insideSingapore(destination)) {
    return res.status(400).json({ error: 'Invalid coordinates' });
  }

  await enforceRateLimit(req);

  const route = await routeProvider({ origin, destination });
  return res.status(200).json({
    distanceKm: round(route.distanceMetres / 1000, 1),
    durationMin: Math.round(route.durationSeconds / 60),
  });
}
```

Controls required before launch:

- validate method, coordinates, bounds and query length before any paid call;
- restrict provider credentials to the minimum APIs;
- set provider quotas and monitoring;
- use platform-level or shared-store rate limiting;
- return only the fields the client needs; and
- log failures without logging precise user coordinates.

An `Origin` header check may reduce casual cross-site use, but it is not authentication: non-browser clients can spoof it. Likewise, an in-memory counter is not a reliable serverless rate limiter because instances are ephemeral and distributed.

Cache destination searches and routes only after a privacy review. Exact origin coordinates may identify a home or workplace. Prefer short-lived caches and quantised origin coordinates; never persist precise location by default.

## 8. Failure behaviour

| Failed layer | Behaviour |
|---|---|
| Geolocation | Offer manual distance without blocking the calculator |
| Place search | Keep popular landmarks and destination-type/manual parking controls |
| Routing | Keep the selected place and request manual distance |
| Parking-rate lookup | Show a source-labelled estimate or request the user's charge |
| All network services | Preserve the current deterministic calculator |

Mapping is progressive enhancement. No provider failure should erase information the user has already entered.

## 9. Cost controls

Do not publish a fixed `$0` forecast until the exact APIs, field masks and session lifecycle are implemented and measured.

For planning, track at least:

- autocomplete requests and completed sessions;
- Place Details calls by SKU;
- reverse-geocode calls;
- route calls;
- cache-hit rate; and
- failures and quota rejections.

Google Cloud budget alerts notify; they do not cap expenditure. Configure both alerts and enforceable per-API quotas. Add application rate limiting before enabling billing. Review usage daily during the first production week.

## 10. Revised roadmap

| Phase | Deliverable | Hosting |
|---|---|---|
| P1 | Deterministic calculator, manual distance and maintained defaults | GitHub Pages |
| P1.5 | User-triggered geolocation plus popular-landmark estimate | GitHub Pages |
| P2 | Source-labelled HDB/URA parking rules and improved private-car-park references | GitHub Pages or scheduled data build |
| P3 | Postal-code/place search and routed distance behind a provider adapter | Serverless hosting |
| P4 | Live availability, transit duration, ERP and broader operational data | Serverless hosting |

If Google Maps JavaScript is selected solely for browser autocomplete or reverse geocoding, P3 can retain static hosting for that client surface. The migration trigger is a protected token, a web-service credential, or server-side data processing—not mapping in the abstract.

## 11. Recommendation

1. Keep the current geolocation flow and rename it accurately as a landmark-based distance estimate.
2. Split destination entry into **Popular places** and **Postal code or place** once a provider is selected.
3. Improve parking-rate truth before automating category-to-rate inference.
4. Pilot OneMap search and routing first for this Singapore-only product.
5. Add Google Places only if its search quality produces a measurable completion-rate improvement.
6. Before enabling any metered API, establish restricted credentials, quotas, shared rate limiting, privacy-safe logging and an operational owner.
