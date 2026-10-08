import { expect, test } from '@playwright/test';
import { eventCount, startLive, step, stepUntil, viewReady, watchErrors } from './helpers';

test.use({ viewport: { width: 800, height: 520 } });

test('3D view: camera modes, follow, caption and picking', async ({ page }) => {
  test.setTimeout(300_000);
  const errors = watchErrors(page);

  await startLive(page, '42');
  await expect(page.getByTestId('stage')).toBeVisible();
  await expect(page.getByTestId('no-webgl')).toHaveCount(0);
  await page.waitForTimeout(1500);
  const lit = await page.getByTestId('stage').screenshot();
  expect(lit.byteLength).toBeGreaterThan(20_000);

  // the director names the big plays in the caption bar
  await expect(async () => {
    await step(page, 40);
    await expect(page.getByTestId('caption')).toBeVisible({ timeout: 400 });
  }).toPass({ timeout: 60_000 });

  // free camera: caption goes, drag and zoom work
  await page.getByTestId('cam-free').click();
  await expect(page.getByTestId('caption')).toHaveCount(0);
  const box = (await page.getByTestId('stage').boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 120, box.y + box.height / 2 + 40, { steps: 6 });
  await page.mouse.up();
  await page.mouse.wheel(0, -400);

  // tap a portrait (either side): the camera follows that piece
  await page.getByTestId('roster-B-queen').click();
  await expect(page.getByTestId('cam-follow')).toHaveAttribute('aria-pressed', 'true');
  await page.getByTestId('roster-A-king').click();
  await expect(page.getByTestId('cam-follow')).toHaveAttribute('aria-pressed', 'true');
  await page.waitForTimeout(800);

  // picking: the ground under the middle of the screen, and a piece under its own projection
  await expect
    .poll(
      () =>
        page.evaluate(() => {
          interface View {
            pickGround(x: number, y: number): { x: number; y: number } | null;
            pickUnit(x: number, y: number): number | null;
            project(
              x: number,
              y: number,
              lift?: number,
            ): { x: number; y: number; visible: boolean };
          }
          interface Sess {
            view: View | null;
            match: {
              state: { teams: { A: { heroIds: number[] } } };
              unitById(id: number): { x: number; y: number; hero?: { defId: string } } | undefined;
            };
          }
          const s = (window as unknown as { __session: Sess }).__session;
          const view = s.view;
          if (!view) return 'no view';
          const rect = document.querySelector('canvas')!.getBoundingClientRect();
          const ground = view.pickGround(rect.left + rect.width / 2, rect.top + rect.height / 2);
          if (!ground) return 'no ground under the middle of the screen';
          const kingId = s.match.state.teams.A.heroIds.find(
            (id) => s.match.unitById(id)?.hero?.defId === 'king',
          )!;
          const king = s.match.unitById(kingId)!;
          const p = view.project(king.x, king.y, 20);
          if (!p.visible) return 'the followed piece is not on screen yet';
          const id = view.pickUnit(rect.left + p.x, rect.top + p.y);
          return id !== null && !!s.match.unitById(id)?.hero ? 'ok' : 'no piece under the piece';
        }),
      { timeout: 30_000 },
    )
    .toBe('ok');

  await page.getByTestId('cam-auto').click();
  await page.waitForTimeout(500);
  expect(errors).toEqual([]);
});

test('an enemy gambit is aimed with a tap on a Black piece', async ({ page }) => {
  test.setTimeout(300_000);
  const errors = watchErrors(page);
  await startLive(page, '42');
  await viewReady(page);
  const s = await stepUntil(page, { kind: 'card', target: 'enemy', cardId: 'check' });
  const slot = s.hand.find((c) => c.cardId === 'check')!.slot;
  // follow a Black piece that is still standing so it is in the middle of the screen
  const piece = await page.evaluate(() => {
    interface Sess {
      match: {
        state: { teams: { B: { heroIds: number[] } } };
        unitById(id: number): { alive: boolean; hero?: { defId: string } } | undefined;
      };
    }
    const s = (window as unknown as { __session: Sess }).__session;
    const ids = s.match.state.teams.B.heroIds;
    const alive = ids.map((id) => s.match.unitById(id)!).find((u) => u.alive);
    return alive!.hero!.defId;
  });
  await page.getByTestId(`roster-B-${piece}`).click();
  await page.getByTestId(`gambit-${slot}`).click();
  await expect(page.getByTestId('aim-hint')).toContainText('Tap a Black piece');
  const handle = await page.waitForFunction(
    (defId) => {
      interface Sess {
        view: {
          project(x: number, y: number, lift?: number): { x: number; y: number; visible: boolean };
        };
        match: {
          state: { teams: { B: { heroIds: number[] } } };
          unitById(id: number): { x: number; y: number; hero?: { defId: string } } | undefined;
        };
      }
      const s = (window as unknown as { __session: Sess }).__session;
      const id = s.match.state.teams.B.heroIds.find(
        (i) => s.match.unitById(i)?.hero?.defId === defId,
      )!;
      const u = s.match.unitById(id)!;
      const p = s.view.project(u.x, u.y, 20);
      const rect = document.querySelector('canvas')!.getBoundingClientRect();
      const inside =
        p.visible &&
        p.x > rect.width * 0.25 &&
        p.x < rect.width * 0.75 &&
        p.y > rect.height * 0.25 &&
        p.y < rect.height * 0.65;
      return inside ? { x: rect.left + p.x, y: rect.top + p.y } : null;
    },
    piece,
    { timeout: 40_000 },
  );
  const at = (await handle.jsonValue()) as { x: number; y: number };
  const before = await eventCount(page, 'gambit');
  await page.mouse.click(at.x, at.y);
  await expect.poll(() => eventCount(page, 'gambit')).toBe(before + 1);
  await expect(page.getByTestId('aim')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('without WebGL the game shows a clear message and the HUD still works', async ({ page }) => {
  await page.addInitScript(() => {
    const real = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (
      this: HTMLCanvasElement,
      ...args: Parameters<typeof real>
    ) {
      if (/webgl/i.test(String(args[0]))) return null;
      return real.apply(this, args);
    } as typeof real;
  });
  await startLive(page, '42');
  const notice = page.getByTestId('no-webgl');
  await expect(notice).toBeVisible();
  await expect(notice).toContainText('WebGL');
  await expect(page.getByTestId('stage')).toBeHidden();
  await expect(page.getByTestId('hand')).toBeVisible();
  await expect(page.getByTestId('speed-2')).toBeVisible();
});
