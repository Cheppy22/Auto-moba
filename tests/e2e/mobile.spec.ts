import { expect, test, type Page } from '@playwright/test';
import {
  boxOf,
  overflow,
  pauseAtStart,
  setTempo,
  snap,
  stepUntil,
  watchErrors,
  viewReady,
} from './helpers';

const shots = process.env.SHOTS_DIR;

async function shot(page: Page, name: string): Promise<void> {
  if (shots) await page.screenshot({ path: `${shots}/${name}.png` });
}

/** Every tap target is at least 40 CSS pixels each way. */
async function bigEnough(page: Page, id: string, min = 40): Promise<void> {
  const box = await boxOf(page, id);
  expect(box.height, `${id} height`).toBeGreaterThanOrEqual(min);
  expect(box.width, `${id} width`).toBeGreaterThanOrEqual(min);
}

/** The middle of the screen shows the 3D view, not a HUD element. */
async function centreIsMap(page: Page): Promise<void> {
  const cls = await page.evaluate(
    () => document.elementFromPoint(window.innerWidth / 2, window.innerHeight / 2)?.className ?? '',
  );
  expect(String(cls), 'element in the middle of the screen').toContain('game-canvas');
}

const views = [
  { name: 'portrait', viewport: { width: 390, height: 844 } },
  { name: 'landscape', viewport: { width: 844, height: 390 } },
];

for (const v of views) {
  test.describe(v.name, () => {
    test.use({ viewport: v.viewport, hasTouch: true, isMobile: true });

    test('setup, live HUD, aim, fork, adjourn and the end screen fit and can be tapped', async ({
      page,
    }) => {
      test.setTimeout(900_000);
      const errors = watchErrors(page);
      const vp = page.viewportSize()!;

      // ---- setup board
      await page.goto('/');
      await expect(page.getByTestId('title')).toBeVisible();
      await shot(page, `${v.name}-title`);
      expect(await overflow(page)).toBeLessThanOrEqual(0);
      await page.getByTestId('seed').fill('42');
      await page.getByTestId('start').tap();
      await expect(page.getByTestId('setup')).toBeVisible();
      await shot(page, `${v.name}-setup`);
      expect(await overflow(page)).toBeLessThanOrEqual(0);
      await expect(page.getByTestId('begin')).toBeInViewport({ ratio: 1 });
      await expect(page.getByTestId('lane-board')).toBeInViewport({ ratio: 1 });
      for (const id of ['begin', 'zone-top', 'zone-mid', 'zone-bot', 'chip-king', 'chip-queen']) {
        await bigEnough(page, id);
      }
      for (const el of await page.locator('[data-testid^="style-"][role="radio"]').all())
        expect((await el.boundingBox())!.height).toBeGreaterThanOrEqual(40);
      for (const el of await page.locator('[data-testid^="path-"][role="radio"]').all())
        expect((await el.boundingBox())!.height).toBeGreaterThanOrEqual(40);
      await page.getByTestId('chip-king').tap();
      await page.getByTestId('zone-mid').tap();
      await expect(page.getByTestId('zone-mid')).toContainText('King');
      await pauseAtStart(page);
      await page.getByTestId('begin').tap();

      // ---- live HUD
      await expect(page.getByTestId('hud')).toBeVisible();
      await viewReady(page);
      await page.waitForTimeout(1000);
      await shot(page, `${v.name}-hud`);
      expect(await overflow(page)).toBeLessThanOrEqual(0);
      await centreIsMap(page);
      for (const id of [
        'gambit-0',
        'gambit-1',
        'gambit-2',
        'field-pawn',
        'tempo',
        'adjourn',
        'speed-0',
        'speed-1',
        'speed-2',
        'speed-4',
        'speed-8',
        'cam-auto',
        'cam-follow',
        'cam-free',
        'roster-A-king',
        'roster-A-knight',
        'roster-B-king',
        'roster-B-knight',
      ]) {
        await expect(page.getByTestId(id), `${id} in the viewport`).toBeInViewport({ ratio: 1 });
      }
      for (const id of ['gambit-0', 'gambit-1', 'gambit-2', 'field-pawn', 'adjourn']) {
        await bigEnough(page, id);
      }
      for (const id of ['0', '1', '2', '4', '8']) await bigEnough(page, `speed-${id}`);
      for (const id of ['auto', 'follow', 'free']) await bigEnough(page, `cam-${id}`);
      for (const piece of ['king', 'queen', 'rook', 'bishop', 'knight']) {
        await bigEnough(page, `roster-A-${piece}`);
        await bigEnough(page, `roster-B-${piece}`);
      }
      // the five rank pips and numeral are on every portrait
      await expect(page.locator('[data-testid="roster"] .rank-pips i')).toHaveCount(40);
      // the hand never covers the Field Pawn button or the Tempo meter
      const hand = await boxOf(page, 'hand');
      const pawn = await boxOf(page, 'field-pawn');
      const tempo = await boxOf(page, 'tempo');
      for (const b of [pawn, tempo]) {
        const apart =
          b.y >= hand.y + hand.height - 1 ||
          b.x >= hand.x + hand.width - 1 ||
          b.x + b.width <= hand.x + 1;
        expect(apart, 'hand and Tempo/Pawn do not overlap').toBe(true);
      }

      // ---- aim a lane gambit with taps
      const s = await stepUntil(page, { kind: 'card', target: 'lane' });
      const slot = s.hand.find((c) => c.target === 'lane' && c.usable)!.slot;
      await page.getByTestId(`gambit-${slot}`).tap();
      await expect(page.getByTestId('aim')).toBeVisible();
      await shot(page, `${v.name}-aim-lane`);
      for (const id of ['aim-top', 'aim-mid', 'aim-bot']) {
        await expect(page.getByTestId(id)).toBeInViewport({ ratio: 1 });
        const box = await boxOf(page, id);
        expect(box.height, `${id} is a big button`).toBeGreaterThanOrEqual(52);
        expect(box.width).toBeGreaterThanOrEqual(64);
      }
      await bigEnough(page, 'aim-cancel');
      await centreIsMap(page);
      expect(await overflow(page)).toBeLessThanOrEqual(0);
      await page.getByTestId('aim-cancel').tap();
      await expect(page.getByTestId('aim')).toHaveCount(0);

      // ---- point aim: the next tap on the 3D view plays the card
      const pt = await stepUntil(page, { kind: 'card', target: 'point' });
      await page
        .getByTestId(`gambit-${pt.hand.find((c) => c.target === 'point' && c.usable)!.slot}`)
        .tap();
      await expect(page.getByTestId('aim-hint')).toContainText('Tap the board');
      await shot(page, `${v.name}-aim-point`);
      await page.touchscreen.tap(vp.width / 2, vp.height / 2);
      await expect(page.getByTestId('aim')).toHaveCount(0);

      // ---- field a pawn
      await setTempo(page, 60);
      await page.getByTestId('field-pawn').tap();
      await expect(page.getByTestId('aim-bot')).toBeVisible();
      await page.getByTestId('aim-bot').tap();
      await expect(page.getByTestId('pawn-count')).toContainText('1/8');

      // ---- forks stack above the hand without covering the middle of the screen
      await stepUntil(page, { kind: 'fork' });
      await expect(page.getByTestId('forks')).toBeVisible();
      await page.waitForTimeout(500);
      await shot(page, `${v.name}-forks`);
      expect(await overflow(page)).toBeLessThanOrEqual(0);
      await centreIsMap(page);
      const forks = await page.locator('.fork:not(.strip)').all();
      expect(forks.length).toBeGreaterThan(0);
      for (const f of forks) await expect(f).toBeInViewport({ ratio: 1 });
      for (const o of await page.locator('.fork-opt').all()) {
        await expect(o).toBeInViewport({ ratio: 1 });
        expect((await o.boundingBox())!.height).toBeGreaterThanOrEqual(40);
      }
      const first = (await snap(page)).forks[0];
      await page.getByTestId(`fork-opt-${first.heroId}-${first.options[0].id}`).tap();
      await expect
        .poll(async () =>
          (await snap(page)).forks.some((f) => f.heroId === first.heroId && f.rank === first.rank),
        )
        .toBe(false);

      // ---- Adjourn fits the screen
      await page.getByTestId('adjourn').tap();
      await expect(page.getByTestId('adjourn-panel')).toBeVisible();
      await page.waitForTimeout(500);
      await shot(page, `${v.name}-adjourn`);
      expect(await overflow(page)).toBeLessThanOrEqual(0);
      await expect(page.getByTestId('resume')).toBeInViewport({ ratio: 1 });
      await bigEnough(page, 'resume');
      for (const t of ['lanes', 'paths', 'armory']) await bigEnough(page, `tab-${t}-btn`);
      const panel = (await page.locator('.adjourn-panel').boundingBox())!;
      expect(panel.y).toBeGreaterThanOrEqual(0);
      expect(panel.y + panel.height).toBeLessThanOrEqual(vp.height + 1);
      expect(panel.x + panel.width).toBeLessThanOrEqual(vp.width + 1);
      await page.getByTestId('tab-armory-btn').tap();
      await expect(page.getByTestId('tab-armory')).toBeVisible();
      await shot(page, `${v.name}-armory`);
      await page.getByTestId('tab-paths-btn').tap();
      await page.getByTestId('setpath-king-defense').tap();
      await expect(page.getByTestId('setpath-king-defense')).toHaveAttribute(
        'aria-checked',
        'true',
      );
      await page.getByTestId('tab-lanes-btn').tap();
      await page.getByTestId('resume').tap();
      await expect(page.getByTestId('adjourn-panel')).toHaveCount(0);

      // ---- the end screen
      await stepUntil(page, { kind: 'end' }, 1500, 80);
      await expect(page.getByTestId('report')).toBeVisible();
      await expect(page.getByTestId('winner')).toHaveText(/Checkmate: (White|Black) wins/);
      await shot(page, `${v.name}-end`);
      expect(await overflow(page)).toBeLessThanOrEqual(0);
      await expect(page.locator('[data-testid^="report-hero-"]')).toHaveCount(10);
      await page.locator('[data-testid^="report-hero-"]').first().tap();
      if (vp.width < 500) await page.locator('[data-testid^="open-hero-"]').tap();
      await expect(page.getByTestId('hero-view')).toBeVisible();
      expect(errors).toEqual([]);
    });
  });
}
