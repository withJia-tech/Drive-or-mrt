# Product-Building OS

Follow `AGENTS.md` for the standing project contract. When doing discovery, prioritisation, architecture, implementation or a product test, invoke `/product-build-os` or read `.claude/skills/product-build-os/SKILL.md`.

Use the project's existing runnable scripts and Claude Code's `/run`, `/verify` and `/run-skill-generator` where supported. Record a verified launch recipe once; never reinvent an app runner each session. Existing project instructions take precedence when they add stricter privacy, security or domain constraints.

## This repo: verified launch and test recipe

- Test: `node --test` (Node 22, no install). 135 tests: rules D1–D10, schedule, habits, server, data drift. Time-sensitive tests must pass under any `TZ` (they use Singapore time).
- Launch: `python3 -m http.server 8099` then open `http://127.0.0.1:8099/`. ES modules do not load over `file://`.
- Phone check: Playwright is installed globally in the cloud sandbox; use device `iPhone 13`. Real flow: grant geolocation, click `#geoBtn`, pick `#geoLandmark`, fill `#parkHours` (and `#parkRate` if shown), then the button "Compare my options". Use `page.clock.setFixedTime` for time-of-day behaviour.
- Deploy: push to `main` runs tests, then uploads the **whole repo folder** to GitHub Pages. Anything committed is public on the live site.
- State lives in `PROJECT_STATE.md`; decisions in `docs/DECISIONS.md`. Don't start a second tracker.

## Small server (`proxy/`)

- Logic: `proxy/handler.js` (web-standard, host-agnostic) and `proxy/lib.js` (pure, tested in `test/proxy.test.js`). Vercel adapters: `proxy/api/route.js`, `proxy/api/alerts.js`.
- Vercel project root is `proxy/`. Secrets live only in Vercel env vars: `ONEMAP_EMAIL`, `ONEMAP_PASSWORD`, `LTA_ACCOUNT_KEY`, optional `ALLOWED_ORIGINS`. Never in chat or the repo.
- Turning it on in the app: set `PROXY_URL` in `transit.js` to the deployment URL.
- Never log coordinates or query strings.
