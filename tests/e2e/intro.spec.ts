import { expect, test, type Page } from '@playwright/test';
import { boxOf, pauseAtStart, watchErrors } from './helpers';

/** The match intro: a versus card, Black above White, one column per lane; a tap skips it. */

async function begin(page: Page, query: string): Promise<void> {
  await page.goto(`/?${query}`);
  await expect(page.getByTestId('title')).toBeVisible();
  await page.getByTestId('seed').fill('42');
  await page.getByTestId('start').click();
  await expect(page.getByTestId('setup')).toBeVisible();
  await pauseAtStart(page);
  await page.getByTestId('begin').click();
}

/** The intro's clock in the page: held where it is (so a slow machine cannot run it out mid-test) or released. */
function holdClock(page: Page, held: boolean): Promise<void> {
  return page.evaluate((hold) => {
    const s = (window as unknown as { __session: { ui: { intro: { startedAt: number } | null } } })
      .__session;
    if (s.ui.intro) s.ui.intro.startedAt = performance.now() + (hold ? 120_000 : -1000);
  }, held);
}

const shapes = [
  { name: 'portrait', viewport: { width: 390, height: 844 } },
  { name: 'landscape', viewport: { width: 844, height: 390 } },
  { name: 'desktop', viewport: { width: 1440, height: 900 } },
];

for (const v of shapes) {
  test.describe(`intro ${v.name}`, () => {
    test.use({ viewport: v.viewport });

    test('ten pieces in two rows by lane, all on screen; a tap skips', async ({ page }) => {
      test.setTimeout(180_000);
      const errors = watchErrors(page);
      await begin(page, 'look=table');
      const intro = page.getByTestId('intro');
      await expect(intro).toBeVisible();
      // the card plays once the board has drawn its first frame; wait for the holding pose
      await expect(intro).toHaveAttribute('data-phase', 'show', { timeout: 60_000 });
      await holdClock(page, true);
      await expect(page.getByTestId('intro-opening-A')).not.toBeEmpty();
      await expect(page.getByTestId('intro-opening-B')).not.toBeEmpty();
      await expect(page.getByTestId('intro-piece')).toHaveCount(10);
      for (const [lane, n] of [
        ['top', 4],
        ['mid', 2],
        ['bot', 4],
      ] as const)
        await expect(page.getByTestId(`intro-lane-${lane}`).getByTestId('intro-piece')).toHaveCount(
          n,
        );
      // Black's row is above White's in every lane, and the columns run Left, Mid, Right
      const top = await boxOf(page, 'intro-lane-top');
      const mid = await boxOf(page, 'intro-lane-mid');
      const bot = await boxOf(page, 'intro-lane-bot');
      expect(top.x).toBeLessThan(mid.x);
      expect(mid.x).toBeLessThan(bot.x);
      const rows = await page.evaluate(() => {
        const y = (sel: string): number[] =>
          [...document.querySelectorAll(sel)].map((e) => e.getBoundingClientRect().y);
        return { black: y('.vs-row.b'), white: y('.vs-row.a') };
      });
      rows.black.forEach((y, i) => expect(y).toBeLessThan(rows.white[i]));
      // everything fits the screen
      const edges = await page.evaluate(() =>
        [...document.querySelectorAll('[data-testid="intro-piece"]')].map((e) => {
          const r = e.getBoundingClientRect();
          return { l: r.left, t: r.top, r: r.right, b: r.bottom };
        }),
      );
      for (const e of edges) {
        expect(e.l).toBeGreaterThanOrEqual(0);
        expect(e.t).toBeGreaterThanOrEqual(0);
        expect(e.r).toBeLessThanOrEqual(v.viewport.width);
        expect(e.b).toBeLessThanOrEqual(v.viewport.height);
      }
      // each portrait is the piece's own model drawn offscreen (the glyph stands in without WebGL)
      const imgs = await page.locator('.vs-plate img').count();
      if (imgs > 0) {
        expect(imgs).toBe(10);
        expect(await page.locator('.vs-plate img').first().getAttribute('src')).toMatch(
          /^data:image\/png/,
        );
      }
      // a tap anywhere ends it (after the first 400 ms) and the board is clear
      await holdClock(page, false);
      await page.mouse.click(v.viewport.width / 2, v.viewport.height / 2);
      await expect(intro).toHaveCount(0);
      await expect(page.getByTestId('hud')).toBeVisible();
      expect(errors).toEqual([]);
    });
  });
}

test.describe('intro reduced motion', () => {
  test.use({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });

  test('fades only, then ends by itself in about four seconds', async ({ page }) => {
    test.setTimeout(180_000);
    await begin(page, 'look=table');
    const intro = page.getByTestId('intro');
    await expect(intro).toHaveAttribute('data-phase', 'show', { timeout: 60_000 });
    const t0 = Date.now();
    // no piece moves: the rise and settle animations are replaced by a plain fade
    const names = await page
      .locator('.vs-piece')
      .evaluateAll((els) => els.map((e) => getComputedStyle(e).animationName));
    expect(new Set(names)).toEqual(new Set(['vs-fade']));
    await expect(intro).toHaveCount(0, { timeout: 15_000 });
    expect(Date.now() - t0).toBeGreaterThan(3000);
    expect(Date.now() - t0).toBeLessThan(6500);
  });
});

test('?intro=off skips the card', async ({ page }) => {
  test.setTimeout(120_000);
  await begin(page, 'intro=off');
  await expect(page.getByTestId('hud')).toBeVisible();
  await expect(page.getByTestId('intro')).toHaveCount(0);
});
