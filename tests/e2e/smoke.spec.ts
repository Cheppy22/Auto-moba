import { expect, test } from '@playwright/test';

const benign = /WebGL|GPU stall|GL Driver/i;

test('draft, play a phase, read the report, start the next phase', async ({ page }) => {
  // the 3D view is slow in headless software rendering, so every step takes longer than it used to
  test.setTimeout(420_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error' && !benign.test(m.text())) errors.push(m.text());
  });

  await page.goto('/');
  await expect(page.getByTestId('title')).toBeVisible();
  await page.getByTestId('open-codex').click();
  await expect(page.getByTestId('codex')).toBeVisible();
  await expect(async () => {
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('codex')).toHaveCount(0, { timeout: 500 });
  }).toPass();
  await page.getByTestId('seed').fill('42');
  await page.getByTestId('start').click();

  await expect(page.getByTestId('draft')).toBeVisible();
  await expect(page.getByTestId('begin')).toBeDisabled();
  await expect(page.getByTestId('hero-detail')).toBeVisible();
  await page.locator('.hero-row [data-testid^="hero-"]').first().click();
  await page.getByTestId('lane-top').click();
  await page.getByTestId('begin').click();

  await expect(page.getByTestId('prep')).toBeVisible();
  await page.getByTestId('start-phase').click();
  await expect(page.locator('.toast, [style*="color: var(--bad)"]').first()).toBeVisible();
  await page.locator('[data-testid^="upgrade-"]').first().click();
  await page.getByTestId('tab-shop').click();
  await expect(page.getByTestId('shop')).toBeVisible();
  await page.getByTestId('cat-mind').click();
  await page.getByTestId('item-rusted_cleaver').click();
  await expect(page.getByTestId('item-detail')).toContainText('Rusted Cleaver');
  await page.getByTestId('buy').click();
  await expect(page.getByTestId('buy-confirm-box')).toBeVisible();
  await page.getByTestId('buy-confirm').click();
  await expect(page.locator('.slot.filled')).toHaveCount(1);
  await page.evaluate(() => {
    const s = (
      window as unknown as {
        __session: {
          match: {
            state: { playerHeroId: number };
            unitById(id: number): { hero: { gold: number } };
          };
          notify(): void;
        };
      }
    ).__session;
    s.match.unitById(s.match.state.playerHeroId).hero.gold = 1200;
    s.notify();
  });
  await page.getByTestId('start-phase').click();
  await expect(page.getByTestId('unspent-prompt')).toBeVisible();
  await page.getByTestId('unspent-start').click();

  await expect(page.getByTestId('phase')).toHaveText('Phase 1');
  await page.getByTestId('speed-4').click();
  const autoBuy = page.getByTestId('autobuy-toggle');
  await expect(autoBuy).toHaveAttribute('aria-pressed', 'true');
  await autoBuy.click();
  await expect(autoBuy).toHaveAttribute('aria-pressed', 'false');
  if (await page.getByTestId('farm-toggle').count()) {
    const farmBefore = await page.getByTestId('farm-toggle').getAttribute('aria-pressed');
    await page.getByTestId('farm-toggle').click();
    await expect(page.getByTestId('farm-toggle')).toHaveAttribute(
      'aria-pressed',
      farmBefore === 'true' ? 'false' : 'true',
    );
  }
  await expect(page.getByTestId('stage')).toBeVisible();
  await expect(page.getByTestId('no-webgl')).toHaveCount(0);
  await expect(page.getByTestId('stage')).toHaveJSProperty('tagName', 'CANVAS');
  await page.getByTestId('cam-free').click();
  const pin = page.locator('[data-testid^="shop-pin-"]:not([hidden])').first();
  await expect(pin).toBeVisible({ timeout: 60_000 });
  expect((await pin.boundingBox())!.height).toBeGreaterThanOrEqual(40);
  // the travel-time toast lasts a few seconds; software rendering is slow, so record it as it appears
  await page.evaluate(() => {
    const w = window as unknown as { __toasts: string[] };
    w.__toasts = [];
    new MutationObserver(() => {
      const t = document.querySelector('.toast.info')?.textContent;
      if (t) w.__toasts.push(t);
    }).observe(document.body, { childList: true, subtree: true, characterData: true });
  });
  await pin.click();
  await expect
    .poll(() => page.evaluate(() => (window as unknown as { __toasts: string[] }).__toasts[0]))
    .toMatch(/Stall: ~\d+s away/);
  await expect(page.getByTestId('suggest-chip')).toBeVisible();
  await page.getByRole('button', { name: 'Clear suggestions' }).click();
  await expect(page.getByTestId('suggest-chip')).toHaveCount(0);
  await page.getByTestId('recall-base').click();
  await expect(page.getByTestId('shop')).toBeVisible({ timeout: 20_000 });
  const frozen = await page.getByTestId('clock').textContent();
  await page.waitForTimeout(800);
  await expect(page.getByTestId('shop')).toBeVisible();
  expect(await page.getByTestId('clock').textContent()).toBe(frozen);
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('shop')).toHaveCount(0);
  await expect(page.getByTestId('player-card')).toBeVisible();

  await page.evaluate(() => {
    const s = (
      window as unknown as { __session: { match: { step(n: number): number }; notify(): void } }
    ).__session;
    s.match.step(4900);
    s.notify();
  });
  await expect(page.getByTestId('report')).toBeVisible();
  await expect(page.getByTestId('team-table')).toBeVisible();
  await page.locator('[data-testid^="report-hero-"]').first().click();
  await expect(page.getByTestId('hero-view')).toBeVisible();
  await expect(page.getByTestId('replay')).toBeVisible();
  await page.getByTestId('scrub').fill('1200');
  await page.getByTestId('back-team').click();
  await expect(page.getByTestId('team-table')).toBeVisible();
  await page.getByTestId('continue').click();
  await expect(page.getByTestId('prep')).toBeVisible();
  await expect(page.getByText('Before phase 2')).toBeVisible();
  expect(errors).toEqual([]);
});
