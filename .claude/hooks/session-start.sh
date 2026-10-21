#!/bin/sh
# SessionStart hook: print the test recipe. Informational; never fails.
cd "${CLAUDE_PROJECT_DIR:-.}" 2>/dev/null
pw="not found (CI runs it)"
node -e 'try{require.resolve("playwright")}catch{process.exit(1)}' 2>/dev/null && pw="found"
[ "$pw" = "found" ] || { [ -d "$(npm root -g 2>/dev/null)/playwright" ] && pw="found (global)"; }
echo "Drive or MRT checks: node $(node --version 2>/dev/null || echo missing) | unit: node --test | browser: node e2e/run.cjs (Playwright $pw) | a git push runs unit tests first; PRs run both in CI."
exit 0
