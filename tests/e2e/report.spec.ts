import { expect, test, type Page } from '@playwright/test';
import { boxOf, overflow, playToEnd, startLive, watchErrors } from './helpers';

const shots = process.env.SHOTS_DIR;
const PAGES = ['result', 'economy', 'combat', 'objectives', 'pieces', 'replay', 'log'];

const views = [
  { name: 'portrait', viewport: { width: 390, height: 844 }, touch: true },
  { name: 'landscape', viewport: { width: 844, height: 390 }, touch: true },
  { name: 'desktop', viewport: { width: 1280, height: 800 }, touch: false },
];

/** The index of the page the pager is showing, from its scroll position. */
const pageIndex = (page: Page): Promise<number> =>
  page.getByTestId('report-pager').evaluate((el) => Math.round(el.scrollLeft / el.clientWidth));

const selectedTab = async (page: Page, id: string): Promise<void> => {
  await expect(page.getByTestId(`report-tab-${id}`)).toHaveAttribute('aria-selected', 'true');
};

/** A real touch swipe along the pager: a finger drags `dx` pixels to the left (negative: right). */
async function swipe(page: Page, dx: number): Promise<void> {
  const box = await boxOf(page, 'report-pager');
  const cdp = await page.context().newCDPSession(page);
  const y = Math.round(box.y + Math.min(300, box.height / 2));
  const x0 = Math.round(box.x + box.width / 2 + dx / 2);
  const steps = 12;
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: x0, y }] });
  for (let i = 1; i <= steps; i++) {
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [{ x: Math.round(x0 - (dx * i) / steps), y }],
    });
    await page.waitForTimeout(16);
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await cdp.detach();
}

for (const v of views) {
  test.describe(`report, ${v.name}`, () => {
    test.use({ viewport: v.viewport, hasTouch: v.touch, isMobile: v.touch });

    test('splash first, swipeable pages, tabs, arrows, no overflow', async ({ page }) => {
      test.setTimeout(600_000);
      const errors = watchErrors(page);
      await startLive(page, '42');
      await playToEnd(page);
      await expect(page.getByTestId('report')).toBeVisible();

      // ---- the splash is the front page
      await selectedTab(page, 'result');
      expect(await pageIndex(page)).toBe(0);
      await expect(page.getByTestId('winner')).toHaveText(/Checkmate · (White|Black) wins/);
      await expect(page.getByTestId('verdict')).toBeVisible();
      await expect(page.locator('[data-testid^="report-hero-"]')).toHaveCount(10);
      expect(await page.locator('[data-testid^="award-"]').count()).toBeGreaterThanOrEqual(3);
      await expect(page.getByTestId('team-totals')).toBeVisible();
      await expect(page.getByTestId('new-match')).toBeVisible();
      await expect(page.getByTestId('same-seed')).toBeVisible();
      await expect(page.locator('.rp-crown')).toHaveCount(1);
      await expect(page.locator('.rp-star')).toHaveCount(1);
      if (shots) await page.screenshot({ path: `${shots}/report-${v.name}-result.png` });
      expect(await overflow(page)).toBeLessThanOrEqual(0);

      // ---- the boards come first: visible without scrolling (all of both boards on desktop)
      const vh = v.viewport.height;
      const boardA = await boxOf(page, 'team-A');
      const boardB = await boxOf(page, 'team-B');
      expect(boardA.y, 'White board starts near the top').toBeLessThan(vh * 0.6);
      if (v.name === 'desktop') {
        expect(boardA.y + boardA.height, 'White board fully visible').toBeLessThanOrEqual(vh);
        expect(boardB.y + boardB.height, 'Black board fully visible').toBeLessThanOrEqual(vh);
      }

      // ---- tap targets
      const minSide = 40;
      for (const id of [...PAGES.map((p) => `report-tab-${p}`), 'new-match', 'same-seed']) {
        const b = await boxOf(page, id);
        expect(b.height, `${id} height`).toBeGreaterThanOrEqual(minSide);
        expect(b.width, `${id} width`).toBeGreaterThanOrEqual(minSide);
      }
      const rowBox = await boxOf(
        page,
        (await page.locator('[data-testid^="report-hero-"]').first().getAttribute('data-testid'))!,
      );
      expect(rowBox.height).toBeGreaterThanOrEqual(minSide);

      // ---- every page: tap its tab, it fills the pager, nothing overflows sideways
      for (const [i, id] of PAGES.entries()) {
        if (v.touch) await page.getByTestId(`report-tab-${id}`).tap();
        else await page.getByTestId(`report-tab-${id}`).click();
        await selectedTab(page, id);
        await expect.poll(() => pageIndex(page), { timeout: 20_000 }).toBe(i);
        await expect(page.getByTestId(`report-page-${id}`)).toBeInViewport({ ratio: 0.9 });
        await page.waitForTimeout(700);
        expect(await overflow(page), `${id}: no horizontal page overflow`).toBeLessThanOrEqual(0);
        const inner = await page
          .getByTestId(`report-page-${id}`)
          .evaluate((el) => el.scrollWidth - el.clientWidth);
        expect(inner, `${id}: nothing wider than its page`).toBeLessThanOrEqual(1);
        // the active tab is inside the tab bar
        await expect(page.getByTestId(`report-tab-${id}`)).toBeInViewport({ ratio: 0.5 });
        if (shots) await page.screenshot({ path: `${shots}/report-${v.name}-${id}.png` });
      }
      await expect(page.getByTestId('chart-lead')).toHaveCount(1);

      // ---- back at the front: swipe (touch) or arrows move between pages
      await page.getByTestId('report-tab-result').click();
      await selectedTab(page, 'result');
      if (v.touch) {
        await swipe(page, 300);
        await selectedTab(page, 'economy');
        expect(await pageIndex(page)).toBe(1);
        await swipe(page, -300);
        await selectedTab(page, 'result');
      }
      await page.keyboard.press('ArrowRight');
      await selectedTab(page, 'economy');
      await page.keyboard.press('ArrowRight');
      await selectedTab(page, 'combat');
      await page.keyboard.press('ArrowLeft');
      await selectedTab(page, 'economy');
      if (!v.touch) {
        await page.getByTestId('report-next').click();
        await selectedTab(page, 'combat');
        await page.getByTestId('report-dot-log').click();
        await selectedTab(page, 'log');
        await expect(page.getByTestId('report-next')).toBeDisabled();
      }

      // ---- a chart answers a tap or hover with a readout, and does not turn the page
      await page.getByTestId('report-tab-economy').click();
      await selectedTab(page, 'economy');
      const svg = page.getByTestId('chart-gold-svg').locator('svg');
      await svg.scrollIntoViewIfNeeded();
      const sb = (await svg.boundingBox())!;
      if (v.touch) await page.touchscreen.tap(sb.x + sb.width * 0.6, sb.y + sb.height * 0.5);
      else await page.mouse.move(sb.x + sb.width * 0.6, sb.y + sb.height * 0.5);
      await expect(page.getByTestId('chart-gold').getByTestId('chart-tip')).toBeVisible();
      expect(await pageIndex(page)).toBe(1);

      // ---- the pieces page opens from a scoreboard row and the replay page draws the map
      await page.getByTestId('report-tab-result').click();
      await selectedTab(page, 'result');
      const firstRow = page.locator('[data-testid^="report-hero-"]').first();
      await firstRow.scrollIntoViewIfNeeded();
      await firstRow.click();
      await selectedTab(page, 'pieces');
      await expect(page.getByTestId('hero-view')).toBeVisible();
      expect(await page.locator('[data-testid^="piece-chip-"]').count()).toBe(10);
      for (const c of await page.locator('[data-testid^="piece-chip-"]').all())
        expect((await c.boundingBox())!.height).toBeGreaterThanOrEqual(minSide);
      await page.locator('[data-testid^="piece-chip-"]').nth(3).click();
      await page.getByTestId('open-replay').click();
      await selectedTab(page, 'replay');
      await expect(page.getByTestId('replay')).toBeVisible();
      await page.getByTestId('scrub').fill('1200');

      // ---- the log filters
      await page.getByTestId('report-tab-log').click();
      await selectedTab(page, 'log');
      const all = await page.locator('.rp-log-line').count();
      expect(all).toBeGreaterThan(5);
      await page.getByTestId('log-filter-structures').click();
      expect(await page.locator('.rp-log-line').count()).toBeLessThan(all);
      for (const f of await page.locator('[data-testid^="log-filter-"]').all())
        expect((await f.boundingBox())!.height).toBeGreaterThanOrEqual(minSide);

      // ---- Same seed returns to the setup board with the same seed
      await page.getByTestId('report-tab-result').click();
      await selectedTab(page, 'result');
      await page.getByTestId('same-seed').click();
      await expect(page.getByTestId('setup')).toBeVisible();
      expect(errors).toEqual([]);
    });
  });
}
