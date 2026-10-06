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
      await page.getByTestId('hero-smelter').tap();
      await page.getByTestId('lane-top').tap();
      await page.getByTestId('begin').scrollIntoViewIfNeeded();
      await page.getByTestId('begin').tap();

      await expect(page.getByTestId('prep')).toBeVisible();
      await shot(page, `${v.name}-prep`);
      expect(await overflow(page)).toBeLessThanOrEqual(0);
      await page.locator('[data-testid^="upgrade-"]').first().tap();
      await page.getByTestId('tab-shop').tap();
      await shot(page, `${v.name}-prep-shop`);
      await page.getByTestId('start-phase').scrollIntoViewIfNeeded();
      await page.getByTestId('start-phase').tap();

      await expect(page.getByTestId('phase')).toHaveText('Phase 1');
      await page.getByTestId('speed-4').tap();
      await page.waitForTimeout(1500);
      await shot(page, `${v.name}-hud`);
      expect(await overflow(page)).toBeLessThanOrEqual(0);
      await tallEnough(page, 'farm-toggle', 40);
      await tallEnough(page, 'recall-base', 40);
      await page.getByTestId('farm-toggle').tap();
      await page.getByTestId('shop-toggle').tap();
      await shot(page, `${v.name}-hud-shop`);
      await page.getByRole('button', { name: 'Close' }).tap();

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
      await page.locator('[data-testid^="report-hero-"]').first().tap();
      await expect(page.getByTestId('hero-view')).toBeVisible();
      await shot(page, `${v.name}-hero-view`);
      expect(errors).toEqual([]);
    });
  });
}
