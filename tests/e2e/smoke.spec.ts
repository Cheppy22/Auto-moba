import { expect, test, type Page } from '@playwright/test';
import {
  clearPawnPlan,
  eventCount,
  isOldHud,
  openHand,
  pauseAtStart,
  camMode,
  setAuto,
  setSpeed,
  playPast,
  setTempo,
  snap,
  startLive,
  step,
  stepUntil,
  type TestSession,
  watchErrors,
} from './helpers';

/**
 * Taps `id` and returns the toast text that shows. A toast lasts 2.6 s and a loaded machine can take
 * longer than that to answer one click, so the text is read inside the page the moment it appears.
 */
async function tapForToast(page: Page, id: string): Promise<string> {
  await expect(page.getByTestId('toast')).toHaveCount(0, { timeout: 30_000 }); // an older toast must be gone
  const shown = page.waitForFunction(
    () => document.querySelector('[data-testid="toast"]')?.textContent || false,
  );
  await page.getByTestId(id).click({ force: true });
  return String(await (await shown).jsonValue());
}

test('title, setup, gambits, pawn, fork, adjourn, checkmate and report', async ({ page }) => {
  // the 3D view is slow in headless software rendering, so every step takes longer than it used to
  test.setTimeout(900_000);
  const errors = watchErrors(page);

  // ---- title -> setup board
  await page.goto('/?intro=off');
  await expect(page.getByTestId('title')).toBeVisible();
  await page.getByTestId('seed').fill('42');
  await page.getByTestId('start').click();
  await expect(page.getByTestId('setup')).toBeVisible();
  // page 1, first moves: each piece's Setup cards, the AI's pick marked (read only for now)
  await expect(page.getByTestId('first-moves')).toBeVisible();
  for (const piece of ['king', 'queen', 'rook', 'bishop', 'knight'])
    await expect(page.getByTestId(`first-move-${piece}`).locator('li.on')).toHaveCount(1);
  // page 2, board: swap the King into Mid, read a piece descriptor
  await page.getByTestId('next').click();
  await expect(page.getByTestId('step-2')).toHaveAttribute('aria-current', 'step');
  await expect(page.getByTestId('zone-top')).toContainText('2/2');
  await expect(page.getByTestId('zone-mid')).toContainText('1/1');
  await expect(page.getByTestId('zone-bot')).toContainText('2/2');
  await page.getByTestId('chip-king').click();
  await page.getByTestId('zone-mid').click();
  await expect(page.getByTestId('zone-mid')).toContainText('King');
  await expect(page.getByTestId('desc-king')).toContainText('Mid');
  await page.getByTestId('desc-toggle-queen').click();
  await expect(page.getByTestId('desc-queen-body')).toContainText('Royal Lunge');
  // page 3, Opening: everything is pre-filled with the Italian Game; pick another and read "More"
  await page.keyboard.press('ArrowRight');
  await expect(page.getByTestId('step-3')).toHaveAttribute('aria-current', 'step');
  await expect(page.locator('[data-testid^="opening-"][role="radio"]')).toHaveCount(8);
  await expect(page.getByTestId('opening-italian')).toHaveClass(/on/);
  await page.getByTestId('opening-french').click();
  await expect(page.getByTestId('opening-french')).toHaveClass(/on/);
  await page.getByTestId('opening-more-french').click();
  await expect(page.getByTestId('opening-body-french')).toContainText('Example hands');
  await pauseAtStart(page);
  await page.getByTestId('begin').click();

  // ---- live HUD
  await expect(page.getByTestId('hud')).toBeVisible();
  await expect(page.getByTestId('stage')).toHaveAttribute('data-ready', 'true', {
    timeout: 60_000,
  });
  await clearPawnPlan(page);
  await expect(page.getByTestId('speed-chip')).toHaveAttribute('data-speed', '0');
  await expect(page.getByTestId('phase')).toHaveText('Act 1');
  await expect(page.getByTestId('stage')).toBeVisible();
  await expect(page.getByTestId('no-webgl')).toHaveCount(0);
  const oldHud = await isOldHud(page);
  await expect(page.locator('[data-testid^="roster-A-"]')).toHaveCount(5);
  await expect(page.locator('[data-testid^="roster-B-"]')).toHaveCount(5);
  await expect(page.getByTestId('roster-A-king')).toHaveAttribute('aria-label', /Generic.*Mid/);
  await expect(page.getByTestId('roster-A-king')).toHaveAttribute('data-rank', '1');
  await expect(page.locator('[data-testid^="gambit-"]')).toHaveCount(3);
  // the French Defence opens with Hold the File, in slot 0, with its "Opening" corner and "Act 1" pin
  await expect(page.getByTestId('gambit-0')).toHaveAttribute('data-card', 'hold_the_file');
  await expect(page.getByTestId('hand-opening-0')).toHaveText('Opening');
  await expect(page.getByTestId('hand-pin-0')).toHaveText('Act 1');
  await expect(page.getByTestId('tempo-value')).toHaveText('30');
  await expect(page.getByTestId('pawn-count')).toContainText('0/8 · 15');
  await expect(page.getByTestId('status-A')).toHaveAttribute('data-state', '');
  // calm HUD: portraits show the rank numeral only (no pips); pieces are generic until Rank 4
  await expect(page.locator('.roster .rank-pips')).toHaveCount(0);
  await expect(page.locator('.roster-cell .style-badge')).toHaveCount(0);
  await expect(page.getByTestId('roster-A-king')).not.toHaveAttribute('data-style', /.+/);
  // gambit cards show a name and a cost, not the full text
  await expect(page.locator('.gdesc')).toHaveCount(0);

  // ---- the piece card: a Black portrait names the style (tap to follow, tap again for the card)
  const blackLabel = (await page.getByTestId('roster-B-queen').getAttribute('aria-label'))!;
  const blackStyle = blackLabel.split(', ')[1];
  expect(blackStyle.length).toBeGreaterThan(2);
  await page.getByTestId('roster-B-queen').click();
  // the old roster follows on the first tap and shows the card on the second; a court-bar token shows it at once
  if (oldHud) {
    await expect(page.getByTestId('unit-card')).toHaveCount(0);
    await page.getByTestId('roster-B-queen').click();
  }
  await expect(page.getByTestId('unit-card')).toBeVisible();
  // the old portrait names the style in its label; a court-bar token only shows the rank
  if (oldHud) await expect(page.getByTestId('unit-card-style')).toHaveText(blackStyle);
  else await expect(page.getByTestId('unit-card-style')).not.toBeEmpty();
  await expect(page.getByTestId('unit-card-piece')).toContainText('Queen');
  await expect(page.getByTestId('unit-card-piece')).toContainText('Black');
  await expect(page.getByTestId('unit-card-techniques')).toBeVisible();
  // six slots; the Setup pick fills one (Black's Signature stays locked until Rank 4)
  const slots = page.getByTestId('unit-card-techniques');
  await expect(slots.locator('[data-state]')).toHaveCount(6);
  await expect(slots.locator('[data-state="held"]')).not.toHaveCount(0);
  await slots.locator('[data-state="held"]').first().click();
  await expect(page.getByTestId('unit-card-slot-detail')).toBeVisible();
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
  await setAuto(page, true);

  // ---- a lane gambit: tap the card, then a lane
  let s = await stepUntil(page, { kind: 'card', target: 'lane' });
  const laneSlot = s.hand.find((c) => c.target === 'lane' && c.usable)!.slot;
  const before = await eventCount(page, 'gambit', 'A');
  // holding a card opens it enlarged with its full text; nothing is played
  await openHand(page);
  const card = (await page.getByTestId(`gambit-${laneSlot}`).boundingBox())!;
  await page.mouse.move(card.x + card.width / 2, card.y + card.height / 2);
  await page.mouse.down();
  await expect(page.getByTestId('gambit-info')).toBeVisible({ timeout: 15_000 });
  await page.mouse.up();
  await expect(page.getByTestId('gambit-info')).toBeVisible();
  await expect(page.getByTestId('aim')).toHaveCount(0);
  expect(await eventCount(page, 'gambit', 'A')).toBe(before);
  await page.getByTestId('gambit-info-close').click();
  await expect(page.getByTestId('gambit-info')).toHaveCount(0);
  await openHand(page);
  await page.getByTestId(`gambit-${laneSlot}`).click();
  await expect(page.getByTestId('aim')).toBeVisible();
  await expect(page.getByTestId('aim-top')).toBeVisible();
  await expect(page.getByTestId('aim-mid')).toBeVisible();
  await expect(page.getByTestId('aim-bot')).toBeVisible();
  await page.getByTestId('aim-cancel').click();
  await expect(page.getByTestId('aim')).toHaveCount(0);
  await openHand(page);
  await page.getByTestId(`gambit-${laneSlot}`).click();
  await page.getByTestId('aim-mid').click();
  await expect(page.getByTestId('aim')).toHaveCount(0);
  expect(await eventCount(page, 'gambit', 'A')).toBe(before + 1);
  await expect(page.getByTestId(`gambit-${laneSlot}`)).toHaveAttribute('data-empty', 'true');

  // ---- a point gambit: tap the card, then the 3D view
  await setTempo(page, 100);
  s = await stepUntil(page, { kind: 'card', target: 'point' });
  const pointSlot = s.hand.find((c) => c.target === 'point' && c.usable)!.slot;
  await openHand(page);
  await page.getByTestId(`gambit-${pointSlot}`).click();
  await expect(page.getByTestId('aim-hint')).toContainText('Tap the board');
  const vp = page.viewportSize()!;
  await page.mouse.click(vp.width / 2, vp.height / 2);
  await expect.poll(() => eventCount(page, 'gambit', 'A')).toBe(before + 2);
  await expect(page.getByTestId('aim')).toHaveCount(0);

  // ---- a card that cannot be played says why, and the sim's refusal shows as a toast
  await setTempo(page, 0);
  s = await snap(page);
  const idle = s.hand.find((c) => c.cardId !== '' && !c.usable)!;
  await openHand(page);
  await expect(page.getByTestId(`gambit-${idle.slot}`)).toHaveAttribute('data-usable', 'false');
  await expect(page.getByTestId(`gambit-${idle.slot}`)).toContainText(/Tempo|down/);
  // a card that cannot be played is aria-disabled but still answers a tap with the reason
  expect(await tapForToast(page, `gambit-${idle.slot}`)).toMatch(/\S/);
  expect(await tapForToast(page, 'field-pawn')).toContain('Not enough Tempo');
  await expect(page.getByTestId('aim')).toHaveCount(0);

  // ---- field a pawn: Field Pawn, then a lane
  await setTempo(page, 60);
  await page.getByTestId('field-pawn').click();
  await expect(page.getByTestId('aim')).toBeVisible();
  await page.getByTestId('aim-top').click();
  await expect(page.getByTestId('pawn-count')).toContainText('1/8 · 15');
  await expect(page.getByTestId('tempo-value')).toHaveText('45');
  expect(await eventCount(page, 'pawnFielded', 'A')).toBe(1);

  // ---- a fork pauses the match: the sheet opens, the clock stops, choosing resumes play
  s = await stepUntil(page, { kind: 'fork' });
  const fork = s.forks[0];
  const sheet = page.getByTestId('forks');
  await expect(sheet).toBeVisible();
  await expect(sheet).toContainText(`Rank ${fork.rank}`);
  await expect(sheet).toContainText(
    fork.kind === 'archetype' ? 'Choose an archetype' : 'Choose a path',
  );
  if (fork.kind === 'archetype') expect(fork.options).toHaveLength(3);
  for (const o of fork.options)
    await expect(page.getByTestId(`fork-opt-${fork.heroId}-${o.id}`)).toContainText(o.name);
  await expect(page.getByTestId('fork-auto')).toBeVisible();
  // the camera frames the piece that is choosing
  expect(await camMode(page)).toBe('follow');
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
  // choosing the second option (its tab, then Choose) takes it and resumes play
  await page.getByTestId(`fork-opt-${fork.heroId}-${fork.options[1].id}`).click();
  await expect(page.getByTestId('fork-preview')).toBeVisible();
  await page.getByTestId('fork-choose').click();
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
  expect(await camMode(page)).toBe('auto');

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
  expect(await camMode(page)).toBe('follow');
  await setAuto(page, true);

  // ---- Adjourn: the clock stops, lanes change, each piece's Techniques are readable, Resume goes on
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
  await page.getByTestId('tab-builds-btn').click();
  await expect(page.locator('[data-testid^="adjourn-builds-"]')).toHaveCount(5);
  await expect(
    page.getByTestId('adjourn-builds-queen').getByTestId('tech-chip').first(),
  ).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('adjourn-panel')).toHaveCount(0);
  await playPast(page, frozen);
  await expect(page.getByTestId('roster-A-knight')).toHaveAttribute('data-lane', 'bot');

  // ---- to checkmate: the end screen and the report
  await setSpeed(page, 0);
  await stepUntil(page, { kind: 'end' }, 1500, 80);
  // the Checkmate beat plays first (the King topples); a tap skips it to the splash
  const beat = page.getByTestId('mate-beat');
  await expect(beat.or(page.getByTestId('report')).first()).toBeVisible();
  if (await beat.isVisible()) await beat.click({ force: true }).catch(() => undefined);
  await expect(page.getByTestId('report')).toBeVisible({ timeout: 15_000 });
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

test('an Act ends with the bell and a break sheet; Resume opens the next Act', async ({ page }) => {
  test.setTimeout(600_000);
  const errors = watchErrors(page);
  await startLive(page, '7');
  await step(page, 4799);
  await expect(page.getByTestId('phase')).toHaveText('Act 1');
  // 0:00: the board greys and play carries on, waiting for calm
  await step(page, 2);
  await expect(page.getByTestId('bell-line')).toBeVisible();
  await expect(page.getByTestId('shell')).toHaveAttribute('data-bell', 'pending');
  // tolls, the halt, then the sheet
  await page.evaluate(() => {
    const s = (window as unknown as { __session: TestSession }).__session;
    for (let i = 0; i < 4000 && s.match.state.bell.stage !== 'break'; i++) {
      if (s.match.step(1) === 0) s.match.issue({ type: 'autoForks' });
    }
    s.notify();
  });
  await expect(page.getByTestId('break-sheet')).toBeVisible();
  await expect(page.getByTestId('break-callouts').locator('li').first()).toBeVisible();
  await page.getByTestId('break-tab-orders').click();
  await expect(page.getByTestId('tab-orders')).toBeVisible();
  // the relic draft: Resume stays locked until one is taken (aimed)
  await expect(page.getByTestId('break-resume')).toBeDisabled();
  await page.getByTestId('break-tab-relics').click();
  const offers = page.getByTestId('relic-offers').locator('article');
  await expect(offers).toHaveCount(3);
  const aim = offers.first().locator('[role="radio"]');
  if ((await aim.count()) > 0) await aim.last().click();
  await offers
    .first()
    .getByRole('button', { name: /Take this relic/ })
    .click();
  await expect(page.getByTestId('relic-done')).toBeVisible();
  await expect(page.getByTestId('break-resume')).toBeEnabled();
  const frozen = (await snap(page)).tick;
  await step(page, 100);
  expect((await snap(page)).tick).toBe(frozen);
  await page.getByTestId('break-resume').click();
  await expect(page.getByTestId('phase')).toHaveText('Act 2');
  await expect(page.getByTestId('break-sheet')).toHaveCount(0);
  await expect(page.getByTestId('hud')).toBeVisible();
  await expect(page.getByTestId('report')).toHaveCount(0);
  await expect(page.getByTestId('relic-row-A')).toBeVisible();
  // un-pause: play carries on
  const tick = (await snap(page)).tick;
  await setSpeed(page, 2);
  await playPast(page, tick + 10);
  expect(errors).toEqual([]);
});
