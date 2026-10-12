import { expect, test, type Page } from '@playwright/test';
import { playToEnd, startLive, step, watchErrors } from './helpers';

/** What these tests read from the page beyond the shared helpers (dev builds expose `__tvBoard`). */
interface Long {
  __session: {
    ui: { zoomLane: string | null };
    view: {
      project(x: number, y: number, lift?: number): { x: number; y: number; visible: boolean };
      pickUnit(x: number, y: number): number | null;
    } | null;
    match: {
      content: { map: { size: number; length?: number } };
      state: { teams: { A: { heroIds: number[] } } };
      unitById(id: number): { x: number; y: number; hero?: { defId: string } } | undefined;
    };
  };
  __tvBoard(): { box: number[]; w: number; h: number };
}

/** Where a sim point lands on the page (CSS px, viewport coordinates). */
function screenOf(page: Page, x: number, y: number): Promise<{ x: number; y: number }> {
  return page.evaluate(
    ([px, py]) => {
      const w = window as unknown as Long;
      const p = w.__session.view!.project(px, py);
      const r = document.querySelector('canvas')!.getBoundingClientRect();
      return { x: r.left + p.x, y: r.top + p.y };
    },
    [x, y],
  );
}

/** Waits until the eased camera holds still (software WebGL draws slowly, so easing takes a while). */
async function settle(page: Page): Promise<void> {
  let last = { x: NaN, y: NaN };
  await expect
    .poll(
      async () => {
        const p = await screenOf(page, 1000, 2000);
        const moved = Math.hypot(p.x - last.x, p.y - last.y);
        last = p;
        return moved < 0.5;
      },
      { timeout: 60_000, intervals: [250] },
    )
    .toBe(true);
}

/** The Long Board, in the map style `PW_MAPSTYLE` names (a, b or old; the default is a). */
const LONG = `&map=long${process.env.PW_MAPSTYLE ? `&mapstyle=${process.env.PW_MAPSTYLE}` : ''}`;

const board = (page: Page) => page.evaluate(() => (window as unknown as Long).__tvBoard());

test.describe('the Long Board (?map=long), desktop', () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test('starts, draws the long board across the screen, the lane camera leans in, drags and zooms', async ({
    page,
  }) => {
    test.setTimeout(300_000);
    const errors = watchErrors(page);
    await startLive(page, '42', true, false, LONG);
    expect(
      await page.evaluate(() => (window as unknown as Long).__session.match.content.map.length),
    ).toBe(4000);
    await expect(page.getByTestId('no-webgl')).toHaveCount(0);
    await step(page, 120);
    await settle(page);
    const lit = await page.getByTestId('stage').screenshot();
    expect(lit.byteLength).toBeGreaterThan(20_000);
    // the whole board lies across a wide screen: White's base on the left, Black's on the right
    const b = await board(page);
    expect(b.w).toBeGreaterThan(b.h * 2);
    const white = await screenOf(page, 1000, 3740);
    const black = await screenOf(page, 1000, 260);
    expect(black.x - white.x).toBeGreaterThan(700);

    // a lane chip leans in on the lane; the view is closer than the whole board
    const far = await screenOf(page, 1000, 2200);
    const farGap = Math.abs((await screenOf(page, 1000, 1800)).x - far.x);
    await page.getByTestId('lane-bar-mid').click();
    expect(await page.evaluate(() => (window as unknown as Long).__session.ui.zoomLane)).toBe(
      'mid',
    );
    await settle(page);
    const p0 = await screenOf(page, 1000, 2200);
    const gap = Math.abs((await screenOf(page, 1000, 1800)).x - p0.x);
    expect(gap).toBeGreaterThan(farGap * 1.3);

    // a drag slides the view along the lane (a point on the lane moves with the finger)
    await page.mouse.move(640, 430);
    await page.mouse.down();
    await page.mouse.move(340, 430, { steps: 8 });
    await page.mouse.up();
    await settle(page);
    const p1 = await screenOf(page, 1000, 2200);
    expect(p0.x - p1.x).toBeGreaterThan(120);
    expect(await page.evaluate(() => (window as unknown as Long).__session.ui.zoomLane)).toBe(
      'mid',
    );

    // the wheel zooms in closer
    await page.mouse.move(640, 430);
    await page.mouse.wheel(0, -500);
    await settle(page);
    const q0 = await screenOf(page, 1000, 2200);
    const zoomed = Math.abs((await screenOf(page, 1000, 1800)).x - q0.x);
    expect(zoomed).toBeGreaterThan(gap * 1.2);
    expect(errors).toEqual([]);
  });

  test('a tap on a piece opens its card', async ({ page }) => {
    test.setTimeout(300_000);
    const errors = watchErrors(page);
    await startLive(page, '42', true, false, LONG);
    await step(page, 200);
    await page.getByTestId('roster-A-king').click();
    await expect(page.getByTestId('cam-btn')).toHaveAttribute('data-mode', 'follow');
    await page.waitForTimeout(3000);
    // the camera may still drift between finding the piece and the tap: find it again and retap
    await expect(async () => {
      const handle = await page.waitForFunction(
        () => {
          const s = (window as unknown as Long).__session;
          if (!s.view) return null;
          const id = s.match.state.teams.A.heroIds.find(
            (i) => s.match.unitById(i)?.hero?.defId === 'king',
          )!;
          const u = s.match.unitById(id)!;
          const p = s.view.project(u.x, u.y, 20);
          const rect = document.querySelector('canvas')!.getBoundingClientRect();
          const inside =
            p.visible &&
            p.x > rect.width * 0.3 &&
            p.x < rect.width * 0.7 &&
            p.y > rect.height * 0.25 &&
            p.y < rect.height * 0.75;
          // software WebGL draws slowly, so the camera eases in for a while: wait until it holds still
          const w = window as unknown as { __kingAt?: { x: number; y: number } };
          const last = w.__kingAt;
          w.__kingAt = { x: p.x, y: p.y };
          if (!inside || !last || Math.hypot(last.x - p.x, last.y - p.y) > 0.5) return null;
          // the drawn piece may stand a little off its sim spot (pieces make room near a Bastion):
          // find where a tap picks it, as a player taps what they see
          for (let r = 0; r <= 60; r += 6)
            for (let a = 0; a < 12; a++) {
              const x = rect.left + p.x + Math.cos((a * Math.PI) / 6) * r;
              const y = rect.top + p.y + Math.sin((a * Math.PI) / 6) * r;
              if (s.view.pickUnit(x, y) === id) return { x, y };
            }
          return null;
        },
        undefined,
        { timeout: 60_000, polling: 250 },
      );
      const at = (await handle.jsonValue()) as { x: number; y: number };
      await page.mouse.click(at.x, at.y);
      await expect(page.getByTestId('unit-card')).toBeVisible({ timeout: 1500 });
    }).toPass({ timeout: 120_000 });
    await expect(page.getByTestId('unit-card')).toHaveAttribute('data-piece', 'king');
    expect(errors).toEqual([]);
  });

  test('the report replay map draws the long board on its side', async ({ page }) => {
    test.setTimeout(600_000);
    const errors = watchErrors(page);
    await startLive(page, '42', true, false, LONG);
    await playToEnd(page);
    await expect(page.getByTestId('report')).toBeVisible();
    await page.locator('[data-testid^="report-hero-"]').first().click();
    await page.getByTestId('open-replay').click();
    await expect(page.getByTestId('replay')).toBeVisible();
    const canvas = page.locator('.rp-replay-canvas');
    await expect(canvas).toHaveClass(/long/);
    const box = (await canvas.boundingBox())!;
    expect(box.width / box.height).toBeCloseTo(2, 1);
    expect(errors).toEqual([]);
  });
});

test.describe('the Long Board (?map=long), phone portrait', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test('the long axis runs up the screen and a tap on a lane leans in', async ({ page }) => {
    test.setTimeout(300_000);
    const errors = watchErrors(page);
    await startLive(page, '42', true, false, LONG);
    await step(page, 60);
    await settle(page);
    const b = await board(page);
    expect(b.h).toBeGreaterThan(b.w * 1.5);
    const white = await screenOf(page, 1000, 3740);
    const black = await screenOf(page, 1000, 260);
    expect(white.y - black.y).toBeGreaterThan(350);
    // the board sits between the HUD bands
    const top = await page.evaluate(() =>
      parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--hud-top')),
    );
    expect(b.box[1]).toBeGreaterThanOrEqual(top - 1);
    // tap the Right lane on White's terrace: the camera leans in on it
    const p = await screenOf(page, 1625, 2900);
    await page.touchscreen.tap(p.x, p.y);
    await expect
      .poll(() => page.evaluate(() => (window as unknown as Long).__session.ui.zoomLane))
      .toBe('bot');
    expect(errors).toEqual([]);
  });
});

test.describe('the Long Board map styles', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  for (const style of ['b', 'old'] as const)
    test(`?mapstyle=${style} draws the board`, async ({ page }) => {
      test.setTimeout(300_000);
      const errors = watchErrors(page);
      await startLive(page, '42', true, false, `&map=long&mapstyle=${style}`);
      await step(page, 60);
      await expect(page.getByTestId('no-webgl')).toHaveCount(0);
      const lit = await page.getByTestId('stage').screenshot();
      expect(lit.byteLength).toBeGreaterThan(20_000);
      const b = await board(page);
      expect(b.h).toBeGreaterThan(b.w * 1.5);
      expect(errors).toEqual([]);
    });
});
