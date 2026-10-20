# Project decision contract

Status: `DRAFT / AGREED / REVISE`   |   Owner: `[product decision-maker]`   |   Last reviewed: `[date]`

## The important user decision

**When** `[specific situation / trigger]`, **[user]** needs to `[decision or action]` so they can `[observable outcome]`.

Why it matters now: `[pain / frequency / consequence and supporting observation]`.

## Bounded first release

- **Primary user and moment:** `[who, where, when, device]`
- **Input contract:** `[required inputs, provenance/source authority, units, freshness]`
- **Output/decision:** `[what user sees/does, with uncertainty and alternatives]`
- **Target surface:** `[responsive web / PWA / iOS / Android — decide from constraints]`
- **Success measure:** `[observable behaviour, baseline, acceptable threshold]`
- **Unacceptable result:** `[what must never be fabricated or silently assumed]`
- **Hard constraints:** `[privacy, pricing, API/data terms, time, budget, availability]`
- **Explicitly NOT building:** `[non-goals]`
- **Owner of trade-off:** `[who approves important product decisions]`

## Acceptance tests (behaviour, not implementation)

1. Given `[conditions]`, when `[action]`, then `[observable outcome]`.
2. Given `[missing/stale/corrupt input]`, when `[action]`, then `[explicit uncertainty / safe fallback]`.
3. Given `[changing one key preference]`, when `[action]`, then `[consistent explainable change]`.

## Baseline and competing approaches

Existing code/tool/service to reuse: `[paths, APIs, libraries, documented licences]`.
Alternative that requires **no** new code: `[manual workflow / existing product]`.

Why a custom implementation is justified: `[verified gap, not preference]`.

## Required challenge before architecture freeze

- **Level 1:** How will I verify it runs on the intended device?
- **Level 2:** Why this stack/provider and not the simplest existing option?
- **Level 3:** What could pass while the user still gets the wrong result? What independent evidence could reveal it?

One decision needed from the user now: `[single highest-leverage unresolved choice]`.
