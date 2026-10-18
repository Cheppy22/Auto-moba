import { expect, test, type Page } from '@playwright/test';
import {
  clearPawnPlan,
  leaveBreak,
  overflow,
  pauseAtStart,
  setTempo,
  snap,
  step,
  stepUntil,
  viewReady,
  watchErrors,
} from './helpers';

/** The first-match nudges: `?tutorial=on` turns them on under `?intro=off`; storage carries over a reload. */

async function begin(page: Page, seed = '42', query = ''): Promise<void> {
  await page.goto(`/?intro=off&tutorial=on${query}`);
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

/** Screenshots for the docs, only when asked for (`SHOTS=1`), so a normal run leaves docs/img alone. */
const shot = async (page: Page, path: string): Promise<void> => {
  if (process.env.SHOTS) await page.screenshot({ path });
};

const tutorStore = (page: Page): Promise<{ seen: string[]; off: boolean } | null> =>
  page.evaluate(() => {
    const t = window.localStorage.getItem('automoba.tutorial');
    return t ? (JSON.parse(t) as { seen: string[]; off: boolean }) : null;
  });

/** Teleports White's Queen onto high ground over Black's King, aimed at him (the sim's own test setup). */
async function giveHighGround(page: Page): Promise<void> {
  await page.evaluate(() => {
    interface U {
      x: number;
      y: number;
      targetId: number | null;
      id: number;
      hero?: { defId: string };
    }
    const s = (
      window as unknown as {
        __session: {
          match: {
            unitById(id: number): U | undefined;
            state: { teams: Record<'A' | 'B', { heroIds: number[] }> };
          };
          notify(): void;
        };
      }
    ).__session;
    const find = (team: 'A' | 'B', piece: string): U =>
      s.match.state.teams[team].heroIds
        .map((id) => s.match.unitById(id)!)
        .find((u) => u.hero?.defId === piece)!;
    const queen = find('A', 'queen');
    const king = find('B', 'king');
    queen.x = 1000;
    queen.y = 2420;
    king.x = 1000;
    king.y = 2330;
    queen.targetId = king.id;
    s.notify();
  });
}

test.describe('first match', () => {
  test('Tempo, the eye badge, a capture, the fork and the first break each teach once', async ({
    page,
  }) => {
    test.setTimeout(300_000);
    const errors = watchErrors(page);
    await begin(page);
    const tutor = page.getByTestId('tutor');
    await expect(tutor).toHaveCount(0);

    // 1. Tempo full: points at the hand and explains one card
    await setTempo(page, 100);
    await step(page, 2);
    await expect(tutor).toHaveAttribute('data-tutor', 'tempo');
    await expect(page.getByTestId('tutor-text')).toContainText('Tempo is full');
    await expect(page.getByTestId('tutor-text')).toContainText('Gambits');
    await shot(page, 'docs/img/aaa-onboarding-1-tempo.png');
    await page.getByTestId('tutor-ok').click();
    await expect(tutor).toHaveCount(0);
    expect((await tutorStore(page))?.seen).toContain('tempo');

    // 2. the first high-ground eye badge
    await giveHighGround(page);
    await expect(tutor).toHaveAttribute('data-tutor', 'eye');
    await expect(page.getByTestId('tutor-text')).toContainText('high ground');
    await expect(page.getByTestId('tutor-ring')).toBeAttached();
    await step(page, 3); // the Queen's drawn place catches up with the move, for the screenshot
    await page.waitForTimeout(400);
    await shot(page, 'docs/img/aaa-onboarding-2-eye.png');
    await page.getByTestId('tutor-ok').click();

    // 3. the first capture: who took whom
    await page.evaluate(() => {
      const s = (
        window as unknown as {
          __session: {
            match: {
              step(n: number): number;
              state: { forks: unknown[] };
              issue(c: { type: string }): unknown;
              events: { type: string; payload: { kind?: string } }[];
            };
            notify(): void;
          };
        }
      ).__session;
      for (let i = 0; i < 600; i++) {
        s.match.step(40);
        if (s.match.state.forks.length > 0) s.match.issue({ type: 'autoForks' });
        if (s.match.events.some((e) => e.type === 'death' && e.payload.kind === 'hero')) break;
      }
      s.notify();
    });
    await expect(tutor).toHaveAttribute('data-tutor', 'capture');
    await expect(page.getByTestId('tutor-text')).toContainText(/took/);
    await shot(page, 'docs/img/aaa-onboarding-3-capture.png');
    await page.getByTestId('tutor-ok').click();
    expect((await tutorStore(page))?.seen).toEqual(
      expect.arrayContaining(['tempo', 'eye', 'capture']),
    );

    // 4. the first Act break: a walk through the four tabs
    await page.evaluate(() => {
      const s = (
        window as unknown as {
          __session: {
            match: {
              step(n: number): number;
              state: { forks: unknown[]; bell: { stage: string } };
              issue(c: { type: string }): unknown;
            };
            notify(): void;
          };
        }
      ).__session;
      for (let i = 0; i < 400 && s.match.state.bell.stage !== 'break'; i++) {
        s.match.step(100);
        if (s.match.state.forks.length > 0) s.match.issue({ type: 'autoForks' });
      }
      s.notify();
    });
    await expect(page.getByTestId('break-sheet')).toBeVisible();
    const tour = page.getByTestId('tutor-break');
    await expect(tour).toHaveAttribute('data-step', 'report');
    await page.waitForTimeout(700); // the sheet slides up
    await shot(page, 'docs/img/aaa-onboarding-5-break.png');
    for (const tab of ['orders', 'builds', 'relics']) {
      await page.getByTestId('tutor-ok').click();
      await expect(tour).toHaveAttribute('data-step', tab);
      await expect(page.getByTestId(`break-tab-${tab}`)).toHaveAttribute('aria-selected', 'true');
    }
    await page.getByTestId('tutor-ok').click();
    await expect(tour).toHaveCount(0);
    await leaveBreak(page);

    // 5. the first fork (Rank 4 archetype pick)
    await stepUntil(page, { kind: 'fork' });
    await expect(page.getByTestId('forks')).toBeVisible();
    await expect(page.getByTestId('tutor-fork')).toContainText('archetype');
    await shot(page, 'docs/img/aaa-onboarding-4-fork.png');
    await page.getByTestId('tutor-ok').click();
    await expect(page.getByTestId('tutor-fork')).toHaveCount(0);
    await page.getByTestId('fork-auto').click();

    expect((await tutorStore(page))?.seen.sort()).toEqual(
      ['break', 'capture', 'eye', 'fork', 'tempo'].sort(),
    );
    expect(errors).toEqual([]);
  });

  test('a second match shows nothing; Replay tutorial brings the nudges back', async ({ page }) => {
    test.setTimeout(240_000);
    const errors = watchErrors(page);
    await begin(page);
    await setTempo(page, 100);
    await step(page, 2);
    await expect(page.getByTestId('tutor')).toHaveAttribute('data-tutor', 'tempo');
    await page.getByTestId('tutor-ok').click();

    // a fresh page and a new match: Tempo full again, and no nudge (it was shown)
    await begin(page, '43');
    await setTempo(page, 100);
    await step(page, 2);
    await page.waitForTimeout(600);
    await expect(page.getByTestId('tutor')).toHaveCount(0);

    // Replay tutorial (on the title screen): the Tempo nudge shows again
    await page.goto('/?intro=off&tutorial=on');
    await page.getByTestId('replay-tutorial').click();
    await expect(page.getByTestId('replay-tutorial')).toContainText('will replay');
    expect((await tutorStore(page))?.seen).toEqual([]);
    await begin(page, '44');
    await setTempo(page, 100);
    await step(page, 2);
    await expect(page.getByTestId('tutor')).toHaveAttribute('data-tutor', 'tempo');
    expect(errors).toEqual([]);
  });

  test('Skip tutorial ends every nudge, in this match and later ones', async ({ page }) => {
    test.setTimeout(240_000);
    await begin(page);
    await setTempo(page, 100);
    await step(page, 2);
    await expect(page.getByTestId('tutor')).toBeVisible();
    await page.getByTestId('tutor-skip').click();
    await expect(page.getByTestId('tutor')).toHaveCount(0);
    expect((await tutorStore(page))?.off).toBe(true);
    // the eye badge no longer nudges
    await giveHighGround(page);
    await page.waitForTimeout(500);
    await expect(page.getByTestId('tutor')).toHaveCount(0);
    // nor does the first fork
    await stepUntil(page, { kind: 'fork' });
    await expect(page.getByTestId('forks')).toBeVisible();
    await expect(page.getByTestId('tutor-fork')).toHaveCount(0);
    expect(await snap(page).then((x) => x.forks.length)).toBeGreaterThan(0);
  });

  test('with storage blocked the nudges still work and nothing throws', async ({ page }) => {
    test.setTimeout(240_000);
    const errors = watchErrors(page);
    await page.addInitScript(() => {
      Object.defineProperty(window, 'localStorage', {
        get() {
          throw new Error('blocked');
        },
      });
    });
    await begin(page);
    await setTempo(page, 100);
    await step(page, 2);
    await expect(page.getByTestId('tutor')).toHaveAttribute('data-tutor', 'tempo');
    expect(errors.filter((e) => !/blocked/.test(e))).toEqual([]);
  });
});

test.describe('on a phone', () => {
  test.use({ viewport: { width: 360, height: 780 }, hasTouch: true, isMobile: true });

  test('the nudge fits the screen and its buttons are big enough', async ({ page }) => {
    test.setTimeout(240_000);
    await begin(page);
    await setTempo(page, 100);
    await step(page, 2);
    const tutor = page.getByTestId('tutor');
    await expect(tutor).toBeVisible();
    const box = (await tutor.boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(360);
    expect(box.y + box.height).toBeLessThanOrEqual(780);
    for (const id of ['tutor-ok', 'tutor-skip']) {
      const b = (await page.getByTestId(id).boundingBox())!;
      expect(b.height, id).toBeGreaterThanOrEqual(44);
      expect(b.width, id).toBeGreaterThanOrEqual(44);
    }
    expect(await overflow(page)).toBeLessThanOrEqual(0);
    await shot(page, 'docs/img/aaa-onboarding-phone-360.png');
  });
});
