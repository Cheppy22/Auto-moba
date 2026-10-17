import { expect, test } from '@playwright/test';
import { startLive, viewReady, watchErrors, type TestSession } from './helpers';

/** What these tests use beyond the shared helpers. */
type Sess = TestSession & {
  match: TestSession['match'] & {
    unitById(id: number): { hero?: { defId: string } } | undefined;
  };
  testEnd(winner: 'A' | 'B' | null, adjudicated?: boolean, mate?: boolean): void;
  view: { cinematic?: boolean } | null;
};

const noWebgl = (page: import('@playwright/test').Page): Promise<boolean> =>
  page.getByTestId('no-webgl').isVisible();

test('a capture knocks the piece flying and flies its token into the tray', async ({ page }) => {
  const errors = watchErrors(page);
  await startLive(page, '42');
  test.skip(await noWebgl(page), 'no WebGL in this browser');
  // count the tokens the HUD launches from the board
  await page.evaluate(() => {
    const w = window as unknown as { __tokens: number };
    w.__tokens = 0;
    new MutationObserver((ms) => {
      for (const m of ms)
        for (const n of m.addedNodes)
          if (n instanceof HTMLElement && n.dataset.testid === 'capture-token') w.__tokens++;
    }).observe(document.body, { childList: true });
  });
  // play on (the sim alone, paused) to the first piece taken
  const fallen = await page.evaluate(() => {
    const s = (window as unknown as { __session: Sess }).__session;
    const m = s.match;
    let seq = m.events.length ? (m.events[m.events.length - 1] as { seq?: number }).seq! : -1;
    for (let i = 0; i < 9000; i++) {
      if (m.state.forks.length) m.issue({ type: 'autoForks' });
      m.step(1);
      const ev = m.events as { seq: number; type: string; payload: Record<string, unknown> }[];
      for (let j = ev.length - 1; j >= 0 && ev[j].seq > seq; j--) {
        const e = ev[j];
        if (e.type === 'death' && e.payload.kind === 'hero') {
          const id = e.payload.id as number;
          return { team: e.payload.team as string, piece: m.unitById(id)?.hero?.defId ?? '' };
        }
      }
      if (ev.length) seq = ev[ev.length - 1].seq;
    }
    return null;
  });
  expect(fallen).not.toBeNull();
  const item = page.getByTestId(`tray-item-${fallen!.team}-${fallen!.piece}`);
  // the tray item waits for the token, then is caught when it lands
  await expect(item).toHaveAttribute('data-flight', 'landed', { timeout: 90_000 });
  await expect(item).toBeVisible();
  expect(await page.evaluate(() => (window as unknown as { __tokens: number }).__tokens)).toBe(1);
  expect(errors).toEqual([]);
});

test('Checkmate topples the King before the result splash', async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto('/?intro=off&run=test');
  await page.getByTestId('seed').fill('42');
  await page.getByTestId('start').click();
  await page.getByTestId('quick-start').click();
  await expect(page.getByTestId('hud')).toBeVisible();
  await viewReady(page);
  const gl = !(await noWebgl(page));
  await page.evaluate(() =>
    (window as unknown as { __session: Sess }).__session.testEnd('A', false, true),
  );
  const beat = page.getByTestId('mate-beat');
  await expect(beat).toBeVisible();
  await expect(page.getByTestId('report')).toHaveCount(0);
  if (gl) {
    expect(
      await page.evaluate(
        () => (window as unknown as { __session: Sess }).__session.view?.cinematic,
      ),
    ).toBe(true);
    // the word lands when the King hits the ground
    await expect(beat).toHaveAttribute('data-fallen', 'true', { timeout: 60_000 });
  }
  await expect(beat).toContainText('Checkmate');
  // then the splash (the beat ends itself, 7 s at most)
  await expect(page.getByTestId('report')).toBeVisible({ timeout: 60_000 });
  await expect(beat).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('a tap skips the Checkmate beat', async ({ page }) => {
  await page.goto('/?intro=off&run=test');
  await page.getByTestId('seed').fill('7');
  await page.getByTestId('start').click();
  await page.getByTestId('quick-start').click();
  await expect(page.getByTestId('hud')).toBeVisible();
  await viewReady(page);
  await page.evaluate(() =>
    (window as unknown as { __session: Sess }).__session.testEnd('B', false, true),
  );
  await page.getByTestId('mate-beat').click();
  await expect(page.getByTestId('report')).toBeVisible({ timeout: 10_000 });
});
