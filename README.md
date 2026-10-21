# Personal Utility Agent SG — Drive, MRT or Grab?

A mobile-first personal utility agent for Singapore travellers deciding how to
make one trip: drive, take public transport, or use Grab/taxi. The agent accepts
a natural-language trip description, asks at most one useful clarification,
then explains a recommendation produced by the deterministic comparison layer.

The point of the thing is parking. Three hours at a public hospital costs more
in parking than the entire petrol bill for the round trip, and almost nobody
checks before leaving.

**Live:** https://withjia-tech.github.io/Drive-or-mrt-in-sg/

Calculator 04b of the *Is It Worth It?* suite.

## Bounded personal agent, deliberately

The agent layer in `agent.js` is intentionally small. It interprets destination,
distance, parking duration, arrival-time wording and trip context, applies the
fields it can support, and asks one clarification when a required input is
missing. It never calculates transport facts: `calc.js` remains authoritative.

There is no ride-booking or purchasing tool, no external communication, no
hidden reward function and no opaque reinforcement learning. A request such as
“book me a Grab” is converted into comparison-only help and is covered by a
boundary test. The current agent is deterministic and stores no history.

On the landing journey, parking and alternative-fare configuration stay hidden.
Choosing a destination infers those assumptions; only the trip-specific parking
duration is requested inline. Results disclose the values and provide **Edit
assumptions** for correction. An inference failure reveals the relevant manual
control instead of blocking the comparison.

This is still a prototype. Better source data—especially real HDB and URA
parking tariffs—remains more valuable than making the agent sound cleverer.

## Use my location

The one figure the user has to know is the one-way distance. On a phone, the
device already knows where it is, so **Use my location** reads the GPS position
(the standard Web Geolocation API — iOS Safari and Android Chrome both support
it), pairs it with a built-in Singapore landmark, and fills the distance in.

Still no external service. The distance is the straight-line (great-circle)
gap scaled by a flat winding factor — pure arithmetic in `geo.js`, tested like
`calc.js` — not a routed drive, so it is labelled an estimate everywhere it
appears and stays editable. Because the Grab fare is derived from distance
(H2), locating yourself updates the taxi estimate too; the MRT fare is never
guessed from distance — you enter it from the transit app. The upgrade path
(H9) is a routing service or an on-map pin, which changes only where the two
coordinates come from, not the maths. Geolocation needs a secure context, so
it works on the live HTTPS site and on `localhost`, and degrades to plain
typing if permission is denied or unavailable.

## Running it

ES modules will not load over `file://` — Chromium blocks the import as a CORS
violation and the page renders inert. Serve the directory:

```bash
python3 -m http.server 8099
# http://127.0.0.1:8099/
```

## Testing

Three levels. The first runs everywhere with no install; the browser suite needs Playwright. Both run automatically on every pull request (see Deploying), and a `git push` from Claude Code runs the unit tests first.

### 1. Unit and integration tests (no install)

```bash
node --test          # 218 tests, Node 22, no dependencies
```

| File | What it proves |
|---|---|
| `test/qa-unit.test.js` | The arithmetic against hand-worked numbers (QA-U-xx), that no mode is favoured (every ordering of costs), and inputs → result → wording end to end (QA-I-xx), including all three outcomes, close calls and "recommended ≠ cheapest". |
| `test/qa-verdict-validation.test.js` | The "Why this call" wording follows the real winner and the real cost driver; every input field has a checked range. |
| `test/calc.test.js` | Rules D1–D10, the layer where a wrong answer is a defect, not a disagreement. |
| `test/schedule.test.js`, `punctuality.test.js`, `insights.test.js`, `car.test.js` | Arrive-by rule, learned slip, value-of-time bounds, car ownership costs. |
| `test/proxy.test.js`, `search.test.js`, `transit.test.js` | The small server and the app's calls to it, with the network mocked. |
| `test/data-drift.test.js` | The assumption files match their built-in copy. |

### 2. Browser tests (needs Playwright)

```bash
npm i --no-save playwright && npx playwright install chromium   # once
node e2e/run.cjs              # every case; prints PASS / FAIL / BLOCKED per case ID
node e2e/run.cjs QA-D         # only the defect regressions
```

The harness starts its own local server, mocks the OneMap/LTA server (no case touches the network), runs each case in a fresh iPhone-sized browser with the Singapore time zone, and writes a screenshot per case plus `results.json` to `e2e/out/` (git-ignored). Cases live in `e2e/cases/`: `defects.cjs` (QA-D: one regression per confirmed defect) and `regression.cjs` (QA-E: journeys, the three outcomes, boundaries, invalid input, repeated edits, server failures, clipboard, five screen sizes, labelling, blocked storage, accessible names).

Not in CI yet: CI has no browser. Run it locally before merging changes to `index.html`.

### 3. On a real iPhone (manual, before a pilot)

The browser suite imitates an iPhone; it is not one. Before inviting testers, on an iPhone in Safari (not inside another app):

1. Open the site; tap **Use my current location** → allow → it says "Found you…".
2. Type a destination (e.g. "raffles place") → OneMap suggestions with addresses appear.
3. Enter parking hours → **Compare** → three prices, one "Cheapest".
4. Change the petrol price in "Your car" → the result updates without pressing Compare.
5. **Clip for the group chat** → paste into WhatsApp → numbers match the screen.
6. Turn on Airplane mode → type "vivo" → VivoCity still appears; nothing breaks.

There are deliberately no tests on the heuristics themselves (typical parking rates, speeds). You cannot unit-test a guess; they are labelled in the UI instead. The QA report is `docs/QA_REPORT.md`.

## Layout

```
.
├── index.html          # the calculator: markup, styles, wiring
├── agent.js            # bounded intent, clarification and agent boundaries
├── calc.js             # D1-D10, pure functions, no DOM
├── geo.js              # H9 — great-circle + winding-factor maths, no DOM
├── defaults.js         # fallback mirror + assumption loader
├── data/
│   ├── parking-defaults.json   # H1 — destination type to hourly rate
│   ├── fare-defaults.json      # H2-H7 — every other assumed constant
│   └── landmarks.json          # H9 — landmark coordinates + winding factor
├── shared/tokens.css   # design tokens, values only
├── docs/DECISIONS.md   # answers to the architect's open questions
├── test/
└── .github/workflows/deploy.yml
```

`shared/` keeps its name on purpose: when the rest of the suite is built, the
tokens file is what moves out first, and the path is already right.

## Where the judgment sits

Every assumed constant lives in `data/*.json`, never inline in the calculator.
That was the decision the handoff asked to close, and the reasoning is in
`docs/DECISIONS.md`. In short: a PM can change the petrol price in GitHub's
web editor and the change is a reviewable diff, which is what "auditable" has
to mean to be worth anything.

`calc.js` knows arithmetic. It does not know any of the guesses — they arrive
as arguments. That separation is what makes the deterministic layer testable
and the heuristic layer swappable. `agent.js` knows how to structure a request,
not how to rewrite a fare or select a secret weight. The design can therefore
change without moving the authoritative calculations into conversational code.

The highest-leverage improvement available is H1. Parking rates are a
heuristic only because the data is not loaded; HDB and URA publish them. That
is a CSV, not an API, and it costs nothing. It converts the single number the
product exists to surface from a guess into a fact.

## Deploying

Vercel (project `driveormrt`) deploys `main` automatically; there is no build
step. Every pull request runs two checks in `.github/workflows/ci.yml`:
`unit` (`node --test`) and `browser` (`node e2e/run.cjs` on Chromium at iPhone
13 size). A ruleset on `main` requires both to pass before a PR can merge, so
only tested code goes live. The browser run's results and screenshots are
attached to each run as the `e2e-results` artifact.

## Status

Prototype, P1. Accuracy is bounded: no live ERP, no live fares, no real
carpark rates, no traffic model. Every one of those is stated in the
assumptions panel and in the share string, which carries the assumptions
version so a result read months later flags its own age.
