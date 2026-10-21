import { expect, test, type Page } from '@playwright/test';
import { openHand, pauseAtStart, watchErrors } from './helpers';

/**
 * Phase C of SPEC-GAMBITS-OPENINGS-2026-10-18: Setup page 3 with eight Opening rows, the Opening's
 * card in the hand (corner and pin), the versus card's "Opens with" line, Rules -> All cards.
 */

const SHAPES = [
  { name: '360', viewport: { width: 360, height: 740 }, touch: true },
  { name: '390', viewport: { width: 390, height: 844 }, touch: true },
  { name: 'landscape', viewport: { width: 844, height: 390 }, touch: true },
  { name: 'desktop', viewport: { width: 1280, height: 800 }, touch: false },
] as const;

const SHOTS = process.env.OPENING_SHOTS ?? '';
const shot = async (page: Page, name: string): Promise<void> => {
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/openings-${name}.png` });
};

async function toPageThree(page: Page, query = 'intro=off'): Promise<void> {
  await page.goto(`/?${query}`);
  await expect(page.getByTestId('title')).toBeVisible();
  await page.getByTestId('seed').fill('42');
  await page.getByTestId('start').click();
  await expect(page.getByTestId('setup')).toBeVisible();
  await pauseAtStart(page);
  await page.getByTestId('step-3').click();
  await expect(page.getByTestId('step-3')).toHaveAttribute('aria-current', 'step');
  // the pages slide: measure once the third has arrived
  await page.waitForTimeout(600);
}

const overflow = (page: Page): Promise<number> =>
  page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

for (const v of SHAPES) {
  test.describe(`openings ${v.name}`, () => {
    test.use({ viewport: v.viewport, hasTouch: v.touch });

    test('Setup page 3: eight compact rows, the verdict strip, Begin stays in view', async ({
      page,
    }) => {
      test.setTimeout(180_000);
      const errors = watchErrors(page);
      await toPageThree(page);
      const radios = page.locator('[data-testid^="opening-"][role="radio"]');
      await expect(radios).toHaveCount(8);
      await expect(page.getByTestId('opening-italian')).toHaveClass(/on/);
      await expect(page.getByTestId('opening-opens-sicilian')).toHaveText('Opens with Fork');
      await expect(page.getByTestId('opening-opens-caro_kann')).toHaveText('Opens with Fortify');
      await expect(page.getByTestId('opening-opens-italian')).toHaveText(
        'Opens with three schools',
      );
      // rows are big enough to tap and compact (about 56 px), never the old 100 px cards
      for (const el of await radios.all()) {
        const box = (await el.boundingBox())!;
        expect(box.height).toBeGreaterThanOrEqual(44);
        expect(box.height).toBeLessThanOrEqual(76);
        expect(box.x).toBeGreaterThanOrEqual(0);
        expect(box.x + box.width).toBeLessThanOrEqual(v.viewport.width);
      }
      expect(await overflow(page)).toBeLessThanOrEqual(0);
      // the pace switch and Begin stay on screen while the list scrolls
      await expect(page.getByTestId('begin')).toBeInViewport({ ratio: 1 });
      await shot(page, `setup-${v.name}`);
      // picking a row opens a one-line verdict strip of glyphs; only the picked row has one
      await page.getByTestId('opening-kings_indian').click();
      await expect(page.getByTestId('opening-kings_indian')).toHaveClass(/on/);
      const strip = page.getByTestId('opening-verdict-kings_indian');
      await expect(strip).toBeVisible();
      await expect(strip).toHaveAttribute('aria-label', /Good against Fortress/);
      await expect(strip).toHaveAttribute('aria-label', /Weak against Clock/);
      await expect(page.locator('[data-testid^="opening-verdict-"]')).toHaveCount(1);
      await shot(page, `setup-picked-${v.name}`);
      // More keeps the full explanation, now with the opening card and a first hand
      await page.getByTestId('opening-more-kings_indian').click();
      const body = page.getByTestId('opening-body-kings_indian');
      await expect(body).toContainText('Exchange');
      // the opened text scrolls into view (the row's own top stays on screen)
      await expect(body).toBeInViewport();
      await expect(page.getByTestId('opening-kings_indian')).toBeInViewport();
      await expect(body).toContainText('Example hands');
      await expect(page.getByTestId('opening-card-kings_indian')).toContainText('opening card');
      await expect(body.locator('.hcard.opening')).toHaveCount(3);
      await expect(body.locator('.hcard.opening').first()).toContainText('Exchange');
      await shot(page, `setup-more-${v.name}`);
      await expect(page.getByTestId('begin')).toBeInViewport({ ratio: 1 });
      expect(await overflow(page)).toBeLessThanOrEqual(0);
      expect(errors).toEqual([]);
    });
  });
}

test.describe('openings in play', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

  test('the pick is remembered; the card is in the hand with its corner and pin; the versus card says it', async ({
    page,
  }) => {
    test.setTimeout(240_000);
    const errors = watchErrors(page);
    await toPageThree(page, 'look=table');
    await page.getByTestId('opening-caro_kann').click();
    await page.getByTestId('begin').click();
    // the versus card names what each side opens with
    await expect(page.getByTestId('intro')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId('intro-opens-A')).toHaveText('Opens with Fortify');
    await expect(page.getByTestId('intro-opens-B')).toContainText('Opens with');
    await shot(page, 'versus-390');
    await page.getByTestId('intro-begin').click();
    await expect(page.getByTestId('hud')).toBeVisible();
    // the hand: Fortify in slot 0, brass "Opening" corner and an "Act 1" pin instead of an expiry bar
    await openHand(page);
    await expect(page.getByTestId('gambit-0')).toHaveAttribute('data-card', 'fortify');
    await expect(page.getByTestId('hand-opening-0')).toHaveText('Opening');
    await expect(page.getByTestId('hand-pin-0')).toHaveText('Act 1');
    await expect(page.locator('[data-testid="gambit-0"] .timer')).toHaveCount(0);
    await expect(page.locator('[data-testid="gambit-1"] .timer')).toHaveCount(1);
    await shot(page, 'hand-390');
    expect(errors).toEqual([]);
    // a reload remembers the Opening as the pre-filled pick
    await page.goto('/?intro=off');
    await page.getByTestId('start').click();
    await expect(page.getByTestId('setup')).toBeVisible();
    await page.getByTestId('step-3').click();
    await expect(page.getByTestId('opening-caro_kann')).toHaveClass(/on/);
  });
});

for (const v of [SHAPES[0], SHAPES[1], SHAPES[3]]) {
  test.describe(`rules all cards ${v.name}`, () => {
    test.use({ viewport: v.viewport, hasTouch: v.touch });

    test('six school chips, four cards each, fits the width', async ({ page }) => {
      test.setTimeout(120_000);
      await page.goto('/?intro=off');
      await page.getByTestId('rules-open').click();
      await expect(page.getByTestId('rules-page')).toBeVisible();
      await expect(page.getByTestId('rules-list')).toBeVisible();
      await expect(page.getByTestId('rule-opening-card')).toBeAttached();
      await page.getByTestId('rules-view-cards').click();
      await page.waitForTimeout(600);
      await expect(page.getByTestId('allcards')).toBeVisible();
      const chips = page.locator('[data-testid^="ac-chip-"]');
      await expect(chips).toHaveCount(6);
      for (const c of await chips.all()) {
        const box = (await c.boundingBox())!;
        expect(box.width).toBeGreaterThanOrEqual(44);
        expect(box.height).toBeGreaterThanOrEqual(44);
        expect(box.x + box.width).toBeLessThanOrEqual(v.viewport.width);
      }
      for (const school of ['march', 'initiative', 'fortress', 'sacrifice', 'position', 'clock']) {
        await page.getByTestId(`ac-chip-${school}`).click();
        await expect(page.getByTestId(`ac-school-${school}`).locator('.ac-card')).toHaveCount(4);
      }
      await expect(page.getByTestId('ac-card-increment')).toContainText('English Opening');
      await expect(page.getByTestId('ac-card-zugzwang')).toContainText('14 Tempo');
      expect(await overflow(page)).toBeLessThanOrEqual(0);
      await shot(page, `rules-cards-${v.name}`);
    });
  });
}
