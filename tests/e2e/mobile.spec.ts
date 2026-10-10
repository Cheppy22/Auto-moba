import { expect, test, type Page } from '@playwright/test';
import {
  boxOf,
  overflow,
  pauseAtStart,
  playPast,
  setSpeed,
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
      for (const el of await page.locator('[data-testid^="opening-"][role="radio"]').all())
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
        'speed-chip',
        'cam-btn',
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
      for (const id of ['speed-chip', 'cam-btn']) await bigEnough(page, id);
      for (const piece of ['king', 'queen', 'rook', 'bishop', 'knight']) {
        await bigEnough(page, `roster-A-${piece}`);
        await bigEnough(page, `roster-B-${piece}`);
      }
      // calm HUD: a rank numeral on every portrait of both teams, no pips, no emblem until Rank 4
      await expect(page.locator('.roster .rank-pips')).toHaveCount(0);
      await expect(page.locator('.roster .rank-num')).toHaveCount(10);
      await expect(page.locator('.roster .style-badge')).toHaveCount(0);
      // the gambit cards show a name and a cost only
      await expect(page.locator('.gcard .gdesc')).toHaveCount(0);
      // the speed chip and the camera button each replace a row of buttons
      const topH = (await boxOf(page, 'adjourn')).y + (await boxOf(page, 'adjourn')).height;
      expect(topH, 'one slim row on top').toBeLessThanOrEqual(64);
      const firstCell = await boxOf(page, 'roster-A-king');
      expect(firstCell.y, 'the roster sits right under the top row').toBeLessThanOrEqual(68);
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

      // ---- the piece card: tap a Black portrait to follow, tap again for the card
      await page.getByTestId('roster-B-queen').tap();
      await expect(page.getByTestId('unit-card')).toHaveCount(0);
      await page.getByTestId('roster-B-queen').tap();
      await expect(page.getByTestId('unit-card')).toBeVisible();
      await expect(page.getByTestId('unit-card-style')).not.toBeEmpty();
      await page.waitForTimeout(400);
      await shot(page, `${v.name}-card`);
      await expect(page.getByTestId('unit-card')).toBeInViewport({ ratio: 1 });
      await bigEnough(page, 'unit-card-close');
      expect(await overflow(page)).toBeLessThanOrEqual(0);
      await centreIsMap(page);
      await page.getByTestId('unit-card-close').tap();
      await expect(page.getByTestId('unit-card')).toHaveCount(0);
      await page.getByTestId('cam-btn').tap();
      await page.getByTestId('cam-btn').tap();
      await expect(page.getByTestId('cam-btn')).toHaveAttribute('data-mode', 'auto');

      // ---- a fork pauses the match and opens a sheet that fits and can be tapped
      await stepUntil(page, { kind: 'fork' });
      await expect(page.getByTestId('forks')).toBeVisible();
      await page.waitForTimeout(500);
      await shot(page, `${v.name}-forks`);
      expect(await overflow(page)).toBeLessThanOrEqual(0);
      await expect(page.getByTestId('forks')).toBeInViewport({ ratio: 1 });
      for (const o of await page.locator('.fs-opt').all()) {
        await expect(o).toBeInViewport({ ratio: 1 });
        expect((await o.boundingBox())!.height).toBeGreaterThanOrEqual(40);
      }
      await expect(page.getByTestId('fork-auto')).toBeInViewport({ ratio: 1 });
      await bigEnough(page, 'fork-auto');
      // the sheet leaves the middle of the screen to the piece that is choosing
      const sheetBox = await boxOf(page, 'forks');
      if (v.name === 'portrait') expect(sheetBox.y).toBeGreaterThan(vp.height / 2);
      else expect(sheetBox.x).toBeGreaterThanOrEqual(vp.width / 2 - 8);
      // the clock is frozen even at 1x
      await setSpeed(page, 1);
      const held = (await snap(page)).tick;
      await page.waitForTimeout(700);
      expect((await snap(page)).tick).toBe(held);
      const first = (await snap(page)).forks[0];
      await page.getByTestId(`fork-opt-${first.heroId}-${first.options[0].id}`).tap();
      await expect
        .poll(async () =>
          (await snap(page)).forks.some((f) => f.heroId === first.heroId && f.rank === first.rank),
        )
        .toBe(false);
      // choosing resumes play (other pieces may be waiting: "Let the AI choose" answers them)
      await setSpeed(page, 0);
      while ((await snap(page)).forks.length > 0) await page.getByTestId('fork-auto').tap();
      await expect(page.getByTestId('forks')).toHaveCount(0);
      await setSpeed(page, 1);
      await playPast(page, held);
      await setSpeed(page, 0);
      if ((await snap(page)).forks.length > 0) await page.getByTestId('fork-auto').tap();
      await expect(page.getByTestId('forks')).toHaveCount(0);
      await centreIsMap(page);
      expect(await overflow(page)).toBeLessThanOrEqual(0);

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
      await expect(page.getByTestId('winner')).toHaveText(/Checkmate · (White|Black) wins/);
      await shot(page, `${v.name}-end`);
      expect(await overflow(page)).toBeLessThanOrEqual(0);
      await expect(page.locator('[data-testid^="report-hero-"]')).toHaveCount(10);
      await bigEnough(page, 'report-tab-result');
      await page.getByTestId('report-tab-pieces').tap();
      await expect(page.getByTestId('hero-view')).toBeVisible();
      expect(errors).toEqual([]);
    });
  });
}
