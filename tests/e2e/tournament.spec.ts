import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { overflow, startLive, viewReady, watchErrors } from './helpers';

const COURTS = (
  JSON.parse(readFileSync('content/courts.json', 'utf8')) as {
    courts: { name: string; round: number; motto: string }[];
  }
).courts;

const shots = process.env.SHOTS_DIR;

/** What these tests use of the session (`?run=test` adds `testEnd`). */
interface Sess {
  __session: {
    testEnd(winner: 'A' | 'B' | null, adjudicated?: boolean): void;
    run: { round: number; status: string; results: unknown[] } | null;
    match: {
      step(n: number): number;
      issue(cmd: { type: string }): { ok: boolean };
      snapshot(): { forks: { piece: string }[] };
      state: { tick: number; bell: { stage: string }; forks: unknown[] };
      events: { type: string; payload: Record<string, unknown> }[];
    };
    notify(): void;
  };
}

const views = [
  { name: 'phone', viewport: { width: 390, height: 844 }, touch: true },
  { name: 'landscape', viewport: { width: 844, height: 390 }, touch: true },
  { name: 'desktop', viewport: { width: 1440, height: 900 }, touch: false },
] as const;

async function shot(page: Page, name: string): Promise<void> {
  if (!shots) return;
  // the Title fades its parts in over about 2.5 s
  if (!name.endsWith('banner')) await page.waitForTimeout(name.startsWith('title') ? 3000 : 500);
  await page.screenshot({ path: `${shots}/tournament-${name}.png` });
}

/** Ends the running match now (the `?run=test` hook), then waits for the result splash. */
async function endMatch(page: Page, winner: 'A' | 'B' | null, adjudicated = false): Promise<void> {
  await page.evaluate(({ w, a }) => (window as unknown as Sess).__session.testEnd(w, a), {
    w: winner,
    a: adjudicated,
  });
  await expect(page.getByTestId('report')).toBeVisible();
  await expect(page.getByTestId('run-next')).toBeVisible();
}

/** Title -> Tournament -> Draw -> Set up your court -> Setup. */
async function openSetup(page: Page, seed = '7'): Promise<void> {
  await page.goto('/?intro=off&run=test');
  await expect(page.getByTestId('title')).toBeVisible();
  await page.getByTestId('seed').fill(seed);
  await page.getByTestId('tournament').click();
  await expect(page.getByTestId('draw')).toBeVisible();
  await page.getByTestId('draw-setup').click();
  await expect(page.getByTestId('setup')).toBeVisible();
}

/** Setup -> Quick start -> the live board, paused. */
async function beginMatch(page: Page): Promise<void> {
  await page.evaluate(() =>
    (window as unknown as { __session: { setUi(p: unknown): void } }).__session.setUi({ speed: 0 }),
  );
  await page.getByTestId('quick-start').click();
  await expect(page.getByTestId('hud')).toBeVisible();
  await viewReady(page);
}

/** Win a round: end the match, take a reward by the Spoils button, land on the next Setup. */
async function winRound(page: Page, take = 'spoils-auto'): Promise<void> {
  await beginMatch(page);
  await endMatch(page, 'A');
  await page.getByTestId('run-next').click();
  await expect(page.getByTestId('spoils')).toBeVisible();
  await page.getByTestId(take).click();
  await expect(page.getByTestId('setup')).toBeVisible();
}

const stored = (page: Page, key: string): Promise<unknown> =>
  page.evaluate((k) => JSON.parse(window.localStorage.getItem(k) ?? 'null') as unknown, key);

/** Every button on the screen that is a tap target is at least 44 px tall and nothing sticks out sideways. */
async function fits(page: Page, scope: string, skip = '.none'): Promise<void> {
  expect(await overflow(page), `${scope}: sideways overflow`).toBeLessThanOrEqual(0);
  const small = await page.evaluate(
    (skipSel) =>
      [...document.querySelectorAll<HTMLElement>('button')]
        .filter((b) => {
          const r = b.getBoundingClientRect();
          return (
            r.width > 0 &&
            r.height > 0 &&
            r.height < 43.5 &&
            !b.closest('.gloss-pop') &&
            !b.matches(skipSel)
          );
        })
        .map(
          (b) =>
            `${b.dataset.testid ?? b.textContent?.trim()} ${Math.round(b.getBoundingClientRect().height)}`,
        ),
    skip,
  );
  expect(small, `${scope}: tap targets under 44 px`).toEqual([]);
}

test('a run on a phone: draw, kit, win, Spoils, reload, Continue, lose, summary, best finish', async ({
  browser,
}) => {
  test.setTimeout(300_000);
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
  });
  const page = await ctx.newPage();
  const errors = watchErrors(page);

  // ---- title: Tournament is the main button; no saved run, no best line yet
  await page.goto('/?intro=off&run=test');
  await expect(page.getByTestId('title')).toBeVisible();
  await expect(page.getByTestId('tournament')).toHaveClass(/primary/);
  await expect(page.getByTestId('start')).toHaveText('Exhibition');
  await expect(page.getByTestId('continue-run')).toHaveCount(0);
  await expect(page.getByTestId('best-finish')).toHaveCount(0);
  await page.waitForTimeout(3000);
  await shot(page, 'title-phone');

  // ---- the draw: four named courts, one from each round's pool; the first court's Opening shown
  await page.getByTestId('seed').fill('7');
  await page.getByTestId('tournament').click();
  await expect(page.getByTestId('draw')).toBeVisible();
  await expect(page.locator('[data-testid^="rung-name-"]')).toHaveCount(4);
  for (const round of [1, 2, 3, 4]) {
    const name = await page.getByTestId(`rung-name-${round}`).innerText();
    const court = COURTS.find((k) => k.name === name);
    expect(court, `round ${round}: ${name}`).toBeDefined();
    expect(court!.round).toBe(round);
    await expect(page.getByTestId(`rung-motto-${round}`)).toHaveText(court!.motto);
  }
  await expect(page.getByTestId('rung-1')).toHaveAttribute('aria-current', 'step');
  await expect(page.getByTestId('rung-1').getByTestId('signature-relic')).toBeVisible();
  // every court starts with at least its signature relic
  await expect(page.getByTestId('rung-1')).toContainText('Starts with 1 relic');
  await expect(page.getByTestId('rung-2')).toContainText('Starts with 1 relic and +5 Tempo');
  await expect(page.getByTestId('rung-1')).toContainText('Drafts no relics.');
  await expect(page.getByTestId('rung-2')).toContainText('Holds at most 2 relics.');
  await shot(page, 'draw-phone');
  await fits(page, 'draw');
  const saved = (await stored(page, 'automoba.run')) as { round: number; status: string } | null;
  expect(saved?.round).toBe(0);

  // ---- Setup: the run strip, and the Run kit (archetypes change here)
  await page.getByTestId('draw-setup').click();
  await expect(page.getByTestId('setup')).toBeVisible();
  await expect(page.getByTestId('run-strip')).toContainText('Round 1 of 4');
  await expect(page.getByTestId('run-strip')).toContainText('Club');
  await shot(page, 'setup-phone');
  await fits(page, 'setup');
  await page.getByTestId('run-strip').click();
  await expect(page.getByTestId('run-kit')).toBeVisible();
  await page.getByTestId('kit-arch-queen-duelist').click();
  await expect(page.getByTestId('kit-arch-queen-duelist')).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByTestId('kit-arch-queen-none')).toHaveAttribute('aria-checked', 'false');
  await shot(page, 'kit-phone');
  await page.getByTestId('run-kit-close').click();
  await expect(page.getByTestId('run-kit')).toHaveCount(0);
  await expect(page.getByTestId('run-strip-marks').locator('.rst-mark.piece')).toHaveCount(1);

  // ---- round 1: Begin, then the result with the run's own button
  await beginMatch(page);
  await endMatch(page, 'A');
  await expect(page.getByTestId('run-next')).toHaveText('Next round');
  await expect(page.getByTestId('new-match')).toHaveCount(0);
  await expect(page.getByTestId('same-seed')).toHaveCount(0);
  await shot(page, 'result-phone');
  await page.getByTestId('run-next').click();

  // ---- Spoils: the next court, three cards of three kinds, a snapping row on a phone
  await expect(page.getByTestId('spoils')).toBeVisible();
  await expect(page.getByTestId('spoils-title')).toHaveText('Round 1 won');
  await expect(page.getByTestId('next-court')).toContainText('County');
  await expect(page.getByTestId('spoil-relic')).toBeVisible();
  await expect(page.getByTestId('spoil-heirloom')).toBeAttached();
  await expect(page.getByTestId('spoil-book')).toBeAttached();
  // the heirloom shows the Technique as a card face; the next court's five first moves are listed
  await expect(page.getByTestId('spoil-heirloom-card')).toHaveAttribute('data-technique', /.+/);
  await expect(page.getByTestId('spoil-heirloom-card')).toContainText('Changes:');
  await expect(
    page.getByTestId('next-court').getByTestId('court-first-moves').locator('li'),
  ).toHaveCount(5);
  const snap = await page
    .getByTestId('spoil-row')
    .evaluate((el) => getComputedStyle(el).scrollSnapType);
  expect(snap).toContain('x mandatory');
  await shot(page, 'spoils-phone');
  await fits(page, 'spoils');
  const heirloom = page.getByTestId('spoil-take-heirloom');
  await heirloom.scrollIntoViewIfNeeded();
  await heirloom.click();

  // ---- round 2 setup: the heirloom is a mark on the strip; the save is the run
  await expect(page.getByTestId('setup')).toBeVisible();
  await expect(page.getByTestId('run-strip')).toContainText('Round 2 of 4');
  await expect(page.getByTestId('run-strip-marks').locator('.rst-mark.item')).toHaveCount(1);
  const mid = (await stored(page, 'automoba.run')) as {
    round: number;
    heirlooms: Record<string, string>;
    archetypes: Record<string, string>;
    offers: unknown;
  };
  expect(mid.round).toBe(1);
  expect(Object.keys(mid.heirlooms)).toHaveLength(1);
  expect(mid.offers).toBeNull();
  // page 1 (First moves): the heirloom shows as already taken on its piece, and that piece's three
  // cards are dealt for other slots
  const [heirPiece] = Object.keys(mid.heirlooms);
  // an element click, not a pointer click: the pointer click scrolls the clipped pager sideways
  await page.getByTestId(`fm-chip-${heirPiece}`).evaluate((el: HTMLElement) => el.click());
  await expect(page.getByTestId(`fm-heirloom-${heirPiece}`)).toContainText('already taken');
  await expect(
    page.getByTestId(`fm-heirloom-${heirPiece}`).getByTestId('tech-chip'),
  ).toHaveAttribute('data-technique', mid.heirlooms[heirPiece]);
  await expect(page.getByTestId(`first-move-${heirPiece}`).locator('.tcard')).toHaveCount(3);
  await shot(page, 'setup-heirloom-phone');

  // the Run kit shows the heirloom as the Technique's card face under its piece
  await page.getByTestId('run-strip').click();
  await expect(page.getByTestId(`kit-heirloom-${heirPiece}`).locator('.tcard')).toHaveAttribute(
    'data-technique',
    mid.heirlooms[heirPiece],
  );
  await page.getByTestId('kit-heirlooms').scrollIntoViewIfNeeded();
  await shot(page, 'kit-heirloom-phone');
  await page.getByTestId('run-kit-close').click();

  // ---- reload: Continue picks the run up at round 2's court
  await page.reload();
  await expect(page.getByTestId('title')).toBeVisible();
  await expect(page.getByTestId('continue-run')).toContainText('Round 2 of 4');
  await expect(page.getByTestId('continue-run')).toHaveClass(/primary/);
  await expect(page.getByTestId('tournament')).toHaveText('New tournament');
  await shot(page, 'title-continue-phone');
  await page.getByTestId('continue-run').click();
  await expect(page.getByTestId('setup')).toBeVisible();
  await expect(page.getByTestId('run-strip-marks').locator('.rst-mark.item')).toHaveCount(1);

  // ---- lose round 2: Run over, the summary, and the best finish
  await beginMatch(page);
  await endMatch(page, 'B');
  await expect(page.getByTestId('run-next')).toHaveText('Run over');
  await page.getByTestId('run-next').click();
  await expect(page.getByTestId('summary')).toBeVisible();
  await expect(page.getByTestId('summary-heading')).toHaveText('Out in the County round');
  await expect(page.getByTestId('sum-round-1')).toContainText('Won');
  await expect(page.getByTestId('sum-round-2')).toContainText('Lost');
  await expect(page.getByTestId('sum-round-3')).toContainText('Not reached');
  await expect(page.getByTestId('best-finish')).toContainText('Best: reached the County round');
  await expect(page.getByTestId('best-finish')).toContainText('New best');
  await expect(page.getByTestId('summary')).toContainText('Nothing from this run carries');
  expect(await stored(page, 'automoba.run')).toBeNull();
  await shot(page, 'summary-phone');
  await fits(page, 'summary');
  await page.getByTestId('summary-title').click();
  await expect(page.getByTestId('title')).toBeVisible();
  await expect(page.getByTestId('continue-run')).toHaveCount(0);
  await expect(page.getByTestId('best-finish')).toHaveText('Best: reached the County round');
  await page.waitForTimeout(3000);
  await shot(page, 'title-best-phone');

  // ---- the best finish stays after a reload
  await page.reload();
  await expect(page.getByTestId('best-finish')).toHaveText('Best: reached the County round');
  expect(errors).toEqual([]);
  await ctx.close();
});

test('Tournament asks before replacing a saved run, and abandoning keeps the better finish', async ({
  page,
}) => {
  test.setTimeout(300_000);
  const errors = watchErrors(page);
  await openSetup(page);
  await winRound(page);
  await winRound(page);
  // two wins: round 3, the Semifinal, is next
  await expect(page.getByTestId('run-strip')).toContainText('Round 3 of 4');
  await page.reload();
  await expect(page.getByTestId('continue-run')).toContainText('Semifinal');

  // the first tap only asks; Keep it changes nothing
  await page.getByTestId('tournament').click();
  await expect(page.getByTestId('abandon-run')).toBeVisible();
  await page.getByTestId('abandon-keep').click();
  await expect(page.getByTestId('abandon-run')).toHaveCount(0);
  await expect(page.getByTestId('continue-run')).toBeVisible();
  expect(await stored(page, 'automoba.best')).toBeNull();

  // abandoning counts the Semifinal as reached, then a new draw opens
  await page.getByTestId('tournament').click();
  await page.getByTestId('abandon-run').click();
  await expect(page.getByTestId('draw')).toBeVisible();
  expect(await stored(page, 'automoba.best')).toEqual({ v: 1, round: 2, champion: false });
  await page.getByTestId('draw-back').click();
  await expect(page.getByTestId('title')).toBeVisible();
  await expect(page.getByTestId('best-finish')).toHaveText('Best: reached the Semifinal');
  expect(errors).toEqual([]);
});

test('four wins make a Champion; a points win says so', async ({ page }) => {
  test.setTimeout(300_000);
  const errors = watchErrors(page);
  await openSetup(page, '11');
  await winRound(page);
  // round 2 is decided on points
  await beginMatch(page);
  await page.evaluate(() => (window as unknown as Sess).__session.testEnd('A', true));
  await expect(page.getByTestId('run-next')).toBeVisible();
  await expect(page.getByTestId('winner')).toContainText('Decided on points');
  await expect(page.getByTestId('points-line')).toBeVisible();
  await page.getByTestId('run-next').click();
  await page.getByTestId('spoils-auto').click();
  await winRound(page);
  await beginMatch(page);
  await endMatch(page, 'A');
  await expect(page.getByTestId('run-next')).toHaveText('See your run');
  await page.getByTestId('run-next').click();
  await expect(page.getByTestId('summary-heading')).toHaveText('Champion');
  await expect(page.locator('[data-testid^="sum-round-"].won')).toHaveCount(4);
  await expect(page.getByTestId('sum-round-2')).toContainText('Adjudicated');
  await expect(page.getByTestId('best-finish')).toContainText('Best: Champion');
  await shot(page, 'champion-phone');
  await page.getByTestId('summary-new').click();
  await expect(page.getByTestId('draw')).toBeVisible();
  expect(errors).toEqual([]);
});

/** Plays a Check on Black through the sim's own event stream, so the session raises its banner. */
async function checkBlack(page: Page, hold = false): Promise<void> {
  // for a screenshot: hold the page clock and the animations, so the banner stays up while it is taken
  if (hold) {
    await page.addStyleTag({ content: '.banner { animation: none !important; }' });
    await page.evaluate(() => {
      const w = window as unknown as { __now: () => number };
      w.__now = performance.now.bind(performance);
      const t = performance.now();
      performance.now = () => t;
    });
  }
  await page.evaluate(() => {
    const m = (window as unknown as Sess).__session.match as unknown as {
      ctx: { emit(t: string, p: unknown): void };
      step(n: number): number;
    };
    m.ctx.emit('check', { team: 'B' });
    m.step(1);
  });
}

test('Black reads as the opposing court in a run', async ({ page }) => {
  test.setTimeout(120_000);
  const errors = watchErrors(page);
  await openSetup(page, '7');
  const court = await page.evaluate(() => {
    const r = (window as unknown as Sess).__session.run as unknown as {
      opponents: { name: string }[];
      round: number;
    };
    return r.opponents[r.round].name;
  });
  await beginMatch(page);
  // the court's short name ("The Brasswick Club" -> "Brasswick") labels its row and pieces
  const label = (await page.locator('.v2-label').innerText()).trim();
  expect(label).not.toBe('Black');
  expect(court).toContain(label);
  await expect(page.getByTestId('roster-enemy').first()).toHaveAttribute(
    'aria-label',
    new RegExp(`^${label}`),
  );
  await checkBlack(page, !!shots);
  await expect(page.getByText(`${label} in Check`).first()).toBeVisible();
  await shot(page, 'courtname-banner');
  await page.evaluate(() => {
    const w = window as unknown as { __now?: () => number };
    if (w.__now) performance.now = w.__now;
  });
  await endMatch(page, 'B');
  await expect(page.getByTestId('winner')).toContainText(`${label} wins`);
  await expect(page.getByTestId('team-B')).toHaveAttribute('aria-label', `${label} scoreboard`);
  await shot(page, 'courtname-report');
  expect(errors).toEqual([]);
});

test('an Exhibition still says Black', async ({ page }) => {
  test.setTimeout(120_000);
  const errors = watchErrors(page);
  await startLive(page, '42');
  await expect(page.locator('.v2-label')).toHaveText('Black');
  await expect(page.getByTestId('roster-enemy').first()).toHaveAttribute(
    'aria-label',
    'Black pieces',
  );
  await checkBlack(page);
  await expect(page.getByText('Black in Check').first()).toBeVisible();
  expect(errors).toEqual([]);
});

test('Run kit choices reach the match: a carried relic is held from Act 1, the cap reads 5, and a carried archetype never stops the match', async ({
  page,
}) => {
  test.setTimeout(420_000);
  const errors = watchErrors(page);
  await openSetup(page, '5');
  // round 1: the King and the Queen take an archetype in the Run kit (after Setup opened)
  await page.getByTestId('run-strip').click();
  await page.getByTestId('kit-arch-queen-duelist').click();
  await page.getByTestId('kit-arch-king-warlord').click();
  await page.getByTestId('run-kit-close').click();
  await beginMatch(page);
  const forks = await page.evaluate(() => {
    const s = (window as unknown as Sess).__session;
    const opened: string[] = [];
    const lockedNow = (): number =>
      s.match.events.filter((e) => e.type === 'fork' && e.payload.locked).length;
    const white = (s.match.state as unknown as { teams: { A: { heroIds: number[] } } }).teams.A
      .heroIds;
    const rank4 = (): number =>
      s.match.events.filter(
        (e) => e.type === 'fork' && e.payload.rank === 4 && white.includes(e.payload.id as number),
      ).length;
    // until all five pieces have an archetype (the Rank 4 times depend on how the court plays)
    for (let i = 0; i < 600 && s.match.state.tick < 16000 && rank4() < 5; i++) {
      s.match.step(30);
      if (s.match.state.bell.stage === 'break') {
        s.match.issue({ type: 'autoRelic' });
        if (!s.match.issue({ type: 'resumeAct' }).ok) {
          s.match.issue({ type: 'declineRelic' });
          s.match.issue({ type: 'resumeAct' });
        }
      }
      if (s.match.state.forks.length > 0) {
        opened.push(...s.match.snapshot().forks.map((f) => f.piece));
        s.match.issue({ type: 'autoForks' });
      }
    }
    return {
      opened,
      locked: lockedNow(),
    };
  });
  // both locked pieces resolved at Rank 4 without a sheet; the others still asked
  expect(forks.locked).toBe(2);
  expect(forks.opened).not.toContain('queen');
  expect(forks.opened).not.toContain('king');
  expect(forks.opened.length).toBeGreaterThan(0);
  await endMatch(page, 'A');
  await page.getByTestId('run-next').click();
  await page.getByTestId('spoil-take-relic').click();
  await expect(page.getByTestId('setup')).toBeVisible();
  // every piece's archetype carried (the three that asked chose by the AI); the relic taken is held from the start of round 2
  await expect(page.getByTestId('run-strip-marks').locator('.rst-mark.piece')).toHaveCount(5);
  await beginMatch(page);
  // relics drafted in round 1 and the one just taken are all held from the first moment
  const held = await page.evaluate(() => {
    const s = (
      window as unknown as {
        __session: {
          run: { relics: unknown[] };
          match: { state: { relics: { held: { A: unknown[] } } } };
        };
      }
    ).__session;
    return { run: s.run.relics.length, inMatch: s.match.state.relics.held.A.length };
  });
  expect(held.run).toBeGreaterThanOrEqual(2);
  expect(held.inMatch).toBe(held.run);
  // play to the first Act break: the relic list reads n/5 (an Exhibition's cap is 3)
  await page.evaluate(() => {
    const s = (window as unknown as Sess).__session;
    for (let i = 0; i < 900 && s.match.state.bell.stage !== 'break'; i++) {
      s.match.step(30);
      if (s.match.state.forks.length > 0) s.match.issue({ type: 'autoForks' });
    }
    s.notify();
  });
  await expect(page.getByTestId('break-sheet')).toBeVisible();
  await page.getByTestId('break-tab-relics').click();
  await expect(page.getByTestId('relic-held')).toContainText('(' + held.run + '/5)');
  expect(errors).toEqual([]);
});

for (const v of views) {
  test.describe(`run screens, ${v.name}`, () => {
    test.use({ viewport: v.viewport, hasTouch: v.touch, isMobile: v.touch });

    test('title, draw, setup strip, kit, Spoils and summary fit without sideways scroll', async ({
      page,
    }) => {
      test.setTimeout(300_000);
      const errors = watchErrors(page);
      await page.goto('/?intro=off&run=test');
      await expect(page.getByTestId('title')).toBeVisible();
      await page.waitForTimeout(3000);
      await fits(page, 'title');
      await shot(page, `title-${v.name}`);
      await page.getByTestId('seed').fill('7');
      await page.getByTestId('tournament').click();
      await expect(page.getByTestId('draw')).toBeVisible();
      await fits(page, 'draw');
      await shot(page, `draw-${v.name}`);
      // the call to action is on screen without scrolling, on every size
      const cta = (await page.getByTestId('draw-setup').boundingBox())!;
      expect(cta.y + cta.height).toBeLessThanOrEqual(v.viewport.height);
      await page.getByTestId('draw-setup').click();
      await expect(page.getByTestId('setup')).toBeVisible();
      await fits(page, 'setup');
      await page.getByTestId('run-strip').click();
      await expect(page.getByTestId('run-kit')).toBeVisible();
      await fits(page, 'kit');
      await shot(page, `kit-${v.name}`);
      await page.getByTestId('run-kit-close').click();
      await beginMatch(page);
      await endMatch(page, 'A');
      // the report's own tabs and page dots are older controls, left as they are
      await fits(page, 'result', '[data-testid^="report-"]');
      await page.getByTestId('run-next').click();
      await expect(page.getByTestId('spoils')).toBeVisible();
      await fits(page, 'spoils');
      await shot(page, `spoils-${v.name}`);
      if (v.name === 'desktop') {
        // three cards side by side
        const boxes = await page
          .locator('.spoil')
          .evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().top)));
        expect(new Set(boxes).size).toBe(1);
      }
      await page.getByTestId('spoils-auto').click();
      await expect(page.getByTestId('setup')).toBeVisible();
      await beginMatch(page);
      await endMatch(page, 'B');
      await page.getByTestId('run-next').click();
      await expect(page.getByTestId('summary')).toBeVisible();
      await fits(page, 'summary');
      await shot(page, `summary-${v.name}`);
      expect(errors).toEqual([]);
    });
  });
}
