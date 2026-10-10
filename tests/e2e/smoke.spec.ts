import { expect, test } from '@playwright/test';
import {
  eventCount,
  pauseAtStart,
  setCam,
  setSpeed,
  playPast,
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
  await expect(page.getByTestId('speed-chip')).toHaveAttribute('data-speed', '0');
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
  // calm HUD: portraits show the rank numeral only (no pips), and both teams show their style
  await expect(page.locator('.roster .rank-pips')).toHaveCount(0);
  await expect(page.locator('.roster-cell .style-badge')).toHaveCount(10);
  await expect(page.getByTestId('roster-A-king')).toHaveAttribute('data-style', 'sovereign');
  // gambit cards show a name and a cost, not the full text
  await expect(page.locator('.gdesc')).toHaveCount(0);

  // ---- the piece card: a Black portrait names the style (tap to follow, tap again for the card)
  const blackLabel = (await page.getByTestId('roster-B-queen').getAttribute('aria-label'))!;
  const blackStyle = blackLabel.split(', ')[1];
  expect(blackStyle.length).toBeGreaterThan(2);
  await page.getByTestId('roster-B-queen').click();
  await expect(page.getByTestId('unit-card')).toHaveCount(0);
  await page.getByTestId('roster-B-queen').click();
  await expect(page.getByTestId('unit-card')).toBeVisible();
  await expect(page.getByTestId('unit-card-style')).toHaveText(blackStyle);
  await expect(page.getByTestId('unit-card-piece')).toContainText('Queen');
  await expect(page.getByTestId('unit-card-piece')).toContainText('Black');
  await expect(page.getByTestId('unit-card-items')).toBeVisible();
  await page.getByTestId('unit-card-close').click();
  await expect(page.getByTestId('unit-card')).toHaveCount(0);
  // holding a portrait opens the card at once, for either team
  const rook = (await page.getByTestId('roster-A-rook').boundingBox())!;
  await page.mouse.move(rook.x + rook.width / 2, rook.y + rook.height / 2);
  await page.mouse.down();
  // software rendering stalls the page for whole frames: hold until the card shows
  await expect(page.getByTestId('unit-card')).toHaveAttribute('data-piece', 'rook', {
    timeout: 15_000,
  });
  await page.mouse.up();
  await expect(page.getByTestId('unit-card')).toHaveAttribute('data-piece', 'rook');
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('unit-card')).toHaveCount(0);
  await setCam(page, 'auto');

  // ---- a lane gambit: tap the card, then a lane
  let s = await stepUntil(page, { kind: 'card', target: 'lane' });
  const laneSlot = s.hand.find((c) => c.target === 'lane' && c.usable)!.slot;
  const before = await eventCount(page, 'gambit');
  // holding a card opens it enlarged with its full text; nothing is played
  const card = (await page.getByTestId(`gambit-${laneSlot}`).boundingBox())!;
  await page.mouse.move(card.x + card.width / 2, card.y + card.height / 2);
  await page.mouse.down();
  await expect(page.getByTestId('gambit-info')).toBeVisible({ timeout: 15_000 });
  await page.mouse.up();
  await expect(page.getByTestId('gambit-info')).toBeVisible();
  await expect(page.getByTestId('aim')).toHaveCount(0);
  expect(await eventCount(page, 'gambit')).toBe(before);
  await page.getByTestId('gambit-info-close').click();
  await expect(page.getByTestId('gambit-info')).toHaveCount(0);
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

  // ---- a fork pauses the match: the sheet opens, the clock stops, choosing resumes play
  s = await stepUntil(page, { kind: 'fork' });
  const fork = s.forks[0];
  const sheet = page.getByTestId('forks');
  await expect(sheet).toBeVisible();
  await expect(sheet).toContainText(`Rank ${fork.rank}`);
  await expect(sheet).toContainText('Choose a path');
  for (const o of fork.options)
    await expect(page.getByTestId(`fork-opt-${fork.heroId}-${o.id}`)).toContainText(o.name);
  await expect(page.getByTestId('fork-auto')).toBeVisible();
  // the camera frames the piece that is choosing
  await expect(page.getByTestId('cam-btn')).toHaveAttribute('data-mode', 'follow');
  // at 2x the clock still stays frozen while the sheet is open
  await setSpeed(page, 2);
  const held = (await snap(page)).tick;
  await page.waitForTimeout(1200);
  expect((await snap(page)).tick).toBe(held);
  // Adjourn and the fork pause do not fight: the sheet steps aside, then comes back
  await page.getByTestId('adjourn').click();
  await expect(page.getByTestId('adjourn-panel')).toBeVisible();
  await expect(page.getByTestId('forks')).toHaveCount(0);
  await page.getByTestId('resume').click();
  await expect(page.getByTestId('forks')).toBeVisible();
  await page.waitForTimeout(500);
  expect((await snap(page)).tick).toBe(held);
  // choosing the second option takes it and resumes play
  await page.getByTestId(`fork-opt-${fork.heroId}-${fork.options[1].id}`).click();
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
  // other pieces may be waiting too: "Let the AI choose" answers all of them
  if ((await snap(page)).forks.length > 0) {
    await expect(page.getByTestId('fork-more')).toBeVisible();
    await page.getByTestId('fork-auto').click();
  }
  await expect(page.getByTestId('forks')).toHaveCount(0);
  expect((await snap(page)).forks).toHaveLength(0);
  await expect.poll(async () => (await snap(page)).tick, { timeout: 30_000 }).toBeGreaterThan(held);
  // the camera goes back to what it was before the sheet
  await expect(page.getByTestId('cam-btn')).toHaveAttribute('data-mode', 'auto');

  // ---- "Let the AI choose" on its own
  await setSpeed(page, 0);
  await stepUntil(page, { kind: 'fork' });
  await expect(page.getByTestId('forks')).toBeVisible();
  const autoBefore = await page.evaluate(
    () =>
      (
        window as unknown as {
          __session: { match: { events: { type: string; payload: Record<string, unknown> }[] } };
        }
      ).__session.match.events.filter((e) => e.type === 'fork' && e.payload.auto === true).length,
  );
  await page.getByTestId('fork-auto').click();
  await expect(page.getByTestId('forks')).toHaveCount(0);
  expect((await snap(page)).forks).toHaveLength(0);
  const autoAfter = await page.evaluate(
    () =>
      (
        window as unknown as {
          __session: { match: { events: { type: string; payload: Record<string, unknown> }[] } };
        }
      ).__session.match.events.filter((e) => e.type === 'fork' && e.payload.auto === true).length,
  );
  expect(autoAfter).toBeGreaterThan(autoBefore);

  // ---- camera: tap a portrait to follow that piece
  await page.getByTestId('roster-A-queen').click();
  await expect(page.getByTestId('cam-btn')).toHaveAttribute('data-mode', 'follow');
  await setCam(page, 'auto');

  // ---- Adjourn: the clock stops, lanes and paths change, the Armory is readable, Resume goes on
  s = await snap(page);
  await setSpeed(page, 2);
  await playPast(page, s.tick + 40);
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
  await playPast(page, frozen);
  await expect(page.getByTestId('roster-A-knight')).toHaveAttribute('aria-label', /Right/);

  // ---- to checkmate: the end screen and the report
  await setSpeed(page, 0);
  await stepUntil(page, { kind: 'end' }, 1500, 80);
  await expect(page.getByTestId('report')).toBeVisible();
  await expect(page.getByTestId('winner')).toHaveText(/Checkmate · (White|Black) wins/);
  await expect(page.getByTestId('report-page-result')).toBeVisible();
  await expect(page.locator('[data-testid^="report-hero-"]')).toHaveCount(10);
  expect(await page.locator('[data-testid^="award-"]').count()).toBeGreaterThanOrEqual(3);
  await page.locator('[data-testid^="report-hero-"]').first().click();
  await expect(page.getByTestId('report-tab-pieces')).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByTestId('hero-view')).toBeVisible();
  await page.getByTestId('open-replay').click();
  await expect(page.getByTestId('replay')).toBeVisible();
  await page.getByTestId('scrub').fill('1200');
  await page.getByTestId('report-tab-result').click();
  await expect(page.getByTestId('team-totals')).toBeVisible();
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
  // cross the Act boundary: Act 2 opens with a banner and no other screen. Banners fade within
  // a couple of seconds, so watch for it inside the page while the sim steps over the boundary.
  const banner = page.waitForFunction(() =>
    [...document.querySelectorAll('[data-testid="banner-act"]')].some((e) =>
      /Act 2/.test(e.textContent ?? ''),
    ),
  );
  await step(page, 2);
  await banner;
  await expect(page.getByTestId('phase')).toHaveText('Act 2');
  await expect(page.getByTestId('hud')).toBeVisible();
  await expect(page.getByTestId('setup')).toHaveCount(0);
  await expect(page.getByTestId('report')).toHaveCount(0);
  // un-pause: play carries on
  const tick = (await snap(page)).tick;
  await setSpeed(page, 2);
  await playPast(page, tick + 10);
  expect(errors).toEqual([]);
});
