#!/bin/sh
# PreToolUse hook (Bash): run the unit tests before any `git push`.
# Exit 0 lets the command run; exit 2 blocks it and shows Claude why.
# The browser suite runs in CI on the pull request (too slow for every push).

input=$(cat)
cmd=$(printf '%s' "$input" | node -e '
  let s = ""; process.stdin.on("data", (d) => (s += d)).on("end", () => {
    try { process.stdout.write(String(JSON.parse(s).tool_input?.command ?? "")); } catch { /* not JSON */ }
  });')

case "$cmd" in
  *"git push"*) ;;
  *) exit 0 ;;
esac

cd "${CLAUDE_PROJECT_DIR:-.}" || exit 0
out=$(node --test 2>&1)
if [ $? -ne 0 ]; then
  {
    echo "Push blocked: unit tests failed. Fix them before pushing."
    printf '%s\n' "$out" | grep -E '^not ok|^# (tests|pass|fail)' | head -20
  } >&2
  exit 2
fi
exit 0
