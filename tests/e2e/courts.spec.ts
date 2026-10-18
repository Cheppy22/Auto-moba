import { expect, test, type Page } from '@playwright/test';
import { overflow, startLive, viewReady, watchErrors } from './helpers';

const shots = process.env.SHOTS_DIR;

async function shot(page: Page, name: string): Promise<void> {
  if (!shots) return;
  // wait for the 3D portraits (and their fade-in) before the picture is taken
  await page
    .locator('[data-testid="court-portrait"] img')
    .first()
    .waitFor({ timeout: 15_000 })
    .catch(() => undefined);
  await page.waitForTimeout(700);
  await page.screenshot({ path: `${shots}/aaa-courts-${name}.png` });
}

/** The portrait niche has drawn its figure (an image), not just the glyph that stands in. */
async function portraitDrawn(page: Page, scope: string): Promise<void> {
  await expect(page.locator(`${scope} [data-testid="court-portrait"] img`).first()).toBeVisible({
    timeout: 15_000,
  });
}

/** Title -> Tournament (seed 7) -> Draw. */
async function openDraw(page: Page, query = '?intro=off&run=test'): Promise<void> {
  await page.goto(`/${query}`);
  await page.getByTestId('seed').fill('7');
  await page.getByTestId('tournament').click();
  await expect(page.getByTestId('draw')).toBeVisible();
}

const courtNames = (page: Page): Promise<string[]> =>
  page.locator('[data-testid^="rung-name-"]').allInnerTexts();

test('the Draw shows a named court: seal, portrait, motto, Opening, archetypes and signature relic', async ({
  page,
}) => {
  const errors = watchErrors(page);
  await openDraw(page);
  const now = page.getByTestId('rung-1');
  await expect(now.locator('svg.heraldic-seal')).toHaveCount(1);
  await portraitDrawn(page, '[data-testid="rung-1"]');
  await expect(page.getByTestId('rung-motto-1')).not.toBeEmpty();
  await expect(now.locator('.opening-line')).toBeVisible();
  await expect(now.getByTestId('court-styles').locator('li')).toHaveCount(5);
  await expect(now.getByTestId('court-first-moves').locator('li')).toHaveCount(5);
  await expect(now.getByTestId('signature-relic')).toBeVisible();
  // the later rounds show their name, motto and seal
  for (const i of [2, 3, 4]) {
    await expect(page.getByTestId(`rung-name-${i}`)).not.toBeEmpty();
    await expect(page.getByTestId(`rung-motto-${i}`)).not.toBeEmpty();
    await expect(page.getByTestId(`rung-${i}`).locator('svg.heraldic-seal')).toHaveCount(1);
  }
  const names = await courtNames(page);
  expect(new Set(names).size).toBe(4);
  await shot(page, 'draw');
  expect(errors).toEqual([]);
});

test('the versus card shows the court: portrait, seal, motto and its starting relics', async ({
  page,
}) => {
  test.setTimeout(120_000);
  const errors = watchErrors(page);
  await openDraw(page, '?run=test');
  await page.getByTestId('draw-setup').click();
  await expect(page.getByTestId('setup')).toBeVisible();
  await page.evaluate(() =>
    (window as unknown as { __session: { setUi(p: unknown): void } }).__session.setUi({ speed: 0 }),
  );
  await page.getByTestId('quick-start').click();
  await expect(page.getByTestId('intro')).toBeVisible();
  const head = page.getByTestId('intro-opening-B');
  await expect(head.locator('svg.heraldic-seal')).toBeVisible();
  await expect(head.getByTestId('intro-court-motto')).not.toBeEmpty();
  await portraitDrawn(page, '[data-testid="intro-opening-B"]');
  await expect(page.getByTestId('intro-relics-B')).toBeVisible();
  await shot(page, 'versus');
  expect(errors).toEqual([]);
});

test('Spoils shows the next opponent as a named court', async ({ page }) => {
  test.setTimeout(120_000);
  const errors = watchErrors(page);
  await openDraw(page);
  await page.getByTestId('draw-setup').click();
  await page.evaluate(() =>
    (window as unknown as { __session: { setUi(p: unknown): void } }).__session.setUi({ speed: 0 }),
  );
  await page.getByTestId('quick-start').click();
  await expect(page.getByTestId('hud')).toBeVisible();
  await viewReady(page);
  await page.evaluate(() =>
    (window as unknown as { __session: { testEnd(w: 'A'): void } }).__session.testEnd('A'),
  );
  await page.getByTestId('run-next').click();
  const next = page.getByTestId('next-court');
  await expect(next).toBeVisible();
  await expect(next.locator('svg.heraldic-seal')).toBeVisible();
  await expect(next.getByTestId('court-motto')).not.toBeEmpty();
  await expect(next.getByTestId('signature-relic')).toBeVisible();
  await portraitDrawn(page, '[data-testid="next-court"]');
  await shot(page, 'spoils');
  expect(errors).toEqual([]);
});

test('seal sheet: all ten courts', async ({ page }) => {
  test.skip(!shots, 'screenshots only');
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/?intro=off');
  await page.addStyleTag({
    content: `
      body > *:not(#sheet) { display: none !important; }
      #sheet { position: fixed; inset: 0; z-index: 99; overflow: auto; background: #14100c; padding: 28px 36px; color: #efe6d2; font-family: var(--font-body); }
      .seal-sheet { display: grid; grid-template-columns: repeat(5, 1fr); gap: 30px 18px; }
      .sheet-court { margin: 0; display: grid; gap: 10px; justify-items: center; text-align: center; }
      .sheet-art { position: relative; width: 128px; height: 160px; margin: 0 44px 8px 0; }
      .sheet-art .heraldic-seal { position: absolute; right: -44px; bottom: -12px; }
      figcaption { display: grid; gap: 3px; max-width: 220px; }
      figcaption span { font-family: var(--font-display); color: #c9a35a; font-size: 14px; }
      figcaption b { font-family: var(--font-display); font-weight: 400; font-size: 18px; }
      figcaption i { font-size: 13px; color: #cbbd9f; }
    `,
  });
  await page.evaluate(async () => {
    const el = document.createElement('div');
    el.id = 'sheet';
    document.body.appendChild(el);
    const path = '/tests/e2e/fixtures/sealSheet.tsx';
    const mod = (await import(/* @vite-ignore */ path)) as {
      mountSheet(el: HTMLElement): void;
    };
    mod.mountSheet(el);
  });
  await expect(page.locator('.sheet-court')).toHaveCount(10);
  await expect(page.locator('#sheet [data-testid="court-portrait"] img')).toHaveCount(10, {
    timeout: 60_000,
  });
  await shot(page, 'seals');
});

test('an Exhibition is unchanged: Black, no court furniture', async ({ page }) => {
  const errors = watchErrors(page);
  await startLive(page, '42');
  await expect(page.locator('.v2-label')).toHaveText('Black');
  await expect(page.locator('svg.heraldic-seal')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test.describe('on a phone', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test('the Draw and the versus card show the court and fit the screen', async ({ page }) => {
    test.setTimeout(120_000);
    const errors = watchErrors(page);
    await openDraw(page, '?run=test');
    await portraitDrawn(page, '[data-testid="rung-1"]');
    expect(await overflow(page)).toBeLessThanOrEqual(0);
    await shot(page, 'draw-phone');
    await page.getByTestId('draw-setup').click();
    await expect(page.getByTestId('setup')).toBeVisible();
    await page.evaluate(() =>
      (window as unknown as { __session: { setUi(p: unknown): void } }).__session.setUi({
        speed: 0,
      }),
    );
    await page.getByTestId('quick-start').click();
    await expect(page.getByTestId('intro')).toBeVisible();
    await portraitDrawn(page, '[data-testid="intro-opening-B"]');
    // the court's header stays inside the card
    const head = (await page.getByTestId('intro-opening-B').boundingBox())!;
    expect(head.x + head.width).toBeLessThanOrEqual(390);
    expect(await overflow(page)).toBeLessThanOrEqual(0);
    await shot(page, 'versus-phone');
    expect(errors).toEqual([]);
  });
});
