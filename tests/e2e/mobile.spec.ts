import { expect, test, type Page } from '@playwright/test';

const shots = process.env.SHOTS_DIR;

async function overflow(page: Page): Promise<number> {
  return page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
}

async function shot(page: Page, name: string): Promise<void> {
  if (shots) await page.screenshot({ path: `${shots}/${name}.png` });
}

async function tallEnough(page: Page, id: string, min = 36): Promise<void> {
  const box = await page.getByTestId(id).boundingBox();
  expect(box, id).not.toBeNull();
  expect(box!.height, id).toBeGreaterThanOrEqual(min);
}

const views = [
  { name: 'portrait', viewport: { width: 390, height: 844 } },
  { name: 'landscape', viewport: { width: 844, height: 390 } },
];

for (const v of views) {
  test.describe(v.name, () => {
    test.use({ viewport: v.viewport, hasTouch: true, isMobile: true });

    test('full flow with taps', async ({ page }) => {
      const errors: string[] = [];
      page.on('pageerror', (e) => errors.push(e.message));
      await page.goto('/');
      await page.getByTestId('seed').fill('42');
      await page.getByTestId('start').tap();
      await expect(page.getByTestId('draft')).toBeVisible();
      await shot(page, `${v.name}-draft`);
      expect(await overflow(page)).toBeLessThanOrEqual(0);
      await page.locator('.hero-row [data-testid^="hero-"]').first().tap();
      await page.getByTestId('lane-top').tap();
      await page.getByTestId('begin').scrollIntoViewIfNeeded();
      await page.getByTestId('begin').tap();

      await expect(page.getByTestId('prep')).toBeVisible();
      await shot(page, `${v.name}-prep`);
      expect(await overflow(page)).toBeLessThanOrEqual(0);
      const cards = page.locator('[data-testid^="upgrade-"]');
      const vp = page.viewportSize()!;
      for (let i = 0; i < (await cards.count()); i++) {
        await cards.nth(i).scrollIntoViewIfNeeded();
        const box = (await cards.nth(i).boundingBox())!;
        expect(box.x, `card ${i} left`).toBeGreaterThanOrEqual(0);
        expect(box.x + box.width, `card ${i} right`).toBeLessThanOrEqual(vp.width);
        expect(box.y, `card ${i} top`).toBeGreaterThanOrEqual(0);
        expect(box.y + box.height, `card ${i} bottom`).toBeLessThanOrEqual(vp.height);
      }
      await cards.first().tap();
      await page.getByTestId('tab-shop').tap();
      await expect(page.getByTestId('buy')).toBeInViewport();
      await shot(page, `${v.name}-prep-shop`);
      await page.getByTestId('start-phase').scrollIntoViewIfNeeded();
      await page.getByTestId('start-phase').tap();
      const startAnyway = page.getByTestId('unspent-start');
      if (await startAnyway.count()) await startAnyway.tap();

      await expect(page.getByTestId('phase')).toHaveText('Phase 1');
      await page.getByTestId('speed-4').tap();
      await page.waitForTimeout(1500);
      await shot(page, `${v.name}-hud`);
      expect(await overflow(page)).toBeLessThanOrEqual(0);
      await tallEnough(page, 'shop-toggle', 40);
      await tallEnough(page, 'recall-base', 40);
      if (await page.getByTestId('farm-toggle').count())
        await page.getByTestId('farm-toggle').tap();
      await page.getByTestId('shop-toggle').tap();
      const sheet = page.getByTestId('shop-sheet');
      await expect(sheet).toBeVisible();
      await expect(page.getByTestId('shop')).toBeVisible();
      await page.waitForTimeout(600);
      await shot(page, `${v.name}-hud-shop`);
      const vp2 = page.viewportSize()!;
      const sheetBox = (await sheet.boundingBox())!;
      if (v.name === 'portrait') {
        expect(sheetBox.y, 'game stays visible above the sheet').toBeGreaterThanOrEqual(
          vp2.height * 0.4,
        );
        expect(sheetBox.y + sheetBox.height).toBeLessThanOrEqual(vp2.height + 1);
      } else {
        expect(sheetBox.x, 'game stays visible left of the sheet').toBeGreaterThanOrEqual(
          vp2.width * 0.4,
        );
        expect(sheetBox.height).toBeGreaterThanOrEqual(vp2.height - 2);
      }
      await expect(page.getByTestId('buy')).toBeInViewport();
      const buy = (await page.getByTestId('buy').boundingBox())!;
      expect(buy.y + buy.height, 'Buy is on screen without scrolling').toBeLessThanOrEqual(
        vp2.height,
      );
      expect(buy.height, 'buy tap target').toBeGreaterThanOrEqual(40);
      expect((await page.getByTestId('shop-close').boundingBox())!.height).toBeGreaterThanOrEqual(
        36,
      );
      const tile = (await page.locator('[data-testid^="item-"]').first().boundingBox())!;
      expect(tile.width).toBeGreaterThanOrEqual(54);
      expect(tile.height).toBeGreaterThanOrEqual(44);
      expect(await overflow(page)).toBeLessThanOrEqual(0);
      await page.getByTestId('shop-close').tap();
      await expect(sheet).toHaveCount(0);

      await page.getByTestId('shop-toggle').tap();
      await expect(sheet).toBeVisible();
      const grip = (await page.locator('.sheet-grip').boundingBox())!;
      await page.mouse.move(grip.x + grip.width / 2, grip.y + grip.height / 2);
      await page.mouse.down();
      const sideways = v.name === 'landscape';
      await page.mouse.move(
        grip.x + grip.width / 2 + (sideways ? 40 : 0),
        grip.y + grip.height / 2 + (sideways ? 0 : 40),
        { steps: 4 },
      );
      await page.mouse.move(
        grip.x + grip.width / 2 + (sideways ? 140 : 0),
        grip.y + grip.height / 2 + (sideways ? 0 : 140),
        { steps: 4 },
      );
      await page.mouse.up();
      await expect(sheet).toHaveCount(0);

      await page.getByTestId('shop-toggle').tap();
      await expect(sheet).toBeVisible();
      await page.touchscreen.tap(Math.round(vp2.width * 0.15), Math.round(vp2.height * 0.3));
      await expect(sheet).toHaveCount(0);

      await page.evaluate(() => {
        const s = (
          window as unknown as {
            __session: { match: { step(n: number): number }; notify(): void };
          }
        ).__session;
        s.match.step(4900);
        s.notify();
      });
      await expect(page.getByTestId('report')).toBeVisible();
      await shot(page, `${v.name}-report`);
      expect(await overflow(page)).toBeLessThanOrEqual(0);
      await expect(page.locator('[data-testid^="report-hero-"]')).toHaveCount(10);
      await page.locator('[data-testid^="report-hero-"]').first().tap();
      if (page.viewportSize()!.width < 500) await page.locator('[data-testid^="open-hero-"]').tap();
      await expect(page.getByTestId('hero-view')).toBeVisible();
      await shot(page, `${v.name}-hero-view`);
      expect(errors).toEqual([]);
    });
  });
}
