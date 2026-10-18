import { expect, test, type Page } from '@playwright/test';

async function startLive(page: Page): Promise<void> {
  await page.goto('/');
  await page.getByTestId('seed').fill('42');
  await page.getByTestId('start').click();
  await page.locator('.hero-row [data-testid^="hero-"]').first().click();
  await page.getByTestId('lane-top').click();
  await page.getByTestId('begin').click();
  await page.locator('[data-testid^="upgrade-"]').first().click();
  await page.getByTestId('start-phase').click();
  const unspent = page.getByTestId('unspent-start');
  await expect(unspent.or(page.getByTestId('phase'))).toBeVisible();
  if (await unspent.isVisible()) await unspent.click();
  await expect(page.getByTestId('phase')).toHaveText('Phase 1');
}

test.use({ viewport: { width: 800, height: 520 } });

test('3D view: camera modes, follow, caption, shop pins', async ({ page }) => {
  test.setTimeout(300_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error' && !/WebGL|GPU stall|GL Driver/i.test(m.text())) errors.push(m.text());
  });

  await startLive(page);
  await page.getByTestId('speed-0').click();
  await expect(page.getByTestId('stage')).toBeVisible();
  await expect(page.getByTestId('no-webgl')).toHaveCount(0);
  await page.waitForTimeout(1500);
  const lit = await page.getByTestId('stage').screenshot();
  expect(lit.byteLength).toBeGreaterThan(20_000);

  await expect(async () => {
    await page.evaluate(() => {
      const s = (
        window as unknown as { __session: { match: { step(n: number): number }; notify(): void } }
      ).__session;
      s.match.step(40);
      s.notify();
    });
    await expect(page.getByTestId('caption')).toBeVisible({ timeout: 400 });
  }).toPass({ timeout: 60_000 });

  await page.getByTestId('cam-free').click();
  await expect(page.getByTestId('caption')).toHaveCount(0);
  const box = (await page.getByTestId('stage').boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 120, box.y + box.height / 2 + 40, { steps: 6 });
  await page.mouse.up();
  await page.mouse.wheel(0, -400);

  await page.locator('[data-testid="roster-enemy"] .roster-cell').first().click();
  await expect(page.getByTestId('cam-follow')).toHaveClass(/on/);
  await page.getByTestId('cam-auto').click();
  await page.waitForTimeout(800);

  await page.getByTestId('cam-free').click();
  const pin = page.locator('[data-testid^="shop-pin-"]:not([hidden])').first();
  await expect(pin).toBeVisible({ timeout: 30_000 });
  await expect(pin).toContainText('Stall');
  expect(errors).toEqual([]);
});

test('without WebGL the game shows a clear message instead of a picture', async ({ page }) => {
  await page.addInitScript(() => {
    const real = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (
      this: HTMLCanvasElement,
      ...args: Parameters<typeof real>
    ) {
      if (/webgl/i.test(String(args[0]))) return null;
      return real.apply(this, args);
    } as typeof real;
  });
  await startLive(page);
  const notice = page.getByTestId('no-webgl');
  await expect(notice).toBeVisible();
  await expect(notice).toContainText('WebGL');
  await expect(page.getByTestId('stage')).toBeHidden();
  await expect(page.getByTestId('player-card')).toBeVisible();
  await expect(page.getByTestId('speed-2')).toBeVisible();
});
