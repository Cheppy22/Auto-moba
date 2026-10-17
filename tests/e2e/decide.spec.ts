import { expect, test } from '@playwright/test';
import { overflow, snap, startLive, stepUntil, watchErrors, type TestSession } from './helpers';

/** Steps to the first Act break, answering forks on the way, and opens the Relics tab. */
async function toRelics(page: import('@playwright/test').Page): Promise<void> {
  await page.evaluate(() => {
    const s = (window as unknown as { __session: TestSession }).__session;
    for (let i = 0; i < 800 && s.match.state.bell.stage !== 'break'; i++) {
      s.match.step(30);
      if (s.match.state.forks.length > 0) s.match.issue({ type: 'autoForks' });
    }
    s.notify();
  });
  await expect(page.getByTestId('break-sheet')).toBeVisible();
  await page.getByTestId('break-tab-relics').click();
}

for (const v of [
  { name: 'phone', viewport: { width: 390, height: 844 }, touch: true },
  { name: 'desktop', viewport: { width: 1440, height: 900 }, touch: false },
]) {
  test.describe(v.name, () => {
    test.use({ viewport: v.viewport, hasTouch: v.touch, isMobile: v.touch });

    test('relic cards show art, a plan headline and the numbers; a pick lands in the held row', async ({
      page,
    }) => {
      test.setTimeout(300_000);
      const errors = watchErrors(page);
      await startLive(page, '7');
      await toRelics(page);
      const offers = page.getByTestId('relic-offers').locator('article');
      await expect(offers).toHaveCount(3);
      const first = offers.first();
      const id = (await first.getAttribute('data-testid'))!.replace('relic-offer-', '');
      await expect(first.locator('svg.rcard-art')).toBeVisible();
      // the headline is the plan with real numbers; the ledger shows before → after
      await expect(page.getByTestId(`relic-headline-${id}`)).toHaveText(/\d/);
      const change = page.getByTestId(`relic-change-${id}`);
      await expect(change).toBeVisible();
      expect(await change.locator('.rrow').count()).toBeGreaterThan(0);
      await expect(change.locator('.rrow').first()).toContainText('→');
      const take = page.getByTestId(`relic-take-${id}`);
      expect((await take.boundingBox())!.height).toBeGreaterThanOrEqual(44);
      expect(await overflow(page)).toBeLessThanOrEqual(0);
      await take.click();
      await expect(page.getByTestId('relic-done')).toBeVisible();
      const held = page.getByTestId(`relic-held-${id}`);
      await expect(held).toBeVisible();
      await expect(held).toHaveAttribute('data-stamped', 'true', { timeout: 15_000 });
      await expect(page.locator('.rflight')).toHaveCount(0, { timeout: 15_000 });
      await expect(page.getByTestId('break-resume')).toBeEnabled();
      expect(errors).toEqual([]);
    });

    test('the fork sheet previews each option: model, plays-like line, stats before → after', async ({
      page,
    }) => {
      test.setTimeout(300_000);
      const errors = watchErrors(page);
      await startLive(page, '7');
      await stepUntil(page, { kind: 'fork' });
      const f = (await snap(page)).forks[0];
      await expect(page.getByTestId('forks')).toBeVisible();
      await expect(page.getByTestId('fork-preview')).toBeVisible();
      await expect(page.getByTestId('fork-plays')).not.toBeEmpty();
      // each tab changes the preview; an archetype always moves some stat
      const texts: string[] = [];
      for (const o of f.options) {
        await page.getByTestId(`fork-opt-${f.heroId}-${o.id}`).click();
        await expect(page.getByTestId(`fork-opt-${f.heroId}-${o.id}`)).toHaveAttribute(
          'aria-selected',
          'true',
        );
        await expect(page.getByTestId('fork-choose')).toContainText(
          f.kind === 'archetype' ? o.name : 'Choose',
        );
        if (f.kind === 'archetype') {
          await expect(page.getByTestId('fork-deltas').locator('.fs-delta').first()).toContainText(
            '→',
          );
          await expect(page.getByTestId('fork-skill')).toContainText('New skill');
        }
        texts.push((await page.getByTestId('fork-plays').textContent()) ?? '');
      }
      expect(new Set(texts).size).toBe(f.options.length);
      // the 3D portrait of the new look arrives (software WebGL in tests)
      await expect(page.locator('.fs-model img')).toBeVisible({ timeout: 20_000 });
      expect(await overflow(page)).toBeLessThanOrEqual(0);
      const pick = f.options[f.options.length - 1];
      await page.getByTestId(`fork-opt-${f.heroId}-${pick.id}`).click();
      await page.getByTestId('fork-choose').click();
      await expect
        .poll(async () => (await snap(page)).forks.some((x) => x.heroId === f.heroId))
        .toBe(false);
      expect(errors).toEqual([]);
    });
  });
}
