import { expect, test, type Page } from '@playwright/test';
import {
  boxOf,
  clearPawnPlan,
  overflow,
  pauseAtStart,
  setTempo,
  snap,
  step,
  viewReady,
  watchErrors,
} from './helpers';

/** The new HUD ("court bar"): chosen with `?hud=new`, or by default under `?look=table`. */

async function startWith(page: Page, query: string, seed = '42'): Promise<void> {
  await page.goto(`/?${query}&intro=off`);
  await expect(page.getByTestId('title')).toBeVisible();
  await page.getByTestId('seed').fill(seed);
  await page.getByTestId('start').click();
  await expect(page.getByTestId('setup')).toBeVisible();
  await pauseAtStart(page);
  await page.getByTestId('quick-start').click();
  await expect(page.getByTestId('hud')).toBeVisible();
  await viewReady(page);
  await clearPawnPlan(page);
}

/** What these tests read from the session beyond the shared helpers. */
interface Sess {
  __session: {
    ui: { zoomLane: string | null };
    match: {
      step(n: number): number;
      issue(cmd: { type: string }): { ok: boolean };
      unitById(id: number): { alive: boolean } | undefined;
      state: {
        bell: { stage: string };
        forks: unknown[];
        tempo: { A: number };
        teams: Record<'A' | 'B', { heroIds: number[] }>;
      };
    };
    notify(): void;
  };
}

const rootVar = (page: Page, name: string): Promise<number> =>
  page.evaluate(
    (n) => parseFloat(getComputedStyle(document.documentElement).getPropertyValue(n)),
    name,
  );

const PIECES = ['king', 'queen', 'rook', 'bishop', 'knight'];

test.describe('portrait', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test('one row of pieces, the drawer, Black tokens, a capture tray and the HUD size vars', async ({
    page,
  }) => {
    test.setTimeout(240_000);
    const errors = watchErrors(page);
    await startWith(page, 'hud=new');
    await expect(page.getByTestId('hud')).toHaveAttribute('data-hud', 'new');
    await expect(page.getByTestId('hud')).toHaveAttribute('data-shape', 'stack');
    expect(await overflow(page)).toBeLessThanOrEqual(0);

    // the size vars exist and the bars sit inside them
    const top = await rootVar(page, '--hud-top');
    const bottom = await rootVar(page, '--hud-bottom');
    expect(top).toBeGreaterThan(80);
    expect(bottom).toBeGreaterThan(80);
    expect(top + bottom).toBeLessThan(844 * 0.4);

    // your five pieces: one row, each tile big enough to tap, no side column
    const row = await Promise.all(PIECES.map((p) => boxOf(page, `roster-A-${p}`)));
    for (const b of row) {
      expect(b.width).toBeGreaterThanOrEqual(44);
      expect(b.height).toBeGreaterThanOrEqual(44);
      expect(Math.abs(b.y - row[0].y)).toBeLessThan(2);
      expect(b.y + b.height).toBeLessThanOrEqual(844);
    }
    expect(row[0].x).toBeLessThan(12);

    // Black's five tokens sit in the top bar
    for (const p of PIECES) {
      const b = await boxOf(page, `roster-B-${p}`);
      expect(b.height).toBeGreaterThanOrEqual(44);
      expect(b.y + b.height).toBeLessThanOrEqual(top);
    }
    await page.getByTestId('roster-B-queen').tap();
    await expect(page.getByTestId('unit-card')).toHaveAttribute('data-team', 'B');
    await page.getByTestId('unit-card-close').tap();

    // the lane strip chips are still tappable
    await page.getByTestId('lane-bar-top').tap();
    expect(await page.evaluate(() => (window as unknown as Sess).__session.ui.zoomLane)).toBe(
      'top',
    );
    await page.getByTestId('lane-bar-top').tap();

    // the drawer: collapsed shows Tempo, the playable count and Field Pawn; opening shows the hand
    const drawer = page.getByTestId('drawer');
    await expect(drawer).toHaveAttribute('data-open', 'false');
    await expect(page.getByTestId('tempo')).toBeVisible();
    await expect(page.getByTestId('field-pawn')).toBeVisible();
    await expect(page.getByTestId('drawer-count')).toBeVisible();
    await expect(page.getByTestId('gambit-0')).toBeHidden();
    await page.getByTestId('drawer-toggle').tap();
    await expect(drawer).toHaveAttribute('data-open', 'true');
    await expect(page.getByTestId('gambit-0')).toBeVisible();
    expect(await rootVar(page, '--hud-bottom')).toBe(bottom);
    await page.getByTestId('drawer-toggle').tap();
    await expect(page.getByTestId('gambit-0')).toBeHidden();

    // Field Pawn works from the collapsed bar
    await setTempo(page, 100);
    await page.getByTestId('field-pawn').tap();
    await expect(page.getByTestId('aim')).toBeVisible();
    await page.getByTestId('aim-cancel').tap();

    // a capture: the fallen piece lands in the other team's tray with its respawn timer
    await page.evaluate(() => {
      const s = (window as unknown as Sess).__session;
      for (let i = 0; i < 400; i++) {
        s.match.step(40);
        if (s.match.state.forks.length > 0) s.match.issue({ type: 'autoForks' });
        const dead = (['A', 'B'] as const).some((t) =>
          s.match.state.teams[t].heroIds.some((id) => !s.match.unitById(id)?.alive),
        );
        if (dead) break;
      }
      s.notify();
    });
    await expect
      .poll(async () => page.locator('.tray-item:not(.leaving)').count(), { timeout: 10_000 })
      .toBeGreaterThan(0);
    await expect(page.locator('.tray-item .tray-time').first()).toHaveText(/\d:\d\d|×/);
    expect(errors).toEqual([]);
  });

  test('the Tempo-full nudge floats above the bar', async ({ page }) => {
    test.setTimeout(180_000);
    const errors = watchErrors(page);
    await startWith(page, 'hud=new');
    const full = (await snap(page)).tempo.A;
    await page.evaluate(() => {
      (window as unknown as Sess).__session.match.state.tempo.A = 1000;
    });
    expect(full).toBeLessThanOrEqual(1000);
    await step(page, 140);
    await expect(page.getByTestId('tempo-nudge')).toBeVisible();
    const bar = await boxOf(page, 'tempo');
    const nudge = await boxOf(page, 'tempo-nudge');
    expect(nudge.y + nudge.height).toBeLessThanOrEqual(bar.y);
    expect(nudge.x).toBeGreaterThanOrEqual(0);
    expect(nudge.x + nudge.width).toBeLessThanOrEqual(390);
    expect(errors).toEqual([]);
  });

  test('one notice band at a time: the rest wait their turn', async ({ page }) => {
    test.setTimeout(180_000);
    const errors = watchErrors(page);
    await startWith(page, 'hud=new');
    await page.evaluate(() => {
      const s = (window as unknown as { __session: { setUi(p: object): void } }).__session;
      const now = performance.now();
      const chip = (id: number, kind: string, title: string) => ({
        id,
        kind,
        title,
        detail: '',
        team: 'A',
        until: now + 2400,
        ms: 2400,
      });
      s.setUi({
        chips: [chip(9001, 'check', 'Check on Black'), chip(9002, 'rank', 'Knight rank 2')],
        caption: 'The camera follows the Knight',
        blackPlay: {
          id: 9003,
          school: 'march',
          text: 'Black played Barricade on Left lane',
          until: now + 3000,
          ms: 3000,
        },
      });
    });
    const bands = page.locator('.notices > *');
    await expect(bands).toHaveCount(1);
    await expect(page.getByTestId('banner-black')).toBeVisible();
    // Black's play has the band first; Check waits, then the rank-up
    await expect(page.getByTestId('banner-check')).toBeVisible({ timeout: 8_000 });
    await expect(bands).toHaveCount(1);
    await expect(page.getByTestId('rank-chip')).toBeVisible({ timeout: 8_000 });
    await expect(bands).toHaveCount(1);
    expect(errors).toEqual([]);
  });

  test('after a relic the seals show under the row and open upward', async ({ page }) => {
    test.setTimeout(300_000);
    const errors = watchErrors(page);
    await startWith(page, 'hud=new', '7');
    const before = await rootVar(page, '--hud-bottom');
    await page.evaluate(() => {
      const s = (window as unknown as Sess).__session;
      for (let i = 0; i < 800 && s.match.state.bell.stage !== 'break'; i++) {
        s.match.step(30);
        if (s.match.state.forks.length > 0) s.match.issue({ type: 'autoForks' });
      }
      s.notify();
    });
    await expect(page.getByTestId('break-sheet')).toBeVisible();
    await page.getByTestId('break-tab-relics').click();
    const offers = page.getByTestId('relic-offers').locator('article');
    const aim = offers.first().locator('[role="radio"]');
    if ((await aim.count()) > 0) await aim.last().click();
    await offers
      .first()
      .getByRole('button', { name: /Take this relic/ })
      .click();
    await page.getByTestId('break-resume').click();
    await expect(page.getByTestId('relic-row-A')).toBeVisible();
    expect(await rootVar(page, '--hud-bottom')).toBeGreaterThan(before);
    const icon = page.locator('[data-testid^="relic-icon-A-"]').first();
    expect((await icon.boundingBox())!.y + 20).toBeLessThanOrEqual(844);
    await icon.tap();
    const pop = page.getByTestId('relic-pop');
    await expect(pop).toBeVisible();
    const p = (await pop.boundingBox())!;
    expect(p.y).toBeGreaterThanOrEqual(0);
    expect(p.y + p.height).toBeLessThanOrEqual((await icon.boundingBox())!.y);
    expect(errors).toEqual([]);
  });
});

const wide = [
  { name: 'landscape', viewport: { width: 844, height: 390 } },
  { name: 'desktop', viewport: { width: 1440, height: 900 } },
];

for (const v of wide) {
  test.describe(v.name, () => {
    test.use({ viewport: v.viewport });

    test('your row runs down the left edge, the drawer sits bottom-right, the board keeps the height', async ({
      page,
    }) => {
      test.setTimeout(180_000);
      const errors = watchErrors(page);
      await startWith(page, 'look=table');
      await expect(page.getByTestId('hud')).toHaveAttribute('data-shape', 'side');
      expect(await overflow(page)).toBeLessThanOrEqual(0);
      const top = await rootVar(page, '--hud-top');
      expect(top).toBeGreaterThan(40);
      expect(top).toBeLessThan(v.viewport.height * 0.2);
      expect(await rootVar(page, '--hud-bottom')).toBe(0);
      const left = await rootVar(page, '--hud-left');
      expect(left).toBeGreaterThan(60);
      const col = await Promise.all(PIECES.map((p) => boxOf(page, `roster-A-${p}`)));
      for (const [i, b] of col.entries()) {
        expect(Math.abs(b.x - col[0].x)).toBeLessThan(2);
        expect(b.y).toBeGreaterThanOrEqual(top - 1);
        expect(b.y + b.height).toBeLessThanOrEqual(v.viewport.height);
        expect(b.x + b.width).toBeLessThanOrEqual(left + 1);
        if (i > 0) expect(b.y).toBeGreaterThanOrEqual(col[i - 1].y + col[i - 1].height - 1);
        expect(b.width).toBeGreaterThanOrEqual(44);
        expect(b.height).toBeGreaterThanOrEqual(44);
      }
      // the top bar holds everything on one row: clock, trays, lanes, Black's court, controls
      const clock = await boxOf(page, 'clock');
      const adjourn = await boxOf(page, 'adjourn');
      const king = await boxOf(page, 'roster-B-king');
      expect(Math.abs(adjourn.y - clock.y)).toBeLessThan(40);
      expect(king.y + king.height).toBeLessThanOrEqual(top);
      expect(adjourn.x + adjourn.width).toBeLessThanOrEqual(v.viewport.width);
      // the drawer opens upward and leaves the left edge alone
      const bar = await boxOf(page, 'drawer-toggle');
      expect(bar.x).toBeGreaterThan(v.viewport.width / 2);
      await page.getByTestId('drawer-toggle').click();
      await expect(page.getByTestId('gambit-0')).toBeVisible();
      expect((await boxOf(page, 'gambit-0')).y).toBeLessThan(bar.y);
      expect(errors).toEqual([]);
    });
  });
}

test('the new HUD is the default under the table look and ?hud=old forces the old one', async ({
  page,
}) => {
  test.setTimeout(240_000);
  const errors = watchErrors(page);
  await startWith(page, 'look=table');
  await expect(page.getByTestId('hud')).toHaveAttribute('data-hud', 'new');
  await page.goto('/?look=table&hud=old&intro=off');
  await expect(page.getByTestId('title')).toBeVisible();
  await page.getByTestId('start').click();
  await page.getByTestId('quick-start').click();
  await expect(page.getByTestId('hud')).toHaveAttribute('data-hud', 'old');
  await expect(page.getByTestId('drawer')).toHaveCount(0);
  await expect(page.getByTestId('gambit-0')).toBeVisible();
  expect(errors).toEqual([]);
});
