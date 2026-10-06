import { expect, test, type Page } from '@playwright/test';

async function canvasHasInk(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    const c = document.querySelector('canvas[data-testid="stage"]') as HTMLCanvasElement | null;
    if (!c) return false;
    const g = c.getContext('2d');
    if (!g) return false;
    const d = g.getImageData(0, 0, c.width, c.height).data;
    let lit = 0;
    for (let i = 0; i < d.length; i += 4 * 97) if (d[i] + d[i + 1] + d[i + 2] > 120) lit++;
    return lit > 20;
  });
}

test('draft, play a phase, read the report, start the next phase', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });

  await page.goto('/');
  await expect(page.getByTestId('title')).toBeVisible();
  await page.getByTestId('seed').fill('42');
  await page.getByTestId('start').click();

  await expect(page.getByTestId('draft')).toBeVisible();
  await expect(page.getByTestId('begin')).toBeDisabled();
  await page.getByTestId('hero-smelter').click();
  await page.getByTestId('lane-top').click();
  await page.getByTestId('begin').click();

  await expect(page.getByTestId('prep')).toBeVisible();
  await page.getByTestId('start-phase').click();
  await expect(page.locator('.toast, [style*="color: var(--bad)"]').first()).toBeVisible();
  await page.locator('[data-testid^="upgrade-"]').first().click();
  await page.getByTestId('tab-shop').click();
  await expect(page.getByTestId('shop')).toBeVisible();
  await page.getByTestId('start-phase').click();

  await expect(page.getByTestId('phase')).toHaveText('Phase 1');
  await page.getByTestId('speed-4').click();
  await page.getByTestId('posture-push').click();
  await page.waitForTimeout(1500);
  expect(await canvasHasInk(page)).toBe(true);
  await expect(page.getByTestId('player-card')).toBeVisible();

  await page.evaluate(() => {
    const s = (
      window as unknown as { __session: { match: { step(n: number): number }; notify(): void } }
    ).__session;
    s.match.step(4900);
    s.notify();
  });
  await expect(page.getByTestId('report')).toBeVisible();
  await page.getByTestId('continue').click();
  await expect(page.getByTestId('prep')).toBeVisible();
  await expect(page.getByText('Before phase 2')).toBeVisible();
  expect(errors).toEqual([]);
});
