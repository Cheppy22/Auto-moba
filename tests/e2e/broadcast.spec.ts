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

test('broadcast view: toggle, camera modes, follow, back to map', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error' && !/WebGL|GPU stall|GL Driver/i.test(m.text())) errors.push(m.text());
  });

  await startLive(page);
  await page.getByTestId('speed-0').click();
  await page.getByTestId('view-broadcast').click();
  await expect(page.getByTestId('broadcast')).toBeVisible();
  await expect(page.getByTestId('stage')).toBeHidden();
  await page.waitForTimeout(1500);
  const lit = await page.getByTestId('broadcast').screenshot();
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
  const box = (await page.getByTestId('broadcast').boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 120, box.y + box.height / 2 + 40, { steps: 6 });
  await page.mouse.up();
  await page.mouse.wheel(0, -400);

  await page.locator('[data-testid="roster-enemy"] .roster-cell').first().click();
  await expect(page.getByTestId('cam-follow')).toHaveClass(/on/);
  await page.getByTestId('cam-auto').click();
  await page.waitForTimeout(800);

  await page.getByTestId('view-map').click();
  await expect(page.getByTestId('broadcast')).toHaveCount(0);
  await expect(page.getByTestId('stage')).toBeVisible();
  expect(errors).toEqual([]);
});
