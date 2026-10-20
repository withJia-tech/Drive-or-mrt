/**
 * Browser test harness for Drive or MRT. No dependencies beyond Playwright.
 *
 *   node e2e/run.cjs            run every case
 *   node e2e/run.cjs QA-D1      run cases whose id starts with QA-D1
 *
 * Starts its own static server on a free port, runs each case in a fresh
 * browser context, records PASS / FAIL with the error, and saves a screenshot
 * per case to e2e/out/. The small server (OneMap/LTA) is always mocked: no
 * case reaches the network.
 */
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

function loadPlaywright() {
  try { return require('playwright'); } catch { /* fall through */ }
  const root = require('node:child_process').execSync('npm root -g').toString().trim();
  return require(path.join(root, 'playwright'));
}

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(__dirname, 'out');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml' };

function serve() {
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://x');
    let file = path.join(ROOT, decodeURIComponent(url.pathname));
    if (!file.startsWith(ROOT)) { res.writeHead(403); res.end(); return; }
    if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
    fs.readFile(file, (err, data) => {
      if (err) { res.writeHead(404); res.end('not found'); return; }
      res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' });
      res.end(data);
    });
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server)));
}

/** Everything a case needs, bound to one page. */
function helpers(page, base, id) {
  const h = {
    base,
    /** Set a value and fire the events a person's typing fires (works on collapsed fields). */
    setVal: (fid, v) => page.evaluate(([i, val]) => {
      const el = document.getElementById(i);
      el.value = val;
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    }, [fid, String(v)]),
    open: async (discId) => {
      const t = page.locator(`#${discId} > .disclosure-toggle`);
      if ((await t.getAttribute('aria-expanded')) !== 'true') await t.click();
    },
    pickDest: async (q) => {
      await page.click('#destSearch');
      await page.fill('#destSearch', '');
      await page.type('#destSearch', q, { delay: 15 });
      await page.waitForTimeout(450);
      await page.click('#destResults .place-option >> nth=0');
      await page.waitForTimeout(150);
    },
    compare: async () => { await page.locator('#calcBtn').click(); await page.waitForTimeout(450); },
    calcLabel: async () => (await page.textContent('#calcBtn')).replace(/\s+/g, ' ').trim(),
    cards: () => page.$$eval('#compare .option', (els) => els.map((e) => ({
      text: e.innerText.replace(/\s+/g, ' ').trim(),
      winner: e.classList.contains('winner'),
      cost: Number((e.querySelector('.option-cost')?.textContent || '').replace(/[$,]/g, '')),
      name: (e.querySelector('.option-name')?.textContent || '').trim(),
    }))),
    title: async () => (await page.textContent('#resultTitle')).replace(/\s+/g, ' ').trim(),
    verdict: async () => (await page.textContent('#verdictText')).replace(/\s+/g, ' ').trim(),
    rows: (box = 'driveBreakdown') => page.$$eval(`#${box} .breakdown-row`, (els) => els.map((e) => ({
      label: (e.querySelector('.label')?.textContent || '').trim(),
      val: Number((e.querySelector('.val')?.textContent || '').replace(/[$,]/g, '')),
    }))),
    shot: (suffix = '') => page.screenshot({ path: path.join(OUT, `${id}${suffix}.png`), fullPage: false }),
    /** Mock the small server: 'down' (503), 'abort' (offline), 'slow' (6 s), or a handler. */
    server: async (mode = 'down', handler) => {
      await page.unroute('https://driveormrt.vercel.app/api/**').catch(() => {});
      await page.route('https://driveormrt.vercel.app/api/**', async (r) => {
        if (handler) return handler(r);
        if (mode === 'abort') return r.abort();
        if (mode === 'slow') { await new Promise((res) => setTimeout(res, 6000)); return r.fulfill({ status: 503, json: {} }).catch(() => {}); }
        return r.fulfill({ status: 503, json: { error: 'not configured' } });
      });
    },
  };
  return h;
}

async function runCases(cases, filter) {
  fs.mkdirSync(OUT, { recursive: true });
  const { chromium, devices } = loadPlaywright();
  const server = await serve();
  const base = `http://127.0.0.1:${server.address().port}/`;
  const browser = await chromium.launch();
  const results = [];
  for (const c of cases.filter((x) => !filter || x.id.startsWith(filter))) {
    if (c.blocked) { results.push({ id: c.id, title: c.title, priority: c.priority, status: 'BLOCKED', note: c.blocked }); continue; }
    const ctx = await browser.newContext({
      ...(devices[c.device || 'iPhone 13']), ...(c.viewport ? { viewport: c.viewport } : {}),
      timezoneId: 'Asia/Singapore', ...(c.context || {}),
    });
    if (c.init) await ctx.addInitScript(c.init);
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    const h = helpers(page, base, c.id);
    await h.server('down');
    if (c.clock) await page.clock.setFixedTime(new Date(c.clock));
    const started = Date.now();
    let status = 'PASS'; let note = '';
    try {
      if (!c.noGoto) await page.goto(base, { waitUntil: 'networkidle' });
      const evidence = await c.run({ page, ctx, h, assert, base });
      note = evidence ? JSON.stringify(evidence) : '';
      assert.deepEqual(errors, [], 'page errors');
    } catch (e) {
      status = 'FAIL';
      note = (e && e.message ? e.message : String(e)).split('\n').slice(0, 6).join(' | ');
    }
    await h.shot().catch(() => {});
    results.push({ id: c.id, title: c.title, priority: c.priority, status, ms: Date.now() - started, note });
    process.stdout.write(`${status.padEnd(7)} ${c.id.padEnd(12)} ${c.title}${status === 'FAIL' ? `\n        ${note}` : ''}\n`);
    await ctx.close();
  }
  await browser.close();
  server.close();
  fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify(results, null, 2));
  const count = (s) => results.filter((r) => r.status === s).length;
  process.stdout.write(`\n${count('PASS')} passed, ${count('FAIL')} failed, ${count('BLOCKED')} blocked, of ${results.length}\n`);
  return results;
}

module.exports = { runCases };
