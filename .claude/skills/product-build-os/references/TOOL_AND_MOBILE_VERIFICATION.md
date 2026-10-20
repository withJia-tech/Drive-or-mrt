# Tool contract and mobile verification

## Tool handshake (run before promising)

At session start record which of the following can actually be accessed: repository and write/branch permission; shell; dependency manager; test runner; browser/web research; local application server; browser interaction; screenshot capture; iOS Simulator/macOS or remote simulator; Android emulator; physical test device; CI; API credentials. A connector's read access is not proof of write access. Never assume access to a user's personal computer from a text chat.

## Autonomy boundaries

| Agent may do within granted scope | Requires owner approval or explicit permission |
|---|---|
| Read code/docs, inspect package tree and tests; use public documentation | Transfer confidential data to outside services |
| Run safe tests/builds in development and inspect UI | Spend money, provision chargeable infrastructure, install unexpected heavy dependencies |
| Prototype in an isolated branch; make a rollback plan | Merge/publish/release, mutate production or delete important data |
| Capture synthetic screenshots, profiler traces and logs | Share confidential screenshots, access credentials or invite third parties |
| Record technical findings and question a claim | Make irreversible business/product policy decisions |

## Existing tools before custom code

1. Reuse project-defined commands and launch recipe (`package.json`, `Makefile`, scripts, docs).
2. Prefer installed test frameworks; use Claude Code `/run`, `/verify`, `/run-skill-generator` when supported instead of rebuilding a launch/test harness.
3. For web/mobile web, use browser/Playwright device emulation, accessibility assertions, network simulation and real screenshots. Emulation checks viewport/browser behaviour, not native iOS/Android integration.
4. For React Native/Expo or another native stack, use installed iOS Simulator/Android emulator or remote development tools and actual-device smoke tests. iOS Simulator requires suitable macOS/Xcode or a supported remote service; a Linux shell alone cannot claim local iOS Simulator testing.
5. Use cloud browser or computer interaction only with actual access and explicit trust permissions; no invented clicking, screenshots or logs.

## Mobile-first acceptance matrix

- Journey: cold launch → origin/destination → time → compare modes → select → revise choice (screenshots).
- Small screens: viewport fit, typography, touch areas, accessible contrast, keyboard overlay, safe-area support and VoiceOver/TalkBack when available.
- Data: complete, missing, stale, contradictory and rate-limited travel data; source attribution and last-updated timestamp visible.
- Behaviour: offline/slow network, no geolocation permission, multiple route candidates, unreachable route, impossible mode, invalid inputs, clock boundaries.
- Trust: no invented route/fare; recommendation transparent, deterministic and reproducible with fixed inputs and versioned assumptions.
- Costs/security: no client-side secrets, least privilege, API quotas/budget limits, user-location privacy and data retention.
- Release: automated tests + UI inspection + actual platform smoke test; label untested surfaces honestly.

## Per-run evidence note

Record: goal; repo/commit/branch; tool; command and exit; environment; observed outcome; screenshot/trace/log path; comparison baseline; false-positive/false-negative cases; remaining uncertainty. Save it in the project's existing test record or the supplied evidence template.
