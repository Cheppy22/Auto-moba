import { expect, test } from '@playwright/test';
import {
  eventCount,
  pauseAtStart,
  setTempo,
  snap,
  startLive,
  step,
  stepUntil,
  watchErrors,
} from './helpers';

test('title, setup, gambits, pawn, fork, adjourn, checkmate and report', async ({ page }) => {
  // the 3D view is slow in headless software rendering, so every step takes longer than it used to
  test.setTimeout(900_000);
  const errors = watchErrors(page);

  // ---- title -> setup board
  await page.goto('/');
  await expect(page.getByTestId('title')).toBeVisible();
  await page.getByTestId('seed').fill('42');
  await page.getByTestId('start').click();
  await expect(page.getByTestId('setup')).toBeVisible();
  await expect(page.locator('[data-testid^="piece-"]')).toHaveCount(5);
  for (const piece of ['king', 'queen', 'rook', 'bishop', 'knight']) {
    await expect(page.locator(`[data-testid^="style-${piece}-"]`)).toHaveCount(3);
    await expect(page.locator(`[data-testid^="path-${piece}-"]`)).toHaveCount(3);
  }
  await expect(page.getByTestId('zone-top')).toContainText('2/2');
  await expect(page.getByTestId('zone-mid')).toContainText('1/1');
  await expect(page.getByTestId('zone-bot')).toContainText('2/2');
  // everything is pre-filled: exactly one style and one path is on for each piece
  await expect(page.locator('.piece-card .styles .on')).toHaveCount(5);
  await expect(page.locator('.piece-card .paths .on')).toHaveCount(5);
  // pick a style and a path, then swap the King into Mid
  await page.getByTestId('style-king-sovereign').click();
  await expect(page.getByTestId('style-king-sovereign')).toHaveClass(/on/);
  await expect(page.getByTestId('style-desc-king')).toContainText('ranged scepter');
  await page.getByTestId('path-queen-utility').click();
  await expect(page.getByTestId('path-queen-utility')).toHaveClass(/on/);
  await page.getByTestId('chip-king').click();
  await page.getByTestId('zone-mid').click();
  await expect(page.getByTestId('zone-mid')).toContainText('King');
  await expect(page.getByTestId('piece-king')).toContainText('Mid');
  await pauseAtStart(page);
  await page.getByTestId('begin').click();

  // ---- live HUD
  await expect(page.getByTestId('hud')).toBeVisible();
  await expect(page.getByTestId('stage')).toHaveAttribute('data-ready', 'true', {
    timeout: 60_000,
  });
  await expect(page.getByTestId('speed-0')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('phase')).toHaveText('Act 1');
  await expect(page.getByTestId('stage')).toBeVisible();
  await expect(page.getByTestId('no-webgl')).toHaveCount(0);
  await expect(page.locator('[data-testid="roster"] .roster-cell')).toHaveCount(5);
  await expect(page.locator('[data-testid="roster-enemy"] .roster-cell')).toHaveCount(5);
  await expect(page.getByTestId('roster-A-king')).toHaveAttribute('aria-label', /Sovereign.*Mid/);
  await expect(page.getByTestId('roster-A-king')).toHaveAttribute('data-rank', '1');
  await expect(page.locator('[data-testid^="gambit-"]')).toHaveCount(3);
  await expect(page.getByTestId('tempo-value')).toHaveText('30');
  await expect(page.getByTestId('pawn-count')).toContainText('0/8 · 15');
  await expect(page.getByTestId('status-A')).toHaveAttribute('data-state', '');

  // ---- a lane gambit: tap the card, then a lane
  let s = await stepUntil(page, { kind: 'card', target: 'lane' });
  const laneSlot = s.hand.find((c) => c.target === 'lane' && c.usable)!.slot;
  const before = await eventCount(page, 'gambit');
  await page.getByTestId(`gambit-${laneSlot}`).click();
  await expect(page.getByTestId('aim')).toBeVisible();
  await expect(page.getByTestId('aim-top')).toBeVisible();
  await expect(page.getByTestId('aim-mid')).toBeVisible();
  await expect(page.getByTestId('aim-bot')).toBeVisible();
  await page.getByTestId('aim-cancel').click();
  await expect(page.getByTestId('aim')).toHaveCount(0);
  await page.getByTestId(`gambit-${laneSlot}`).click();
  await page.getByTestId('aim-mid').click();
  await expect(page.getByTestId('aim')).toHaveCount(0);
  expect(await eventCount(page, 'gambit')).toBe(before + 1);
  await expect(page.getByTestId(`gambit-${laneSlot}`)).toHaveAttribute('data-empty', 'true');

  // ---- a point gambit: tap the card, then the 3D view
  await setTempo(page, 100);
  s = await stepUntil(page, { kind: 'card', target: 'point' });
  const pointSlot = s.hand.find((c) => c.target === 'point' && c.usable)!.slot;
  await page.getByTestId(`gambit-${pointSlot}`).click();
  await expect(page.getByTestId('aim-hint')).toContainText('Tap the board');
  const vp = page.viewportSize()!;
  await page.mouse.click(vp.width / 2, vp.height / 2);
  await expect.poll(() => eventCount(page, 'gambit')).toBe(before + 2);
  await expect(page.getByTestId('aim')).toHaveCount(0);

  // ---- a card that cannot be played says why, and the sim's refusal shows as a toast
  await setTempo(page, 0);
  s = await snap(page);
  const idle = s.hand.find((c) => c.cardId !== '' && !c.usable)!;
  await expect(page.getByTestId(`gambit-${idle.slot}`)).toHaveAttribute('data-usable', 'false');
  await expect(page.getByTestId(`gambit-${idle.slot}`)).toContainText(/Tempo|down/);
  // a card that cannot be played is aria-disabled but still answers a tap with the reason
  await page.getByTestId(`gambit-${idle.slot}`).click({ force: true });
  await expect(page.getByTestId('toast')).toBeVisible();
  await page.getByTestId('field-pawn').click({ force: true });
  await expect(page.getByTestId('toast')).toContainText('Not enough Tempo');
  await expect(page.getByTestId('aim')).toHaveCount(0);

  // ---- field a pawn: Field Pawn, then a lane
  await setTempo(page, 60);
  await page.getByTestId('field-pawn').click();
  await expect(page.getByTestId('aim')).toBeVisible();
  await page.getByTestId('aim-top').click();
  await expect(page.getByTestId('pawn-count')).toContainText('1/8 · 15');
  await expect(page.getByTestId('tempo-value')).toHaveText('45');
  expect(await eventCount(page, 'pawnFielded')).toBe(1);

  // ---- a fork: answer it from its card
  s = await stepUntil(page, { kind: 'fork' });
  await expect(page.getByTestId('forks')).toBeVisible();
  const fork = s.forks[0];
  await expect(page.getByTestId(`fork-ring-${fork.heroId}`)).toBeVisible();
  await page.getByTestId(`fork-opt-${fork.heroId}-${fork.options[1].id}`).click();
  await expect
    .poll(async () =>
      (await snap(page)).forks.some((f) => f.heroId === fork.heroId && f.rank === fork.rank),
    )
    .toBe(false);
  const picked = await page.evaluate(
    (id) =>
      (
        window as unknown as {
          __session: { match: { events: { type: string; payload: Record<string, unknown> }[] } };
        }
      ).__session.match.events.some(
        (e) => e.type === 'fork' && e.payload.optionId === id && e.payload.auto === false,
      ),
    fork.options[1].id,
  );
  expect(picked).toBe(true);

  // ---- camera: tap a portrait to follow that piece
  await page.getByTestId('roster-A-queen').click();
  await expect(page.getByTestId('cam-follow')).toHaveAttribute('aria-pressed', 'true');
  await page.getByTestId('cam-auto').click();

  // ---- Adjourn: the clock stops, lanes and paths change, the Armory is readable, Resume goes on
  await page.getByTestId('speed-2').click();
  await expect
    .poll(async () => (await snap(page)).tick, { timeout: 30_000 })
    .toBeGreaterThan(s.tick + 40);
  await page.getByTestId('adjourn').click();
  await expect(page.getByTestId('adjourn-panel')).toBeVisible();
  const frozen = (await snap(page)).tick;
  await page.waitForTimeout(1200);
  expect((await snap(page)).tick).toBe(frozen);
  await page.getByTestId('adjourn-board').getByTestId('chip-knight').click();
  await page.getByTestId('adjourn-board').getByTestId('zone-bot').click();
  await expect(page.getByTestId('adjourn-board').getByTestId('zone-bot')).toContainText('Knight');
  await page.getByTestId('tab-paths-btn').click();
  await page.getByTestId('setpath-queen-offense').click();
  await expect(page.getByTestId('setpath-queen-offense')).toHaveAttribute('aria-checked', 'true');
  await page.getByTestId('tab-armory-btn').click();
  await expect(page.locator('[data-testid^="armory-"]')).toHaveCount(5);
  await expect(page.locator('[data-testid="armory-queen"] .atile').first()).toBeVisible();
  await page.locator('[data-testid="armory-queen"] .atile').first().click();
  await expect(page.locator('[data-testid="armory-queen"] .adesc')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('adjourn-panel')).toHaveCount(0);
  await expect
    .poll(async () => (await snap(page)).tick, { timeout: 30_000 })
    .toBeGreaterThan(frozen);
  await expect(page.getByTestId('roster-A-knight')).toHaveAttribute('aria-label', /Right/);

  // ---- to checkmate: the end screen and the report
  await page.getByTestId('speed-0').click();
  await expect(page.getByTestId('speed-0')).toHaveAttribute('aria-pressed', 'true');
  await stepUntil(page, { kind: 'end' }, 1500, 80);
  await expect(page.getByTestId('report')).toBeVisible();
  await expect(page.getByTestId('winner')).toHaveText(/Checkmate: (White|Black) wins/);
  await expect(page.getByTestId('team-table')).toBeVisible();
  await expect(page.locator('[data-testid^="report-hero-"]')).toHaveCount(10);
  await page.locator('[data-testid^="report-hero-"]').first().click();
  await expect(page.getByTestId('hero-view')).toBeVisible();
  await expect(page.getByTestId('replay')).toBeVisible();
  await page.getByTestId('scrub').fill('1200');
  await page.getByTestId('back-team').click();
  await expect(page.getByTestId('team-table')).toBeVisible();
  await page.getByTestId('scope-1').click();
  await expect(page.getByTestId('team-table')).toBeVisible();
  await page.getByTestId('scope-match').click();
  await page.getByTestId('new-match').click();
  await expect(page.getByTestId('title')).toBeVisible();
  expect(errors).toEqual([]);
});

test('the match runs on its own and never stops between Acts', async ({ page }) => {
  test.setTimeout(240_000);
  const errors = watchErrors(page);
  await startLive(page, '7');
  await step(page, 4799);
  await expect(page.getByTestId('phase')).toHaveText('Act 1');
  // cross the Act boundary: Act 2 opens with a banner and no other screen
  await step(page, 2);
  await expect(page.getByTestId('phase')).toHaveText('Act 2');
  await expect(page.getByTestId('banner-act').filter({ hasText: 'Act 2' })).toBeVisible();
  await expect(page.getByTestId('hud')).toBeVisible();
  await expect(page.getByTestId('setup')).toHaveCount(0);
  await expect(page.getByTestId('report')).toHaveCount(0);
  // un-pause: play carries on
  const tick = (await snap(page)).tick;
  await page.getByTestId('speed-2').click();
  await expect
    .poll(async () => (await snap(page)).tick, { timeout: 60_000 })
    .toBeGreaterThan(tick + 10);
  expect(errors).toEqual([]);
});
