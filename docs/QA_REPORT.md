# QA report: Drive or MRT, testing and remediation

**Date:** 2026-10-20 · **Code tested:** `main` @ `62fb578` (live) for reproduction; branch `claude/new-session-p75bbc` (main + PR #4 + these fixes) for remediation.
**Results recorded on:** commit `2ab2049`, rebased onto `main` @ `75e06ba` (re-run after rebase: browser 32 PASS / 0 FAIL / 3 BLOCKED; unit 218/218).
**Environment:** Node v22.22.0; Playwright 1.56.1 with Chromium, iPhone 13 profile unless stated, `Asia/Singapore` time zone; the OneMap/LTA server is always mocked.
**Spec:** the attached `Drive_or_MRT_QA_Test_and_Remediation_Brief.md` did **not** arrive with the request: only the architecture-plan PDF, the product-build-os zip and screenshots were in the upload folder. Test cases here are derived from the written requirements in the request. They will be mapped to the brief's cases once it is re-attached.

## Summary

- **Seven defects confirmed, all fixed**, each with a regression test that failed first and passes now. None of them was in the arithmetic. The reported "$5 instead of $7" was a **stale result**: the engine computed $7.00 correctly, but the page kept showing an earlier result after the inputs changed.
- **Unit and integration:** 218/218 pass (`node --test`).
- **Browser:** 32/32 runnable cases pass; 3 are blocked (no real iPhone, no live OneMap, no screen reader).
- **Every P0 case that can run here passes.** One P0 case, QA-B-01 (real iPhone Safari), is blocked and needs the owner's manual check.
- **Readiness:** ready for a **limited pilot (owner + a few invited testers)** once PR #4 is merged and the 6-step iPhone checklist in the README passes. Not ready for a public launch (see risks).

## 1. Architecture inventory

| Concern | Where | Notes |
|---|---|---|
| Calculation engine | `calc.js` | Pure functions, no DOM: D1–D10 cost rules, `computeAll`, schedule rule (`recommendForSchedule`), car ownership maths, and the new `checkField` / `FIELD_RULES`. |
| Explanation wording | `verdict.js` (new) | Pure function of the result. Moved out of `index.html` so it can be unit-tested. No AI anywhere. |
| Assumptions | `data/fare-defaults.json`, `data/parking-defaults.json`, `data/landmarks.json`, mirrored in `defaults.js` | Drift-tested; versioned `2026.08`. |
| Learning / habits | `habits.js`, `tripLog.js` | Counted from taps; on the phone only; show-only. |
| State and UI | `index.html` (module script) | Module-level `state`, `geoState`, `destState`, `transit`, `currentTrip`. `sync()` gates the Compare button; `calculate()` renders. |
| Input validation | `read()` in `index.html` → `checkField()` in `calc.js` | Before QA: `toNumber()` silently turned negatives into 0 and clamped values over the maximum. Now bad values are refused with a message (D5/D6); `toNumber` stays as an internal safety net. |
| Recommendation logic | `selectWinner` (lowest cash; ties MRT → Drive → Grab), `verdictBand` (drive vs MRT, flat $5 close-call band), `recommendForSchedule` (arrive-by: train if on time) | "Cheapest" and "recommended" can differ when an arrive-by time is set; tested in QA-I-05 and QA-E-06. |
| External dependencies | `proxy/` (Vercel functions `api/route`, `api/search`, `api/alerts`) → OneMap and LTA; Google Fonts | Each call has a 4 s timeout and falls back silently; covered by QA-E-11/12. |
| Existing tests | `test/*.test.js` | 188 before QA, 218 after; plus the new browser suite in `e2e/`. |

## 2. Confirmed defects: root cause, fix, regression

| ID | Sev. | Defect | Root cause | Fix | Regression tests (fail → pass) |
|---|---|---|---|---|---|
| **D1** | P0 | 10 km, $3.50/L, 10 km/L showed petrol **$5.00**, not $7.00 | Not arithmetic: edited *before* Compare the engine gives $7.00 (QA-D1a). Edited *after* a result, typing only ran `sync()` (button labels). The old result stayed on screen, unchanged and unmarked. $5.00 is exactly the defaults: 20 km ÷ 12 km/L × $3.00. | Live update: with a result showing, any input change recalculates it (150 ms debounce). If the change leaves something missing or invalid, the result is dimmed and marked "out of date". | QA-D1b, QA-D1c (browser); QA-U-01/02 (unit). Evidence: [before](qa-evidence/D1-before-stale-5.png) → [after](qa-evidence/D1-after-live-7.png) |
| **D2** | P1 | A typed distance with no destination could never be completed: the button said "Choose your destination" and parking hours were hidden | `sync()` required a picked place even when the distance was typed, so the parking box was only revealed by picking one | A typed distance reveals parking hours and the parking-type card. The rate is asked for, never assumed to be $0. | QA-D2. [after](qa-evidence/D2-after-manual-path.png) |
| **D3** | P0 | Grab cheapest: headline "Grab takes it" but the explanation said "…Drive. Grab actually beats both…" | The wording only knew the drive-vs-MRT band. Grab was handled by appending a sentence to whichever band applied. | `verdict.js` leads with the actual cheapest mode: "Grab is cheapest at $10.00 return — $1.00 less than driving and $10.00 less than the MRT." | QA-D3, QA-E-04; unit tests in `qa-verdict-validation`. [before](qa-evidence/D3-before.png) → [after](qa-evidence/D3-after.png) |
| **D4** | P1 | "Parking … is the killer — $0.60 for just 1 hours" when petrol was $20 (97% of the cost) | Fixed sentence per band, blind to which cost actually dominates; no singular/plural handling | Names the largest part of the driving cost (parking, petrol, ERP or car costs); "1 hour" / "3 hours". The drive-wins wording no longer claims "petrol is most of it" when parking is larger. | QA-D4; unit tests. [before](qa-evidence/D4-before.png) → [after](qa-evidence/D4-after.png) |
| **D5** | P0 | 0 km/L priced petrol at **$0.00** and made driving "cheapest"; $0/L was accepted too | `toNumber` accepts any value ≥ 0; `petrolCost` guards ÷0 by returning 0 | `FIELD_RULES`: petrol $0.50–$10/L, fuel 1–50 km/L. Out of range → Compare disabled, button says what to fix, field outlined. | QA-D5, QA-E-08; unit tests. [before](qa-evidence/D5-before-free-petrol.png) → [after](qa-evidence/D5-after-refused.png) |
| **D6** | P1 | Distance −5 became 0 km; 500 km became 300 km, silently | `toNumber` coerced negatives to the fallback and clamped to the limit without telling anyone | Same rules: refuse with a message (distance > 0 to 300 km, parking 0–72 h, rates ≥ 0, …) | QA-D6, QA-E-07 (boundaries accepted), QA-E-08 (just outside refused) |
| **D7** | P2 | Share text "Drive: $12.33 (petrol $5.00 + parking $6.00)": parts didn't add up once car costs were set up | `shareString` listed petrol, parking and ERP only | Lists "car costs $X" when included | QA-I-07 |

**Before fixes** (browser, recorded in [`results-before-fixes.json`](qa-evidence/results-before-fixes.json)): QA-D1a PASS (positive control); QA-D1b, D1c, D2, D3, D4, D5 and D6 all **FAIL**. QA-I-07 failed in the unit suite before the D7 fix.
**After fixes** ([`results-after-fixes.json`](qa-evidence/results-after-fixes.json)): all PASS.

One failure along the way was **my test, not the app**: QA-E-06 expected "leave by 13:45". The correct value is 14:00 − 14.8 min − 10 min buffer = **13:35**, which the app showed. The test was corrected and the app left unchanged.

## 3. Test execution report

### Unit and integration (`node --test`): 218 / 218 PASS, ~0.9 s

| ID | Level | Case | Expected (worked by hand) | Status |
|---|---|---|---|---|
| QA-U-01 | Unit | Reported case | 20/10 × 3.50 = $7.00 | PASS |
| QA-U-02 | Unit | Defaults | 20/12 × 3.00 = $5.00 | PASS |
| QA-U-03 | Unit | Parking | 2.5 h × $3 = $7.50; 0 h = $0 | PASS |
| QA-U-04 | Unit | Drive total with ERP | 5.00 + 7.50 + 2.40 = $14.90 | PASS |
| QA-U-05 | Unit | MRT return | 2 × 1.80 = $3.60 | PASS |
| QA-U-06 | Unit | Grab estimate and typed fare | 3.50 + 0.55×10 = $9 → $18; typed $12 → $24 | PASS |
| QA-U-07 | Unit | Walk value kept apart from MRT fare | $8.33; MRT headline stays $3.60 | PASS |
| QA-U-08 | Unit | Rounding | 0.1+0.2 → 0.30; 1.005 → 1.01 | PASS |
| QA-U-09 | Unit | Close-call boundary | $5.00 apart = close call; $5.01 = not | PASS |
| QA-U-10 | Unit | Journey times (return) | 34 / 68 / 36 min | PASS |
| QA-U-11 | Unit | No mode favoured | all 6 orderings pick the lowest; ties MRT → Drive (documented) | PASS |
| QA-I-01 | Integration | MRT cheapest | drive $14.00, MRT $3.60, Grab $18.00; "MRT saves you $10.40" | PASS |
| QA-I-02 | Integration | Drive cheapest | drive $1.60, MRT $10.00; "Driving is cheaper by $8.40" | PASS |
| QA-I-03 | Integration | Grab cheapest | Grab $10 < drive $11 < MRT $20; wording leads with Grab | PASS |
| QA-I-04 | Integration | Close call | MRT cheapest by $2; "comfort call" | PASS |
| QA-I-05 | Integration | Recommended ≠ cheapest | Drive cheapest, arrive-by plan = MRT (train on time) | PASS |
| QA-I-06 | Integration | All-in lens can flip the winner | cash: Drive; all-in: MRT | PASS |
| QA-I-07 | Integration | Share text parts add up (D7) | parts = total | PASS (FAIL before fix) |
| (rest) | Unit | Existing suites (D1–D10, schedule, habits, insights, car, server, search, drift) and D3–D6 wording/validation | — | PASS |

### Browser (`node e2e/run.cjs`): 32 PASS, 0 FAIL, 3 BLOCKED

| ID | Pri. | Case | Status | Evidence / note |
|---|---|---|---|---|
| QA-D1a | P0 | Edits before Compare applied → $7.00 | PASS | positive control, passed before and after |
| QA-D1b | P0 | Edits after a result update it (no stale $5.00) | PASS | FAIL before fix |
| QA-D1c | P0 | Clearing a required input marks the result out of date | PASS | FAIL before fix |
| QA-D2 | P1 | Typed distance can be completed; parking not assumed free | PASS | FAIL before fix |
| QA-D3 | P0 | Grab cheapest: headline and wording agree | PASS | FAIL before fix |
| QA-D4 | P1 | Real cost driver named; "1 hour" | PASS | FAIL before fix |
| QA-D5 | P0 | 0 km/L and $0/L refused | PASS | FAIL before fix |
| QA-D6 | P1 | −5 km and 500 km refused with a message | PASS | FAIL before fix |
| QA-E-01 | P0 | GPS → TTSH: 2.5 km labelled estimate; MRT cheapest; parts add up | PASS | 1.83 km × 1.35 |
| QA-E-02 | P0 | Drive cheapest outcome | PASS | Drive $1.60 vs MRT $10.00 |
| QA-E-03 | P0 | MRT cheapest outcome | PASS | "MRT saves you $10.40" |
| QA-E-04 | P0 | Grab cheapest outcome | PASS | Grab $10.00 |
| QA-E-05 | P0 | Close call: badge on lowest cash, comfort-call wording | PASS | |
| QA-E-06 | P0 | Arrive-by: MRT recommended while Drive is cheapest | PASS | leave by 13:35 |
| QA-E-07 | P0 | Boundary values accepted (0.1/300 km, 0/72 h, $0.50/$10, 1/50 km/L) | PASS | 300 km → petrol $150 |
| QA-E-08 | P0 | Just outside boundaries refused, with messages | PASS | |
| QA-E-09 | P1 | Letters in a number box ignored | PASS | |
| QA-E-10 | P0 | 6 live edits = fresh calculation | PASS | identical costs |
| QA-E-11 | P0 | Search server 503 / offline / 6 s slow: on-phone places still found | PASS | |
| QA-E-12 | P1 | Route timing: down → "Time estimated"; up → "OneMap time" 70 min | PASS | mocked server |
| QA-E-13 | P0 | Share text copied: totals match cards, "(est)", version stamp | PASS | clipboard read back |
| QA-E-14 | P1 | Clipboard refused: says so, offers text | PASS | |
| QA-E-15a–e | P0 | 320×568, 375×667, 412×915, 768×1024, 1280×800: no sideways scroll; button on screen; 3 cards | PASS ×5 | [320 px](qa-evidence/E15a-320px.png) |
| QA-E-16 | P0 | Estimates and assumptions labelled (distance, Grab, MRT time, walk value, assumptions list, disclaimer) | PASS | |
| QA-E-17 | P1 | Value-of-time figures carry the "rough" caveat | PASS | |
| QA-E-18 | P1 | Location refused: fix explained; typed start offered | PASS | |
| QA-E-19 | P1 | Storage blocked: compare works; "Couldn't save" said | PASS | |
| QA-E-20 | P2 | Every input/button has an accessible name | PASS | names only |
| QA-B-01 | P0 | Real iPhone Safari | **BLOCKED** | No device in the sandbox. Owner runs README → Testing → 3. |
| QA-B-02 | P1 | Live OneMap search and timing | **BLOCKED** | Sandbox network refuses onemap.gov.sg; OneMap login not yet in Vercel |
| QA-B-03 | P2 | Screen reader (VoiceOver) | **BLOCKED** | Needs a device |

**NOT RUN:**
- **WebKit and Firefox engines:** only Chromium is installed here. iPhone Safari is WebKit, which is why QA-B-01 matters.
- **Performance on a low-end phone.**
- **Load on the Vercel server.**

## 4. Uncertainty and communication (requirement 6)

| What could mislead | How it is labelled | Checked by |
|---|---|---|
| GPS distance | "~2.5 km … by road (straight-line ×1.35, estimate). Edit the field if you know better." | QA-E-01, E-16 |
| Grab fare | Card says "Estimated"; share text "(est)" | QA-E-13, E-16 |
| MRT time | "Time estimated" or "OneMap time"; plan line names the source | QA-E-12, E-16 |
| Time valuation | Walk value is a separate soft line ("If you price the walk"); $/hr insights say they're rough while times are estimates | QA-U-07, E-16, E-17 |
| Model assumptions | "What we assumed" panel lists each heuristic with its ID; "Estimates only" disclaimer | QA-E-16 |
| Car ownership | All-in lens: "includes costs you pay whether or not you drive today" | car tests, step-3 runs |
| Stale numbers | "These figures are out of date" when inputs change and can't be recalculated | QA-D1c |

## 5. Remaining risks and open issues

| Pri. | Issue | Risk | Recommendation |
|---|---|---|---|
| P0 | Real iPhone never tested (QA-B-01) | Safari-only layout, location prompt or keyboard issues | Owner runs the 6-step checklist before inviting testers |
| P1 | Live OneMap untested (QA-B-02); response shapes are assumed from secondary sources | Search may return nothing or mis-parse | First phone test after merge; record a real response and replace the fixtures |
| P1 | Browser suite not in CI | A UI regression could merge unseen | Add a CI job with `npx playwright install chromium` |
| P1 | Heuristics: parking rates (H1), MRT 25 km/h, Grab formula, assumptions dated 2026.08; COE hint taken from a summary of LTA's sheet | Plausible but unverified figures | Label stays; refresh the data; check COE against the LTA PDF |
| P2 | Result flag says "Agent recommendation", but the engine is deterministic with no agent | Over-claims what the product does | Owner to choose the wording (e.g. "Recommendation") |
| P2 | The callout is always titled "The swing variable", even when parking is 19% of the cost | Mild overstatement (the numbers themselves are right) | Title by share, or by the actual largest cost |
| P2 | Cards show return times; the arrive-by plan uses one-way times | Possible confusion | Label cards "return" |
| P2 | "Your car this year" per-trip figure is very large with few logged drives | Can look alarming early on | It already says only logged trips count; consider showing it only after ~5 drives |
| P2 | Ties resolve to MRT, then Drive | Deliberate default, not bias in the maths | Documented (QA-U-11) |
| P2 | Fuel range 1–50 km/L excludes EVs | EV drivers can't price their trip | Separate EV mode later |
| P2 | GitHub Pages workflow fails on every merge (Pages never enabled) | Red ✗ noise; real failures easier to miss | Remove the workflow (Vercel hosts the app) |

## 6. Readiness for a limited user pilot

**Ready, with conditions.** The cost engine matches hand-worked figures on every case tested. No outcome is hard-coded, and the three cheapest-mode outcomes, close calls and "recommended vs cheapest" all behave and read correctly. Invalid input is refused rather than priced, results can no longer go stale, and every estimate is labelled.

**Conditions before inviting anyone:**
1. Merge PR #4 (these fixes are on its branch).
2. Run the iPhone checklist in README → Testing → 3 (QA-B-01).
3. Keep the pilot small and supervised, because OneMap timing and search are unverified live (QA-B-02). Without them the app still works on its labelled estimates.

**Not ready for public launch** until the P1 items in section 5 are closed.

## 7. Re-running

See README → Testing. `node --test` for units; `node e2e/run.cjs` for the browser suite (screenshots and `results.json` go to `e2e/out/`).
