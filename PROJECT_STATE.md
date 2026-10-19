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
