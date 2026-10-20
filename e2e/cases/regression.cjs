/**
 * Full browser regression (QA 2026-10-20). IDs match docs/QA_REPORT.md.
 * Geolocation is mocked to Toa Payoh Central (1.3343, 103.8563); TTSH is an
 * on-phone landmark (1.3216, 103.8459): straight line 1.83 km × 1.35 = 2.5 km.
 */
const GEO = { geolocation: { latitude: 1.3343, longitude: 103.8563 }, permissions: ['geolocation'] };
const sum = (xs) => Math.round(xs.reduce((a, b) => a + b, 0) * 100) / 100;

async function gpsToTtsh(h, page, hours = 2) {
  await page.click('#geoBtn');
  await page.waitForTimeout(350);
  await h.pickDest('tan tock');
  await page.fill('#parkHours', String(hours));
}
async function manual(h, page, { distance, hours, type = 'hdb', rate }) {
  await h.open('discManual');
  await page.fill('#distance', String(distance));
  await page.fill('#parkHours', String(hours));
  await page.selectOption('#destType', type);
  if (rate !== undefined) await h.setVal('parkRate', rate);
}
async function outcome(h, assert, expectWinner) {
  const cards = await h.cards();
  const winners = cards.filter((c) => c.winner);
  assert.equal(winners.length, 1, 'exactly one Cheapest');
  const lowest = cards.reduce((a, b) => (b.cost < a.cost ? b : a));
  assert.equal(winners[0].name, lowest.name, 'badge on the lowest cash cost');
  assert.equal(winners[0].name, expectWinner);
  const rows = await h.rows();
  const total = rows.find((r) => r.label === 'All in').val;
  assert.equal(sum(rows.filter((r) => r.label !== 'All in').map((r) => r.val)), total, 'drive parts add up');
  assert.equal(cards.find((c) => c.name === 'Drive').cost, total, 'drive card = breakdown total');
  return cards.map((c) => `${c.name} ${c.cost}`).join(', ');
}

module.exports = [
  /* ---------------------------------------------------------- journeys */
  {
    id: 'QA-E-01', priority: 'P0', title: 'GPS journey to TTSH: 2.5 km estimate, MRT cheapest, breakdown adds up', context: GEO,
    run: async ({ h, page, assert }) => {
      await gpsToTtsh(h, page);
      assert.equal(await page.inputValue('#distance'), '2.5');
      assert.match(await page.textContent('#geoStatus'), /estimate/i, 'distance labelled as an estimate');
      await h.compare();
      const o = await outcome(h, assert, 'MRT');
      assert.match(await h.title(), /^MRT/);
      return { cards: o, title: await h.title() };
    },
  },
  {
    id: 'QA-E-02', priority: 'P0', title: 'Drive cheapest (manual 2 km, HDB 1 h, MRT $5): Drive headline and wording',
    run: async ({ h, page, assert }) => {
      await manual(h, page, { distance: 2, hours: 1 });
      await h.setVal('mrtFare', 5);
      await h.compare();
      const o = await outcome(h, assert, 'Drive');
      assert.match(await h.title(), /^Drive/);
      assert.match(await h.verdict(), /^Driving is cheaper by \$8\.40/); // 10.00 - 1.60
      return { cards: o };
    },
  },
  {
    id: 'QA-E-03', priority: 'P0', title: 'MRT cheapest (manual 10 km, $3/h × 3 h): MRT wording',
    run: async ({ h, page, assert }) => {
      await manual(h, page, { distance: 10, hours: 3, type: 'other', rate: 3 });
      await h.compare();
      const o = await outcome(h, assert, 'MRT');
      assert.match(await h.verdict(), /^MRT saves you \$10\.40/); // 14.00 - 3.60
      return { cards: o };
    },
  },
  {
    id: 'QA-E-04', priority: 'P0', title: 'Grab cheapest (MRT $10, Grab $5): Grab headline and wording',
    run: async ({ h, page, assert }) => {
      await manual(h, page, { distance: 10, hours: 3, type: 'other', rate: 2 });
      await h.setVal('mrtFare', 10);
      await h.setVal('grabFare', 5);
      await h.compare();
      const o = await outcome(h, assert, 'Grab');
      assert.match(await h.title(), /^Grab/);
      assert.match(await h.verdict(), /^Grab is cheapest at \$10\.00/);
      return { cards: o };
    },
  },
  {
    id: 'QA-E-05', priority: 'P0', title: 'Close call ($2 apart): Cheapest badge still on lowest cash, wording says comfort call',
    run: async ({ h, page, assert }) => {
      await manual(h, page, { distance: 10, hours: 1 }); // drive 5.60 vs MRT 3.60
      await h.compare();
      const o = await outcome(h, assert, 'MRT');
      assert.match(await h.verdict(), /comfort call/);
      return { cards: o, verdict: await h.verdict() };
    },
  },
  {
    id: 'QA-E-06', priority: 'P0', title: 'Recommendation vs cheapest: arrive-by plan recommends an on-time MRT while Drive is cheapest',
    clock: '2026-10-20T12:00:00+08:00',
    run: async ({ h, page, assert }) => {
      await manual(h, page, { distance: 2, hours: 1 });
      await h.setVal('mrtFare', 5);
      await page.fill('#arriveBy', '14:00');
      await h.compare();
      const cards = await h.cards();
      assert.equal(cards.find((c) => c.winner).name, 'Drive', 'cheapest is Drive');
      assert.match(await page.textContent('#planMain'), /^Take the MRT · leave by 13:35/); // 14:00 − 14.8 (4.8 ride + 10 walk) − 10 buffer = 13:35
      assert.match(await h.title(), /^MRT/);
      return { plan: await page.textContent('#planMain'), why: await page.textContent('#planWhy') };
    },
  },

  /* ---------------------------------------------------- boundaries and invalid */
  {
    id: 'QA-E-07', priority: 'P0', title: 'Boundaries accepted: 0.1 and 300 km, 0 and 72 h, $0.50 and $10/L, 1 and 50 km/L',
    run: async ({ h, page, assert }) => {
      await manual(h, page, { distance: 10, hours: 1 });
      const ok = [['distance', 0.1], ['distance', 300], ['parkHours', 0], ['parkHours', 72], ['petrol', 0.5], ['petrol', 10], ['fuel', 1], ['fuel', 50]];
      for (const [id, v] of ok) {
        await h.setVal(id, v);
        assert.ok(!(await page.isDisabled('#calcBtn')), `${id}=${v} accepted`);
        await h.setVal(id, id === 'distance' ? 10 : id === 'parkHours' ? 1 : id === 'petrol' ? 3 : 12);
      }
      await h.setVal('distance', 300);
      await h.compare();
      assert.equal((await h.rows()).find((r) => r.label.startsWith('Petrol')).val, 150); // 600/12×3
      return { at300km: 150 };
    },
  },
  {
    id: 'QA-E-08', priority: 'P0', title: 'Just outside the boundaries refused with a message: 300.1 km, 72.5 h, $0.49/L, 0.9 km/L, −1 rate',
    run: async ({ h, page, assert }) => {
      await manual(h, page, { distance: 10, hours: 1 });
      const bad = [['distance', '300.1', /distance/i], ['parkHours', '72.5', /parking time/i], ['petrol', '0.49', /petrol/i], ['fuel', '0.9', /fuel/i], ['parkRate', '-1', /parking rate/i]];
      const seen = [];
      for (const [id, v, re] of bad) {
        await h.setVal(id, v);
        assert.ok(await page.isDisabled('#calcBtn'), `${id}=${v} refused`);
        assert.match(await h.calcLabel(), re);
        assert.equal(await page.getAttribute(`#${id}`, 'aria-invalid'), 'true');
        seen.push(await h.calcLabel());
        await h.setVal(id, id === 'distance' ? 10 : id === 'parkHours' ? 1 : id === 'petrol' ? 3 : id === 'fuel' ? 12 : 0.6);
      }
      assert.ok(!(await page.isDisabled('#calcBtn')), 'recovers once fixed');
      return { messages: seen };
    },
  },
  {
    id: 'QA-E-09', priority: 'P1', title: 'Letters typed into the distance box are ignored; button asks for a distance',
    run: async ({ h, page, assert }) => {
      await h.open('discManual');
      await page.click('#distance');
      await page.keyboard.type('abc');
      assert.equal(await page.inputValue('#distance'), '');
      assert.match(await h.calcLabel(), /destination|distance/i);
      return { label: await h.calcLabel() };
    },
  },

  /* ------------------------------------------------------- repeated changes */
  {
    id: 'QA-E-10', priority: 'P0', title: 'Repeated edits: after 6 live changes the result equals a fresh calculation',
    run: async ({ h, page, assert, ctx, base }) => {
      await manual(h, page, { distance: 10, hours: 1 });
      await h.compare();
      for (const [id, v] of [['distance', 15], ['parkHours', 3], ['petrol', 3.2], ['distance', 7], ['fuel', 14], ['parkHours', 2]]) {
        await h.setVal(id, v);
        await page.waitForTimeout(250);
      }
      const live = (await h.cards()).map((c) => c.cost);
      const fresh = await ctx.newPage();
      await fresh.route('https://driveormrt.vercel.app/api/**', (r) => r.fulfill({ status: 503, json: {} }));
      await fresh.goto(base, { waitUntil: 'networkidle' });
      const fh = require('../harness.cjs'); // eslint-disable-line no-unused-vars
      await fresh.click('#discManual > .disclosure-toggle');
      await fresh.fill('#distance', '7'); await fresh.fill('#parkHours', '2'); await fresh.selectOption('#destType', 'hdb');
      await fresh.evaluate(() => { for (const [i, v] of [['petrol', '3.2'], ['fuel', '14']]) { const el = document.getElementById(i); el.value = v; el.dispatchEvent(new Event('input', { bubbles: true })); } });
      await fresh.locator('#calcBtn').click(); await fresh.waitForTimeout(400);
      const freshCosts = await fresh.$$eval('#compare .option .option-cost', (els) => els.map((e) => Number(e.textContent.replace(/[$,]/g, ''))));
      assert.deepEqual(live, freshCosts);
      return { live, fresh: freshCosts }; // drive: 14/14×3.2 = 3.20 + 1.20 = 4.40
    },
  },

  /* ------------------------------------------------------- external failures */
  {
    id: 'QA-E-11', priority: 'P0', title: 'Search server down (503), offline, or slow: on-phone places still found, no errors',
    run: async ({ h, page, assert }) => {
      const found = {};
      for (const mode of ['down', 'abort', 'slow']) {
        await h.server(mode);
        await page.click('#destSearch'); await page.fill('#destSearch', '');
        await page.type('#destSearch', 'vivo', { delay: 15 });
        await page.waitForTimeout(400);
        found[mode] = await page.$$eval('#destResults .place-option', (els) => els.map((e) => e.innerText.split('\n')[0]));
        assert.deepEqual(found[mode], ['VivoCity'], mode);
      }
      return found;
    },
  },
  {
    id: 'QA-E-12', priority: 'P1', title: 'Route timing: server down → "Time estimated"; server answers → "OneMap time" (70 min return)', context: GEO,
    run: async ({ h, page, assert }) => {
      await gpsToTtsh(h, page);
      await h.compare();
      await page.waitForTimeout(500);
      const down = (await h.cards()).find((c) => c.name === 'MRT').text;
      assert.match(down, /TIME ESTIMATED/i);
      await h.server('custom', (r) => (r.request().url().includes('/api/route') ? r.fulfill({ json: { minutes: 35, source: 'onemap' } }) : r.fulfill({ status: 503, json: {} })));
      await h.setVal('parkHours', 3); // live edit re-asks for timing
      await h.compare();
      await page.waitForTimeout(700);
      const up = (await h.cards()).find((c) => c.name === 'MRT').text;
      assert.match(up, /ONEMAP TIME/i);
      assert.match(up, /~70 min/);
      return { down, up };
    },
  },

  /* -------------------------------------------------------------- sharing */
  {
    id: 'QA-E-13', priority: 'P0', title: 'Share text copied: totals match the cards, Grab marked (est), assumptions version stamped',
    context: { permissions: ['clipboard-read', 'clipboard-write'] },
    run: async ({ h, page, assert }) => {
      await manual(h, page, { distance: 10, hours: 3, type: 'other', rate: 3 });
      await h.compare();
      await page.click('#copyBtn');
      await page.waitForTimeout(200);
      const text = await page.evaluate(() => navigator.clipboard.readText());
      const cards = await h.cards();
      for (const c of cards) assert.ok(text.includes(`$${c.cost.toFixed(2)}`), `${c.name} ${c.cost} in share text`);
      assert.match(text, /🚕 Grab: \$18\.00 \(est\)/);
      assert.match(text, /assumptions 2026\.08/);
      assert.match(await page.textContent('#copyLabel'), /Clipped/);
      return { text };
    },
  },
  {
    id: 'QA-E-14', priority: 'P1', title: 'Clipboard refused: says so and offers the text to copy by hand',
    init: () => { Object.defineProperty(navigator, 'clipboard', { value: { writeText: () => Promise.reject(new Error('denied')) } }); },
    run: async ({ h, page, assert }) => {
      await manual(h, page, { distance: 10, hours: 1 });
      await h.compare();
      let dialog = null;
      page.once('dialog', async (d) => { dialog = d.defaultValue(); await d.dismiss(); });
      await page.click('#copyBtn');
      await page.waitForTimeout(300);
      assert.match(await page.textContent('#copyLabel'), /Copy failed/);
      assert.ok(dialog && dialog.includes('Drive There or MRT?'), 'text offered for manual copy');
      return { fallback: dialog.split('\n')[0] };
    },
  },

  /* -------------------------------------------------------------- viewports */
  ...[
    ['QA-E-15a', { width: 320, height: 568 }, 'iPhone SE (1st gen)'],
    ['QA-E-15b', { width: 375, height: 667 }, 'iPhone SE (2nd/3rd gen)'],
    ['QA-E-15c', { width: 412, height: 915 }, 'Android (Pixel 7 size)'],
    ['QA-E-15d', { width: 768, height: 1024 }, 'tablet portrait'],
    ['QA-E-15e', { width: 1280, height: 800 }, 'desktop'],
  ].map(([id, viewport, name]) => ({
    id, priority: 'P0', title: `Layout at ${viewport.width}×${viewport.height} (${name}): no sideways scroll, button reachable, result renders`, viewport,
    run: async ({ h, page, assert }) => {
      await manual(h, page, { distance: 10, hours: 2 });
      await h.compare();
      const m = await page.evaluate(() => {
        const btn = document.getElementById('calcBtn').getBoundingClientRect();
        return { scrollW: document.documentElement.scrollWidth, innerW: innerWidth, btnBottom: Math.round(btn.bottom), innerH: innerHeight, cards: document.querySelectorAll('#compare .option').length };
      });
      assert.ok(m.scrollW <= m.innerW, `no sideways scroll ${m.scrollW} > ${m.innerW}`);
      assert.ok(m.btnBottom <= m.innerH, 'Compare button on screen');
      assert.equal(m.cards, 3);
      return m;
    },
  })),

  /* --------------------------------------------- uncertainty and communication */
  {
    id: 'QA-E-16', priority: 'P0', title: 'Estimates and assumptions are labelled: distance, Grab, MRT time, walk value, assumptions panel, disclaimer',
    context: GEO,
    run: async ({ h, page, assert }) => {
      await gpsToTtsh(h, page);
      await h.compare();
      const body = (await page.textContent('body')).replace(/\s+/g, ' ');
      assert.match(await page.textContent('#geoStatus'), /straight-line ×1\.35, estimate/);
      const cards = await h.cards();
      assert.match(cards.find((c) => c.name === 'Grab').text, /ESTIMATED/i);
      assert.match(cards.find((c) => c.name === 'MRT').text, /TIME ESTIMATED/i);
      assert.match(body, /If you price the walk/);
      assert.match(body, /Estimates only/);
      await h.open('discA');
      const assumptions = await page.$$eval('#assumeList li', (els) => els.map((e) => e.textContent.replace(/\s+/g, ' ')));
      assert.ok(assumptions.length >= 5, 'assumptions listed');
      assert.ok(assumptions.some((a) => /Grab/i.test(a)) && assumptions.some((a) => /Petrol/i.test(a)) && assumptions.some((a) => /Journey times/i.test(a)));
      return { assumptions: assumptions.length };
    },
  },
  {
    id: 'QA-E-17', priority: 'P1', title: 'Time valuation labelled: rough $/hr caveat while train times are estimates',
    clock: '2026-10-20T08:30:00+08:00', context: GEO,
    run: async ({ h, page, assert }) => {
      for (let i = 0; i < 3; i += 1) {
        if (i) await page.reload({ waitUntil: 'networkidle' });
        await gpsToTtsh(h, page);
        await h.compare();
        await page.click('#tookRow .took-btn[data-mode="drive"]');
      }
      assert.ok(await page.isVisible('#insightsBox'));
      assert.match(await page.textContent('#insightsNote'), /estimates .* rough/i);
      return { line: await page.textContent('#insightsList li') };
    },
  },
  {
    id: 'QA-E-18', priority: 'P1', title: 'Location refused: explains the fix and offers typed start; nothing breaks',
    run: async ({ page, assert }) => {
      await page.click('#geoBtn');
      await page.waitForTimeout(400);
      assert.match(await page.textContent('#geoStatus'), /Location is blocked .* type where you're starting/i);
      return { msg: (await page.textContent('#geoStatus')).slice(0, 60) };
    },
  },
  {
    id: 'QA-E-19', priority: 'P1', title: 'Storage blocked: compare still works; "I took" says it could not save',
    init: () => { Object.defineProperty(window, 'localStorage', { get() { throw new DOMException('blocked', 'SecurityError'); } }); },
    run: async ({ h, page, assert }) => {
      await manual(h, page, { distance: 10, hours: 1 });
      await h.compare();
      assert.equal((await h.cards()).length, 3);
      await page.click('#tookRow .took-btn[data-mode="mrt"]');
      assert.match(await page.textContent('#tookStatus'), /Couldn't save/);
      return { ok: true };
    },
  },
  {
    id: 'QA-E-20', priority: 'P2', title: 'Every input and button has an accessible name',
    run: async ({ page, assert }) => {
      const unnamed = await page.evaluate(() => [...document.querySelectorAll('input, select, button')].filter((el) => {
        if (el.type === 'hidden' || el.closest('[hidden]')) return false;
        const name = (el.labels && el.labels.length) || el.getAttribute('aria-label') || el.getAttribute('aria-labelledby') || (el.textContent || '').trim() || el.getAttribute('placeholder');
        return !name;
      }).map((el) => el.id || el.outerHTML.slice(0, 60)));
      assert.deepEqual(unnamed, []);
      return { checked: 'inputs, selects, buttons' };
    },
  },

  /* ------------------------------------------ not runnable in this sandbox */
  { id: 'QA-B-01', priority: 'P0', title: 'Real iPhone Safari: location prompt, keyboard, layout', blocked: 'No physical device in the sandbox. Owner to run the checklist in README → Testing on an iPhone.' },
  { id: 'QA-B-02', priority: 'P1', title: 'Live OneMap search and route timing', blocked: 'Sandbox network refuses onemap.gov.sg; OneMap login not yet in Vercel. Shapes tested against assumed fixtures only.' },
  { id: 'QA-B-03', priority: 'P2', title: 'Screen reader pass (VoiceOver)', blocked: 'Needs a device with VoiceOver. QA-E-20 checks names only.' },
];
