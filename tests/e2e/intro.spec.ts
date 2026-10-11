import { expect, test, type Page } from '@playwright/test';
import { boxOf, pauseAtStart, watchErrors } from './helpers';

/** The match intro: a versus card, Black above White, one column per lane; it holds until the player starts. */

async function begin(page: Page, query: string): Promise<void> {
  await page.goto(`/?${query}`);
  await expect(page.getByTestId('title')).toBeVisible();
  await page.getByTestId('seed').fill('42');
  await page.getByTestId('start').click();
  await expect(page.getByTestId('setup')).toBeVisible();
  await pauseAtStart(page);
  await page.getByTestId('quick-start').click();
}

const shapes = [
  { name: 'portrait', viewport: { width: 390, height: 844 } },
  { name: 'landscape', viewport: { width: 844, height: 390 } },
  { name: 'desktop', viewport: { width: 1440, height: 900 } },
];

for (const v of shapes) {
  test.describe(`intro ${v.name}`, () => {
    test.use({ viewport: v.viewport });

    test('ten pieces in two rows by lane, all on screen; it holds until a tap', async ({
      page,
    }) => {
      test.setTimeout(180_000);
      const errors = watchErrors(page);
      await begin(page, 'look=table');
      const intro = page.getByTestId('intro');
      // the card shows at once on Begin: it does not wait for portraits or the scene's first frame
      await expect(intro).toBeVisible({ timeout: 3_000 });
      await expect(intro).toHaveAttribute('data-phase', 'show');
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
      // each portrait is the piece's own model drawn offscreen (the glyph stands in without WebGL
      // and until the portrait arrives, normally already drawn while the player was on setup)
      await page.waitForTimeout(3_000);
      const imgs = await page.locator('.vs-plate img').count();
      if (imgs > 0) {
        expect(imgs).toBe(10);
        expect(await page.locator('.vs-plate img').first().getAttribute('src')).toMatch(
          /^data:image\/png/,
        );
      }
      // a clear Begin button, and the card holds: past the old 6.7 s auto-end it is still up
      const beginBtn = page.getByTestId('intro-begin');
      await expect(beginBtn).toBeVisible();
      const bb = await beginBtn.boundingBox();
      expect(bb!.y + bb!.height).toBeLessThanOrEqual(v.viewport.height);
      await page.waitForTimeout(5_000);
      await expect(intro).toBeVisible();
      await expect(intro).toHaveAttribute('data-phase', 'show');
      // a tap anywhere starts the match and the board is clear
      await page.mouse.click(v.viewport.width / 2, v.viewport.height / 2);
      await expect(intro).toHaveCount(0, { timeout: 5_000 });
      await expect(page.getByTestId('hud')).toBeVisible();
      expect(errors).toEqual([]);
    });
  });
}

test.describe('intro start controls', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  for (const how of ['Begin button', 'Enter', 'Space'] as const) {
    test(`${how} starts the match`, async ({ page }) => {
      test.setTimeout(120_000);
      await begin(page, 'look=table');
      const intro = page.getByTestId('intro');
      await expect(intro).toBeVisible({ timeout: 3_000 });
      // the key that pressed Begin on setup must not start it again straight away
      await page.waitForTimeout(700);
      await expect(intro).toBeVisible();
      if (how === 'Begin button') await page.getByTestId('intro-begin').click();
      else await page.keyboard.press(how === 'Enter' ? 'Enter' : ' ');
      await expect(intro).toHaveCount(0, { timeout: 5_000 });
      await expect(page.getByTestId('hud')).toBeVisible();
    });
  }
});

test.describe('intro reduced motion', () => {
  test.use({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });

  test('fades only, and waits for the player', async ({ page }) => {
    test.setTimeout(120_000);
    await begin(page, 'look=table');
    const intro = page.getByTestId('intro');
    await expect(intro).toBeVisible({ timeout: 3_000 });
    // no piece moves: the rise and settle animations are replaced by a plain fade
    const names = await page
      .locator('.vs-piece')
      .evaluateAll((els) => els.map((e) => getComputedStyle(e).animationName));
    expect(new Set(names)).toEqual(new Set(['vs-fade']));
    // it used to end by itself after four seconds; now it holds
    await page.waitForTimeout(6_000);
    await expect(intro).toBeVisible();
    await page.getByTestId('intro-begin').click();
    await expect(intro).toHaveCount(0, { timeout: 5_000 });
  });
});

test('?intro=off skips the card', async ({ page }) => {
  test.setTimeout(120_000);
  await begin(page, 'intro=off');
  await expect(page.getByTestId('hud')).toBeVisible();
  await expect(page.getByTestId('intro')).toHaveCount(0);
});
