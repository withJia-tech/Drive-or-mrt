/**
 * Regression cases for confirmed defects (QA 2026-10-20). Each was first run
 * against the unfixed code to record a FAIL, then the fix made it PASS.
 * See docs/QA_REPORT.md for the root-cause analysis.
 */
const vivoTrip = async (h, { distance = 10, hours = 1, rate } = {}) => {
  await h.pickDest('vivo');
  await h.setVal('distance', distance);
  await h.setVal('parkHours', hours);
  if (rate !== undefined) await h.setVal('parkRate', rate);
};
const petrolRow = async (h) => (await h.rows()).find((r) => r.label.startsWith('Petrol'));
const totalRow = async (h) => (await h.rows()).find((r) => r.label === 'All in');

module.exports = [
  {
    id: 'QA-D1a', priority: 'P0', title: 'Edited petrol and km/L before Compare are applied (10 km, $3.50, 10 km/L → $7.00)',
    run: async ({ h, assert }) => {
      await vivoTrip(h, { rate: 0 });
      await h.setVal('petrol', '3.50');
      await h.setVal('fuel', '10');
      await h.compare();
      const p = await petrolRow(h);
      assert.equal(p.val, 7, `petrol row ${JSON.stringify(p)}`);
      return { petrol: p.val };
    },
  },
  {
    id: 'QA-D1b', priority: 'P0', title: 'Editing petrol and km/L AFTER a result updates the result (no stale $5.00)',
    run: async ({ h, assert, page }) => {
      await vivoTrip(h, { rate: 0 });
      await h.compare();
      assert.equal((await petrolRow(h)).val, 5, 'defaults first: 20/12×3.00');
      await h.setVal('petrol', '3.50');
      await h.setVal('fuel', '10');
      await page.waitForTimeout(500);
      const p = await petrolRow(h);
      const t = await totalRow(h);
      const driveCard = (await h.cards()).find((c) => c.name === 'Drive');
      assert.equal(p.val, 7, `petrol after edit ${JSON.stringify(p)}`);
      assert.equal(t.val, 7, 'drive total follows (rate 0)');
      assert.equal(driveCard.cost, 7, 'drive card follows');
      return { petrol: p.val, total: t.val };
    },
  },
  {
    id: 'QA-D1c', priority: 'P0', title: 'Clearing a required input after a result marks the result out of date',
    run: async ({ h, assert, page }) => {
      await vivoTrip(h, { rate: 0 });
      await h.compare();
      await h.setVal('distance', '');
      await page.waitForTimeout(400);
      const stale = await page.isVisible('#staleNote');
      assert.ok(stale, 'a visible "out of date" note');
      return { staleNote: await page.textContent('#staleNote') };
    },
  },
  {
    id: 'QA-D2', priority: 'P1', title: 'Manual distance without a destination can be completed (parking asked, not assumed free)',
    run: async ({ h, assert, page }) => {
      await h.open('discManual');
      await page.fill('#distance', '10');
      await page.waitForTimeout(200);
      assert.ok(await page.isVisible('#parkHours'), 'parking hours shown for a typed distance');
      await page.fill('#parkHours', '1');
      assert.ok(await page.isDisabled('#calcBtn'), 'still needs a parking type or rate, not $0 by default');
      assert.ok(await page.isVisible('#destType'), 'parking type can be chosen');
      await page.selectOption('#destType', 'hdb');
      await page.waitForTimeout(150);
      assert.ok(!(await page.isDisabled('#calcBtn')), 'ready once parking is known');
      await h.compare();
      const p = await petrolRow(h);
      assert.equal(p.val, 5, '20 km / 12 × 3.00');
      return { calc: 'completed', petrol: p.val };
    },
  },
  {
    id: 'QA-D3', priority: 'P0', title: 'Grab cheapest: headline and explanation agree (no "Drive." / "take the train")',
    run: async ({ h, assert }) => {
      await vivoTrip(h, { hours: 3 });
      await h.setVal('mrtFare', '10');
      await h.setVal('grabFare', '5');
      await h.compare();
      const cards = await h.cards();
      const v = await h.verdict();
      assert.equal(cards.find((c) => c.winner).name, 'Grab', 'Grab cheapest');
      assert.match(await h.title(), /^Grab/);
      assert.match(v, /^Grab/, `verdict leads with Grab: ${v}`);
      assert.doesNotMatch(v, /\bDrive\.|take the train/, `no contradicting instruction: ${v}`);
      return { verdict: v };
    },
  },
  {
    id: 'QA-D4', priority: 'P1', title: 'Explanation names the real cost driver (petrol, not $0.60 parking) and says "1 hour"',
    run: async ({ h, assert }) => {
      await vivoTrip(h, { distance: 40, hours: 1, rate: 0.6 });
      await h.compare();
      const v = await h.verdict();
      assert.doesNotMatch(v, /Parking .* is the killer/, `parking blamed: ${v}`);
      assert.match(v, /petrol/i, `petrol named: ${v}`);
      assert.doesNotMatch(v, /\b1 hours\b/, 'grammar');
      return { verdict: v };
    },
  },
  {
    id: 'QA-D5', priority: 'P0', title: 'Fuel economy 0 km/L or petrol $0 is refused, not priced as free petrol',
    run: async ({ h, assert, page }) => {
      await vivoTrip(h, { rate: 0.6 });
      await h.setVal('fuel', '0');
      await page.waitForTimeout(150);
      assert.ok(await page.isDisabled('#calcBtn'), 'Compare disabled for 0 km/L');
      assert.match(await h.calcLabel(), /fuel/i, 'button says what to fix');
      await h.setVal('fuel', '12');
      await h.setVal('petrol', '0');
      await page.waitForTimeout(150);
      assert.ok(await page.isDisabled('#calcBtn'), 'Compare disabled for $0 petrol');
      return { label: await h.calcLabel() };
    },
  },
  {
    id: 'QA-D6', priority: 'P1', title: 'Negative or out-of-range distance is refused with a message, not silently changed',
    run: async ({ h, assert, page }) => {
      await vivoTrip(h, { rate: 0.6 });
      for (const bad of ['-5', '500']) {
        await h.setVal('distance', bad);
        await page.waitForTimeout(150);
        assert.ok(await page.isDisabled('#calcBtn'), `Compare disabled for distance ${bad}`);
        assert.match(await h.calcLabel(), /distance/i, `button explains distance ${bad}`);
      }
      return { label: await h.calcLabel() };
    },
  },
];
