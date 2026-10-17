import { expect, test, type CDPSession, type Page } from '@playwright/test';
import { bareGround, camMode, playToEnd, setAuto, startLive, step, watchErrors } from './helpers';

/** What these tests read from the page beyond the shared helpers (dev builds expose `__tvCam`). */
interface Long {
  __session: {
    ui: { zoomLane: string | null; follow: number | null };
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
  __tvCam(o: object): { x: number; z: number; d: number; yaw: number; tilt: number };
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

/** The camera's pose right now (target, distance, yaw and tilt in radians). */
const pose = (page: Page) => page.evaluate(() => (window as unknown as Long).__tvCam({}));

/** Waits until the eased camera holds still (software WebGL draws slowly, so easing takes a while). */
async function settle(page: Page): Promise<void> {
  let last = { x: NaN, z: NaN, d: NaN, yaw: NaN, tilt: NaN };
  await expect
    .poll(
      async () => {
        const p = await pose(page);
        const moved =
          Math.hypot(p.x - last.x, p.z - last.z) +
          Math.abs(p.d - last.d) * 0.1 +
          Math.abs(p.yaw - last.yaw) * 500 +
          Math.abs(p.tilt - last.tilt) * 500;
        last = p;
        return moved < 1;
      },
      { timeout: 60_000, intervals: [300] },
    )
    .toBe(true);
}

/** Screen distance between two sim points (bigger means zoomed in). */
async function span(page: Page): Promise<number> {
  const a = await screenOf(page, 1000, 2600);
  const b = await screenOf(page, 1000, 3000);
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/** One multi-finger touch step through the DevTools protocol (Playwright has no pinch API). */
async function touch(
  cdp: CDPSession,
  type: 'touchStart' | 'touchMove' | 'touchEnd',
  pts: { x: number; y: number }[],
): Promise<void> {
  await cdp.send('Input.dispatchTouchEvent', {
    type,
    touchPoints: pts.map((p, id) => ({ x: p.x, y: p.y, id })),
  });
}

/** Moves two fingers from `a` to `b` (each a pair of points) in `n` steps, then lifts them. */
async function twoFinger(
  page: Page,
  a: [{ x: number; y: number }, { x: number; y: number }],
  b: [{ x: number; y: number }, { x: number; y: number }],
  n = 12,
): Promise<void> {
  const cdp = await page.context().newCDPSession(page);
  await touch(cdp, 'touchStart', a);
  for (let i = 1; i <= n; i++) {
    const t = i / n;
    const at = (k: 0 | 1) => ({
      x: a[k].x + (b[k].x - a[k].x) * t,
      y: a[k].y + (b[k].y - a[k].y) * t,
    });
    await touch(cdp, 'touchMove', [at(0), at(1)]);
  }
  await touch(cdp, 'touchEnd', []);
  await cdp.detach();
}

/** Finds a spot where a tap picks the piece `defId` of a team (as a player taps what they see). */
async function pieceSpot(page: Page, defId: string): Promise<{ x: number; y: number }> {
  const handle = await page.waitForFunction(
    (piece) => {
      const s = (window as unknown as Long).__session;
      if (!s.view) return null;
      const id = s.match.state.teams.A.heroIds.find(
        (i) => s.match.unitById(i)?.hero?.defId === piece,
      )!;
      const u = s.match.unitById(id)!;
      const p = s.view.project(u.x, u.y, 20);
      const rect = document.querySelector('canvas')!.getBoundingClientRect();
      if (!p.visible) return null;
      for (let r = 0; r <= 60; r += 6)
        for (let a = 0; a < 12; a++) {
          const x = rect.left + p.x + Math.cos((a * Math.PI) / 6) * r;
          const y = rect.top + p.y + Math.sin((a * Math.PI) / 6) * r;
          if (document.elementFromPoint(x, y) !== document.querySelector('canvas')) continue;
          if (s.view.pickUnit(x, y) === id) return { x, y };
        }
      return null;
    },
    defId,
    { timeout: 60_000, polling: 250 },
  );
  return (await handle.jsonValue()) as { x: number; y: number };
}

test.describe('the Long Board, desktop', () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test('is the default map and fills the screen, side-on with White on the left', async ({
    page,
  }) => {
    test.setTimeout(300_000);
    const errors = watchErrors(page);
    await startLive(page, '42');
    expect(
      await page.evaluate(() => (window as unknown as Long).__session.match.content.map.length),
    ).toBe(4000);
    await expect(page.getByTestId('no-webgl')).toHaveCount(0);
    // the 3D view is the whole screen; the HUD floats over it
    const box = (await page.getByTestId('stage').boundingBox())!;
    expect(box.x).toBe(0);
    expect(box.y).toBe(0);
    expect(box.width).toBe(1280);
    expect(box.height).toBe(800);
    await step(page, 120);
    await settle(page);
    const lit = await page.getByTestId('stage').screenshot();
    expect(lit.byteLength).toBeGreaterThan(20_000);
    // a wide screen sees the board side-on: White's base on the left, Black's on the right, level
    const white = await screenOf(page, 1000, 3740);
    const black = await screenOf(page, 1000, 260);
    expect(white.x).toBeGreaterThan(102);
    expect(white.x).toBeLessThan(400);
    expect(black.x).toBeGreaterThan(880);
    expect(black.x).toBeLessThan(1280);
    expect(Math.abs(white.y - black.y)).toBeLessThan(60);
    // both side lanes in view
    for (const x of [300, 1700]) {
      const p = await screenOf(page, x, 2000);
      expect(p.y).toBeGreaterThan(0);
      expect(p.y).toBeLessThan(800);
    }
    expect(await camMode(page)).toBe('free');
    await expect(page.getByTestId('compass')).toHaveCount(0);
    expect(errors).toEqual([]);
  });

  test('free camera: drag pans, the wheel zooms, a right drag turns and tilts, the compass resets', async ({
    page,
  }) => {
    test.setTimeout(300_000);
    const errors = watchErrors(page);
    await startLive(page, '42');
    await step(page, 60);
    await settle(page);
    // a drag pans: the ground under the pointer follows it
    const g0 = await screenOf(page, 1000, 3000);
    await page.mouse.move(640, 500);
    await page.mouse.down();
    await page.mouse.move(640, 300, { steps: 10 });
    await page.mouse.up();
    await settle(page);
    const g1 = await screenOf(page, 1000, 3000);
    expect(g0.y - g1.y).toBeGreaterThan(120);
    expect(await camMode(page)).toBe('free');
    // the wheel zooms in toward the pointer
    const s0 = await span(page);
    await page.mouse.move(640, 400);
    await page.mouse.wheel(0, -500);
    await settle(page);
    expect(await span(page)).toBeGreaterThan(s0 * 1.3);
    // a right drag turns (sideways) and tilts (up and down); the compass shows
    const p0 = await pose(page);
    await page.mouse.move(640, 400);
    await page.mouse.down({ button: 'right' });
    await page.mouse.move(820, 330, { steps: 10 });
    await page.mouse.up({ button: 'right' });
    await settle(page);
    const p1 = await pose(page);
    expect(Math.abs(p1.yaw - p0.yaw)).toBeGreaterThan(0.5);
    expect(p1.tilt).toBeLessThan(p0.tilt - 0.1);
    // never below the lowest tilt
    expect(p1.tilt).toBeGreaterThan((24.9 * Math.PI) / 180);
    await expect(page.getByTestId('compass')).toBeVisible();
    // Q and E turn too
    await page.keyboard.press('e');
    await settle(page);
    expect(Math.abs((await pose(page)).yaw - p1.yaw)).toBeGreaterThan(0.2);
    // the compass eases back to the default angle (side-on on a wide screen) and hides
    await page.getByTestId('compass').click();
    await settle(page);
    const p2 = await pose(page);
    const off = p2.yaw - Math.PI / 2;
    expect(Math.abs(Math.atan2(Math.sin(off), Math.cos(off)))).toBeLessThan(0.05);
    await expect(page.getByTestId('compass')).toHaveCount(0);
    expect(errors).toEqual([]);
  });

  test('Auto is a switch; a drag turns it off and leaves the camera where it is', async ({
    page,
  }) => {
    test.setTimeout(300_000);
    const errors = watchErrors(page);
    await startLive(page, '42');
    await setAuto(page, true);
    expect(await camMode(page)).toBe('auto');
    await step(page, 200);
    await settle(page);
    const before = await pose(page);
    await page.mouse.move(640, 400);
    await page.mouse.down();
    await page.mouse.move(700, 420, { steps: 6 });
    await page.mouse.up();
    expect(await camMode(page)).toBe('free');
    await expect(page.getByTestId('auto-btn')).toHaveAttribute('aria-pressed', 'false');
    await settle(page);
    // from where the director had it, moved only by the drag
    const after = await pose(page);
    expect(Math.abs(after.d - before.d)).toBeLessThan(before.d * 0.05);
    await setAuto(page, true);
    await setAuto(page, false);
    expect(await camMode(page)).toBe('free');
    expect(errors).toEqual([]);
  });

  test('a tap on a piece follows it and opens its card; bare ground frees the camera', async ({
    page,
  }) => {
    test.setTimeout(300_000);
    const errors = watchErrors(page);
    await startLive(page, '42');
    await step(page, 200);
    await settle(page);
    // the King walks: find him again and retap until the tap lands
    await expect(async () => {
      const at = await pieceSpot(page, 'king');
      await page.mouse.click(at.x, at.y);
      await expect(page.getByTestId('unit-card')).toBeVisible({ timeout: 1500 });
    }).toPass({ timeout: 120_000 });
    await expect(page.getByTestId('unit-card')).toHaveAttribute('data-piece', 'king');
    expect(await camMode(page)).toBe('follow');
    await expect(page.getByTestId('roster-A-king')).toHaveClass(/followed/);
    await settle(page);
    // a tap on open ground (no unit, no lane) closes the card and frees the camera where it is
    const bare = await bareGround(page);
    expect(bare).not.toBeNull();
    const before = await pose(page);
    await page.mouse.click(bare!.x, bare!.y);
    await expect(page.getByTestId('unit-card')).toHaveCount(0);
    expect(await camMode(page)).toBe('free');
    const after = await pose(page);
    expect(Math.abs(after.d - before.d)).toBeLessThan(before.d * 0.1);
    expect(errors).toEqual([]);
  });

  test('the report replay map draws the long board on its side', async ({ page }) => {
    test.setTimeout(600_000);
    const errors = watchErrors(page);
    await startLive(page, '42');
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

test.describe('the Long Board, phone portrait', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test('touch: one finger pans, pinch zooms, twist turns, two fingers tilt; a lane tap leans in', async ({
    page,
  }) => {
    test.setTimeout(300_000);
    const errors = watchErrors(page);
    await startLive(page, '42');
    await step(page, 60);
    await settle(page);
    // the board's full width across the screen, White's base above the bottom HUD
    for (const x of [300, 1700]) {
      const p = await screenOf(page, x, 3100);
      expect(p.x).toBeGreaterThan(-1);
      expect(p.x).toBeLessThan(391);
    }
    const bottom = await page.evaluate(() =>
      parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--hud-bottom')),
    );
    expect((await screenOf(page, 1000, 3740)).y).toBeLessThan(844 - bottom);

    // one finger pans
    const g0 = await screenOf(page, 1000, 2400);
    const cdp = await page.context().newCDPSession(page);
    await touch(cdp, 'touchStart', [{ x: 195, y: 420 }]);
    for (let i = 1; i <= 10; i++) await touch(cdp, 'touchMove', [{ x: 195, y: 420 + i * 12 }]);
    await touch(cdp, 'touchEnd', []);
    await cdp.detach();
    await settle(page);
    const g1 = await screenOf(page, 1000, 2400);
    expect(g1.y - g0.y).toBeGreaterThan(70);

    // pinch out (fingers apart) zooms in
    const s0 = await span(page);
    await twoFinger(
      page,
      [
        { x: 195, y: 380 },
        { x: 195, y: 460 },
      ],
      [
        { x: 195, y: 300 },
        { x: 195, y: 540 },
      ],
    );
    await settle(page);
    expect(await span(page)).toBeGreaterThan(s0 * 1.6);

    // twist turns the board; the compass shows, and resets
    const y0 = (await pose(page)).yaw;
    await twoFinger(
      page,
      [
        { x: 135, y: 420 },
        { x: 255, y: 420 },
      ],
      [
        { x: 165, y: 360 },
        { x: 225, y: 480 },
      ],
    );
    await settle(page);
    expect(Math.abs((await pose(page)).yaw - y0)).toBeGreaterThan(0.4);
    await expect(page.getByTestId('compass')).toBeVisible();
    await page.getByTestId('compass').tap();
    await settle(page);
    await expect(page.getByTestId('compass')).toHaveCount(0);

    // two fingers dragged up together tilt toward the horizon
    const t0 = (await pose(page)).tilt;
    await twoFinger(
      page,
      [
        { x: 150, y: 520 },
        { x: 240, y: 520 },
      ],
      [
        { x: 150, y: 400 },
        { x: 240, y: 400 },
      ],
    );
    await settle(page);
    expect((await pose(page)).tilt).toBeLessThan(t0 - 0.15);
    await page.getByTestId('compass').tap();
    await settle(page);
    expect(await camMode(page)).toBe('free');

    // a tap on a lane with no unit on it leans in on that lane
    await page.evaluate(() => (window as unknown as Long).__tvCam({ home: true }));
    await settle(page);
    const lane = await page.evaluate(() => {
      const s = (window as unknown as Long).__session;
      const rect = document.querySelector('canvas')!.getBoundingClientRect();
      for (let y = 2400; y <= 3100; y += 50) {
        const p = s.view!.project(1625, y);
        const x = rect.left + p.x;
        const yy = rect.top + p.y;
        if (document.elementFromPoint(x, yy) !== document.querySelector('canvas')) continue;
        if (s.view!.pickUnit(x, yy) === null) return { x, y: yy };
      }
      return null;
    });
    expect(lane).not.toBeNull();
    await page.touchscreen.tap(lane!.x, lane!.y);
    await expect
      .poll(() => page.evaluate(() => (window as unknown as Long).__session.ui.zoomLane))
      .toBe('bot');
    expect(await camMode(page)).toBe('lane');
    expect(errors).toEqual([]);
  });

  test('the theme picker switches Slate garden and Lamplit parterre, remembers it, and repaints the match', async ({
    page,
  }) => {
    test.setTimeout(300_000);
    const errors = watchErrors(page);
    await page.goto('/?intro=off');
    await page.evaluate(() => localStorage.removeItem('automoba.mapstyle'));
    await page.reload();
    await expect(page.getByTestId('theme-a')).toHaveAttribute('aria-checked', 'true');
    await page.getByTestId('theme-b').click();
    await expect(page.getByTestId('theme-b')).toHaveAttribute('aria-checked', 'true');
    await page.reload();
    await expect(page.getByTestId('theme-b')).toHaveAttribute('aria-checked', 'true');
    // the match starts in b
    await startLive(page, '42');
    await expect(page.getByTestId('stage')).toHaveAttribute('data-theme', 'b');
    await step(page, 60);
    await page.waitForTimeout(1500);
    const shotB = await page.getByTestId('stage').screenshot();
    // switch to a from the Adjourn panel: the board repaints at once, the camera stays
    await page.getByTestId('adjourn').click();
    await page.getByTestId('theme-a').click();
    await expect(page.getByTestId('theme-a')).toHaveAttribute('aria-checked', 'true');
    await page.getByTestId('resume').click();
    await expect(page.getByTestId('stage')).toHaveAttribute('data-theme', 'a');
    await page.waitForTimeout(1500);
    const shotA = await page.getByTestId('stage').screenshot();
    expect(shotA.equals(shotB)).toBe(false);
    expect(await page.evaluate(() => localStorage.getItem('automoba.mapstyle'))).toBe('a');
    // ?mapstyle= overrides the remembered theme for the visit
    await page.goto('/?intro=off&mapstyle=b');
    await expect(page.getByTestId('theme-b')).toHaveAttribute('aria-checked', 'true');
    expect(errors).toEqual([]);
  });

  test('Ink style switches on and off in a live match, is remembered, and ?fx=ink forces it', async ({
    page,
  }) => {
    test.setTimeout(300_000);
    const errors = watchErrors(page);
    const inked = () =>
      page.evaluate(
        () =>
          (window as unknown as { __session: { view: { inked: boolean } } }).__session.view.inked,
      );
    await page.goto('/?intro=off');
    await page.evaluate(() => localStorage.removeItem('automoba.ink'));
    await startLive(page, '42');
    // off by default
    await expect(page.getByTestId('stage')).toHaveAttribute('data-ink', 'off');
    expect(await inked()).toBe(false);
    await step(page, 60);
    await page.waitForTimeout(1500);
    const plain = await page.getByTestId('stage').screenshot();
    // on from the Adjourn panel: the next frames go through the ink pass
    await page.getByTestId('adjourn').click();
    await expect(page.getByTestId('ink-toggle')).toHaveAttribute('aria-checked', 'false');
    await page.getByTestId('ink-toggle').click();
    await expect(page.getByTestId('ink-toggle')).toHaveAttribute('aria-checked', 'true');
    await page.getByTestId('resume').click();
    await expect(page.getByTestId('stage')).toHaveAttribute('data-ink', 'on');
    expect(await inked()).toBe(true);
    await page.waitForTimeout(2500);
    const ink = await page.getByTestId('stage').screenshot();
    expect(ink.byteLength).toBeGreaterThan(20_000);
    expect(ink.equals(plain)).toBe(false);
    expect(await page.evaluate(() => localStorage.getItem('automoba.ink'))).toBe('on');
    // and off again
    await page.getByTestId('adjourn').click();
    await page.getByTestId('ink-toggle').click();
    await page.getByTestId('resume').click();
    await expect(page.getByTestId('stage')).toHaveAttribute('data-ink', 'off');
    expect(await inked()).toBe(false);
    await page.waitForTimeout(1000);
    // the address forces it for a visit
    await page.goto('/?intro=off&fx=ink');
    await expect(page.getByTestId('ink-toggle')).toHaveAttribute('aria-checked', 'true');
    expect(errors).toEqual([]);
  });
});

test.describe('the square map', () => {
  test.use({ viewport: { width: 800, height: 520 } });

  test('?map=square still plays on the table', async ({ page }) => {
    test.setTimeout(300_000);
    const errors = watchErrors(page);
    await startLive(page, '42', true, false, '&map=square');
    const map = await page.evaluate(() => (window as unknown as Long).__session.match.content.map);
    expect(map.length).toBeUndefined();
    await step(page, 400);
    await page.waitForTimeout(1500);
    const lit = await page.getByTestId('stage').screenshot();
    expect(lit.byteLength).toBeGreaterThan(20_000);
    // the free camera works here too
    await page.mouse.move(400, 260);
    await page.mouse.wheel(0, -400);
    await page.getByTestId('lane-bar-mid').click();
    expect(await camMode(page)).toBe('lane');
    await page.keyboard.press('Escape');
    expect(await camMode(page)).toBe('free');
    expect(errors).toEqual([]);
  });
});
