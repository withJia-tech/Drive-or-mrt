#!/usr/bin/env node
/* Browser tests. Needs Playwright (npx playwright install chromium, or a global install). See README "Testing". */
const { runCases } = require('./harness.cjs');
const fs = require('node:fs');
const path = require('node:path');

const dir = path.join(__dirname, 'cases');
const cases = fs.readdirSync(dir).filter((f) => f.endsWith('.cjs')).sort()
  .flatMap((f) => require(path.join(dir, f)));

runCases(cases, process.argv[2]).then((results) => {
  process.exitCode = results.some((r) => r.status === 'FAIL') ? 1 : 0;
});
