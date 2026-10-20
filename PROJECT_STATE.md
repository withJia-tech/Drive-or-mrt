# Project state — Drive There or MRT?

Canonical state file for this repo (per `AGENTS.md` rule 8). Decisions stay in `docs/DECISIONS.md`.

Updated: 2026-10-19
Repository: `withJia-tech/Drive-or-mrt` (the kickoff note's `Drive-or-mrt-in-sg` 404 is resolved; this is the repo)
Branch / base SHA: `claude/new-session-p75bbc` on `01d5462`
Live: https://withjia-tech.github.io/Drive-or-mrt-in-sg/

## Current user-value goal

When a Singapore car owner is at the door, deciding how to reach one place, they need to see the **return-trip cost** of driving (petrol + parking + ERP), MRT and Grab side by side, so parking stops being the cost nobody checks.

## What exists (verified 2026-10-19)

| Check | Result | How |
|---|---|---|
| Unit tests | 44/44 pass, exit 0 | `node --test`, Node v22.22.0 |
| Page loads on phone width | No JS errors, no horizontal scroll (390px) | Playwright, iPhone 13 profile, local `http.server` |
| One trip, end to end | 15 km, 3 h, public hospital → Drive $16.50, MRT $3.60, Grab $23.50 (est); exactly one "Cheapest" badge | Same run; screenshot kept out of repo |
| Independent arithmetic | 30 km ÷ 12 km/L × $3.00 = $7.50 petrol; 3 h × $3.00 = $9.00 parking; $16.50 − $3.60 = $12.90 | By hand from `data/*.json`, not from app output |
| Blank MRT fare | Uses labelled $1.80 default, not $0 | Code read (`index.html` `read()`) |
| Blank Grab fare | Estimated and marked "(est)" in UI and share text | Code read + run above |

**Not tested:** real iPhone/Safari (only Chromium emulation), offline/failed JSON fetch in a browser, screen reader.

## Where the kickoff note didn't match the code

The OS package's example (`DRIVE_OR_MRT_KICKOFF.md`) was written before the repo was readable. Corrections:

1. **Scope is cost, not time/convenience.** Inputs are typed by the user; there are no live route, traffic or fare feeds. Journey times are rough averages from `data/fare-defaults.json`.
2. **Surface is already decided:** a static phone-browser page on GitHub Pages. The kickoff's "PWA or native iOS?" question is answered by the repo. Native would be a rewrite with no evidence it's needed.
3. **Value of time does not change the winner, by design (H8).** The hourly rate only prices the MRT walk as a soft secondary line. The kickoff's falsification #1 ("change value-of-time, does the recommendation move?") assumes otherwise. The answer today is "no, never", and that is deliberate.
4. **No agent / LLM**, matching both the kickoff and `docs/DECISIONS.md`.

## Open decision for the owner

**Should value of time ever be allowed to change the recommendation?** Today a $100/hr person and a $10/hr person get the same verdict. Keeping H8 is consistent and simple; changing it would make the walking-time line part of the winner and needs a new rule plus tests. Recommendation: keep H8, because the product's promise is cash cost.

## Open tests (next executable)

| Claim | Status | Next move |
|---|---|---|
| Falls back to `defaults.js` and says so when JSON fetch fails | Inferred from code + drift test | Playwright: block `data/*.json` routes, assert colophon notice |
| Flat $5 "too close to call" threshold is right for big trips | Assumed (H7) | Owner call; alternative is `max(5, 0.15 × drive)` |
| Parking rates are realistic | Heuristic (H1) | Phase 2: HDB/URA published rates |

## Note on deploy

Pages publishes the whole repo folder, so `AGENTS.md`, `CLAUDE.md`, this file and `.claude/` will be public once merged to `main`. None contain secrets.

---

## Walkthrough toward native app + widget (started 2026-10-19)

Source plan: *Free Auto Web App — Architecture Plan v0.2* (PDF on branch `claude/phone-location-detection-oqfi85`).

### Step 1 — framing (owner answered)

- **Moment:** a Singapore car owner about to leave for a place they go often needs to know at a glance whether to just take the train or whether driving/Grab is worth it, so they're on time without overpaying for parking.
- **First users:** owner + family (private testing before any public release).
- **"Live" means:** train/bus disruptions, traffic/drive time now, right-now context (time + location).
- **Goal surface:** native mobile app with a home-screen widget.
- **Trip type for widget:** owner asked to prototype and prioritise; flag contradictions.

### Branch health (observed)

`claude/phone-location-detection-oqfi85` head `97d2a0b` deletes `calc.js`, which `index.html` still imports, so merging it would break the live site. Previous commit `608235d`: 76/78 tests pass. Failing: `agent.test.js` "asks for destination type before treating blank parking as free" and "the interpreter exposes no memory, reward or learning output".

### Step 2 — priorities (proposed, awaiting owner)

**Contradictions between the goal and the plan:**

1. *Live data vs "no server".* LTA DataMall (train alerts, expressway travel times, speed bands) needs an `AccountKey` header. A key in app code is readable by anyone, so live data needs a small key-holding proxy. That breaks Decision 9 ("strictly zero-dependency") unless the owner accepts one tiny proxy.
2. *Widget vs "no memory".* A widget can't take typed input, so it needs saved trips. That looks like Decision 3's deferred memory, but it isn't: **saved trips are explicit favourites the user types once, not learned behaviour.** Proposed: allow favourites now, keep learning gated.
3. *Native goal vs PWA plan.* Decision 8's PWA is a bridge for family testing, not the destination. Build the minimum PWA (manifest only, no heavy offline work).
4. *"Traffic now" coverage.* LTA's estimated travel times cover expressway segments only, not door to door. Full drive time needs a routing service (Decision 5).
5. *iOS build needs a Mac.* A widget needs Xcode (Swift/WidgetKit); this Linux sandbox can't compile or sign iOS apps. Widgets refresh roughly every 15–60 min on Apple's budget, not truly live.

**Ranking:**

| When | Item | Why |
|---|---|---|
| Now | Repair branch (restore `calc.js`, fix 2 failing tests) | Nothing else is safe to build on |
| Now | Feasibility-first engine (D2, P1) | Its answer is what the widget will show |
| Now | Saved trips / favourites (new) | Widget can't work without them |
| Next | One proxy for LTA train alerts (D9 reframed — **approved 2026-10-19**) | Cheapest live signal; directly flips "take the train" |
| Next | Native shell + widget prototype via TestFlight to family | The goal surface; blocked on Mac + Apple account |
| Later | Open-data parking (D7), expressway traffic, routing (D5), map pin (D6) | Matter only when the feasibility gate says time is scarce |
| Skip | Learned memory/agent (D1, D3 Cohort B/C), analytics (D11) | Family feedback beats metrics at this size |

**Level 3 challenge:** the widget could work perfectly and still be useless if family already know the answer for regular trips and only hesitate on new ones (which a widget can't serve). Cheapest test: a 1–2 week trip diary — each time someone hesitates, note: regular or new trip, and what tipped the decision.

### Step 3 — surface (owner answered 2026-10-19)

- Family phones: **mix of iPhone and Android**. Owner has a **Mac, no Apple Developer account**.
- Bridge: **web app on home screen first** for family testing.
- Proposed route: keep the logic in the existing JS (`calc.js` + feasibility engine), wrap it later with **Capacitor** (reuses today's web code on both platforms), and write the two widgets natively (Swift/WidgetKit on iOS, Kotlin on Android). Each widget shows the last computed answer for saved trips.
- Rejected for now: React Native / Expo (rewrites the UI), Flutter (rewrites everything). Both still need native code for widgets.
- Cost when native starts: Apple Developer US$99/yr for TestFlight to family (free signing works only on the owner's own iPhone, re-sign every 7 days). Android: install the app file directly for family, $0; Play Console US$25 one-off only if wanted.

### Step 5 — engineering (in progress)

- **Branch repaired** (`90f321c`): location work merged in, `calc.js` restored from `608235d`, two stale agent tests updated. Phone-width run: Toa Payoh → SGH, 3 h → 8.9 km, MRT saves $9.85 (hand-checked).
- **Feasibility-first rule** in `recommendForSchedule`, with `test/schedule.test.js`. Owner chose "train if on time". Not yet shown in the UI.
- Tests: `node --test` → 87/87 pass.
- **Journey times (2026-10-20):** own train time + Grab worst-case wait built and tested (`scheduleDurations`, `gambles`). Station table blocked on a data source; OneMap routing via the proxy proposed.
- Tests: 94/94 pass.
- **Next:** add an "arrive by" time to the page and show "Take the MRT, leave by HH:MM"; then saved trips with the family's own train time.

## Metrics for the family test (defined 2026-10-19, no data yet)

No analytics in the app (Decision 11), so every number comes from the trip diary. Targets are proposals to confirm after week 1, not benchmarks.

**North Star:** trips per week where someone used the app, followed its answer, and had no regret afterwards (on time, no parking surprise). The plan's own line: useful decisions with minimal effort, not screen time.

| Metric | Question it answers | Source | Proposed target |
|---|---|---|---|
| Decision time | Is it faster than thinking it through? | Diary: rough seconds from open to answer | Under 30 s |
| Follow rate | Do people trust the answer? | Diary: followed yes/no | Over 70% |
| Regret rate | Was the answer right? | Diary: "would choose differently now?" | Under 10% |
| Train-on-time hit rate | Does the new arrive-by rule hold? | Diary: when the app said train, on time? | Over 90% |
| Regular-trip share | Is a widget worth it? | Diary: regular or new trip | Over 50% means build the widget |
| Second-week use | Does anyone come back? | Diary: used in both weeks, per person | Every person |

**Diagnostics:** distance off by how many km (app vs actual); parking estimate vs what was actually paid; which reason made someone ignore the answer (rain, luggage, kids, late).

**Decisions these drive:** regret over 10% means fix the estimates before native work. Regular-trip share under 50% means drop the widget and keep the app. Train-on-time hit rate under 90% means the MRT speed assumption (H4, 25 km/h) is too optimistic.

### OneMap + small server (2026-10-20)

- **Built:** `proxy/` (OneMap `/api/route`, LTA `/api/alerts`), `transit.js` client (4 s timeout, silent fallback), precedence yours > OneMap > estimate, MRT card label, privacy line.
- **Switched off until deployed:** `PROXY_URL = ''` in `transit.js`, so no network calls and no location leaves the phone yet.
- **Tests:** `node --test` → 115/115. Phone-width Playwright with the server mocked: shipped (no calls, "Time estimated", privacy line hidden); up (~70 min "OneMap time"); down and slow (stays "Time estimated", no errors, no page jump).
- **Owner tasks:** OneMap developer registration; LTA DataMall key; enter `ONEMAP_EMAIL`, `ONEMAP_PASSWORD`, `LTA_ACCOUNT_KEY` in Vercel; approve the first deploy.
- **Next after deploy:** record a real OneMap response and replace the assumed fixture; check Toa Payoh → SGH against OneMap's own site by hand.

### Learning from choices, show-only (2026-10-20)

- **Built:** "Which did you take?" one-tap log; pattern line under the verdict; Save as Home / Work (also selectable as destinations); "Copy my trip log" export with no coordinates.
- **Tests:** 135/135, and the time-sensitive ones also pass with `TZ` = UTC, New York, Tokyo.
- **Phone-width run** (Playwright, weekday 08:30, home → work, cheaper MRT, she taps Drive):
  - Trips 1–3: no pattern.
  - Trip 4: "Weekday mornings, home → work: you drove 3 of the last 3 times." The verdict stays MRT.
  - Evening work → home: no pattern; the morning habit doesn't leak.
  - Export: 3 trips, all overrides, no coordinates.
  - Storage blocked: "Couldn't save on this phone", no errors.
- **Metrics impact:** the in-app log now supplies follow rate (`overrode`), regular-trip share (direction ≠ other) and second-week use. The paper diary is only needed for regret and decision time.
- **Next:** the regret question and decision-time capture; then spec the in-app experiment after about 4 weeks of logs.

### Audience: personal utility first, family later (owner, 2026-10-20)

- **First user is the owner.** The family test becomes a later phase. Saved places, the trip log and patterns are per phone already, so adding family later needs no data changes, only setup on their phones.
- **Vercel deploy blocked (2026-10-20):** the Vercel connector can read the team (`withjia-tech's projects`, which has one project, `signalvsnoise`), but creating a project returns 403 forbidden, both by direct upload and by GitHub link. There's no Vercel CLI in the sandbox. The owner creates the project in the dashboard (steps in chat), or reconnects the connector with project-create rights.
- `proxy/` exists only on `claude/new-session-p75bbc`, not on `main`. A Vercel import with root directory `proxy` needs that branch, or a merge to `main` first.

### Hosting moved to Vercel (2026-10-20)

- The Vercel project `driveormrt` was imported from the repo root (not `proxy/`) and deployed `main` @ `01d5462`, the old app. Its status is Ready at https://driveormrt.vercel.app.
- So Vercel now hosts **both** the app and the server: top-level `api/route.js` and `api/alerts.js` wrap `proxy/handler.js`, and `proxy/api/` was removed. `https://driveormrt.vercel.app` is added to the allowed origins.
- Local smoke test of the entry files: `/api/alerts` and `/api/route` return 503 "not configured" without keys; a foreign origin gets 403.
- GitHub Pages was never enabled (configure-pages fails with "Resource not accessible by integration"). It isn't needed now; the workflow will keep failing until Pages is enabled or the workflow is removed.
- Still open: PR #2 merge; OneMap and LTA keys in Vercel; `PROXY_URL` stays empty until the keys exist.
