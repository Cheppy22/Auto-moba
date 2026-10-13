import { expect, test, type Page } from '@playwright/test';
import { camMode, setAuto, setTempo, snap, startLive, step, watchErrors } from './helpers';

test.use({ viewport: { width: 800, height: 520 } });

/** What these tests read from the session beyond the shared helpers. */
interface Polish {
  __session: {
    ui: { cam: string; zoomLane: string | null };
    match: {
      step(n: number): number;
      issue(cmd: { type: string }): { ok: boolean };
      snapshot(): { pawnPlan?: { quota: Record<string, number>; reserve: number } };
      state: { bell: { stage: string }; forks: unknown[] };
    };
    notify(): void;
  };
}

const zoomLane = (page: Page): Promise<string | null> =>
  page.evaluate(() => (window as unknown as Polish).__session.ui.zoomLane);

/** Plays on (answering forks the way "Let the AI choose" does) until the Act break sheet is up. */
async function toBreak(page: Page): Promise<void> {
  await page.evaluate(() => {
    const s = (window as unknown as Polish).__session;
    for (let i = 0; i < 800 && s.match.state.bell.stage !== 'break'; i++) {
      s.match.step(30);
      if (s.match.state.forks.length > 0) s.match.issue({ type: 'autoForks' });
    }
    s.notify();
  });
  await expect(page.getByTestId('break-sheet')).toBeVisible();
}

test('the free camera is the default; a lane chip leans in and lets go', async ({ page }) => {
  test.setTimeout(240_000);
  const errors = watchErrors(page);
  await startLive(page, '42');
  await step(page, 60);
  expect(await camMode(page)).toBe('free');
  expect(await zoomLane(page)).toBeNull();

  await page.getByTestId('lane-bar-top').click();
  await expect(page.getByTestId('lane-bar-top')).toHaveAttribute('aria-pressed', 'true');
  expect(await zoomLane(page)).toBe('top');
  expect(await camMode(page)).toBe('lane');
  // another lane switches; the same chip again, or Escape, returns to the free camera
  await page.getByTestId('lane-bar-mid').click();
  expect(await zoomLane(page)).toBe('mid');
  await page.getByTestId('lane-bar-mid').click();
  expect(await zoomLane(page)).toBeNull();
  await page.getByTestId('lane-bar-bot').click();
  expect(await zoomLane(page)).toBe('bot');
  await page.keyboard.press('Escape');
  expect(await zoomLane(page)).toBeNull();

  expect(await camMode(page)).toBe('free');
  // a lane chip from Auto leans in too (Auto goes off)
  await setAuto(page, true);
  await page.getByTestId('lane-bar-top').click();
  expect(await camMode(page)).toBe('lane');
  await expect(page.getByTestId('auto-btn')).toHaveAttribute('aria-pressed', 'false');
  expect(errors).toEqual([]);
});

test('the sound switch starts on, is remembered, and sits on the Title', async ({ page }) => {
  await page.goto('/?intro=off');
  const toggle = page.getByTestId('sound-toggle');
  await expect(toggle).toHaveAttribute('aria-pressed', 'true');
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-pressed', 'false');
  expect(await page.evaluate(() => window.localStorage.getItem('automoba.sound'))).toBe('off');
  await page.reload();
  await expect(page.getByTestId('sound-toggle')).toHaveAttribute('aria-pressed', 'false');
  await page.getByTestId('sound-toggle').click();
  await expect(page.getByTestId('sound-toggle')).toHaveAttribute('aria-pressed', 'true');
});

test('Orders at the break sets pawns per lane, and the plan fields them', async ({ page }) => {
  test.setTimeout(300_000);
  const errors = watchErrors(page);
  await startLive(page, '42', true, true);
  const plan = () =>
    page.evaluate(() => (window as unknown as Polish).__session.match.snapshot().pawnPlan);
  expect((await plan())?.quota).toEqual({ top: 2, mid: 2, bot: 2 });
  expect((await plan())?.reserve).toBe(40);

  await toBreak(page);
  await page.getByTestId('break-tab-orders').click();
  await expect(page.getByTestId('pawn-plan')).toBeVisible();
  await expect(page.getByTestId('plan-total')).toHaveText('6/8');
  await page.getByTestId('plan-top-plus').click();
  await page.getByTestId('plan-mid-minus').click();
  await page.getByTestId('plan-bot-minus').click();
  await expect(page.getByTestId('plan-top')).toHaveText('3');
  await expect(page.getByTestId('plan-total')).toHaveText('5/8');
  expect((await plan())?.quota).toEqual({ top: 3, mid: 1, bot: 1 });
  // the cap stops the steppers
  await page.getByTestId('plan-mid-plus').click();
  await page.getByTestId('plan-mid-plus').click();
  await page.getByTestId('plan-mid-plus').click();
  await expect(page.getByTestId('plan-total')).toHaveText('8/8');
  await expect(page.getByTestId('plan-mid-plus')).toBeDisabled();

  // take a relic, resume, and pawns arrive by themselves toward the plan
  await page.getByTestId('break-tab-relics').click();
  await page.getByTestId('relic-auto').click();
  await page.getByTestId('break-resume').click();
  await expect(page.getByTestId('break-sheet')).toHaveCount(0);
  await setTempo(page, 100);
  await step(page, 120);
  expect((await snap(page)).pawns.A.alive).toBeGreaterThanOrEqual(1);
  expect(errors).toEqual([]);
});

test('Tempo full and unspent earns a nudge', async ({ page }) => {
  test.setTimeout(240_000);
  await startLive(page, '42');
  await setTempo(page, 100);
  await step(page, 20);
  await expect(page.getByTestId('tempo')).toHaveAttribute('data-full', 'true');
  await expect(page.getByTestId('tempo-nudge')).toHaveCount(0);
  await step(page, 120);
  await expect(page.getByTestId('tempo-nudge')).toContainText('Tempo full');
  // spending it clears the nudge
  await setTempo(page, 40);
  await step(page, 5);
  await expect(page.getByTestId('tempo-nudge')).toHaveCount(0);
});
