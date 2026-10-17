import { expect, test } from '@playwright/test';
import { boxOf, overflow, startLive, step, watchErrors } from './helpers';

/** The portrait HUD's two top rows (2026-10-17): every target reachable, 44 px, nothing overflows. */

const SIZES = [
  { w: 360, h: 780 },
  { w: 390, h: 844 },
];
const PIECES = ['king', 'queen', 'rook', 'bishop', 'knight'];

for (const { w, h } of SIZES) {
  test.describe(`portrait ${w}x${h}`, () => {
    test.use({ viewport: { width: w, height: h }, hasTouch: true, isMobile: true });

    test('two top rows: every control is reachable, 44 px and inside the screen', async ({
      page,
    }) => {
      test.setTimeout(240_000);
      const errors = watchErrors(page);
      await startLive(page);
      await expect(page.getByTestId('hud')).toHaveAttribute('data-shape', 'stack');
      expect(await overflow(page)).toBeLessThanOrEqual(0);

      // the chrome on top is two rows: under 16% of the screen (it was about 20%)
      const bar = await boxOf(page, 'court-bar');
      expect(bar.y + bar.height).toBeLessThan(h * 0.16);

      const ids = [
        'speed-chip',
        'auto-btn',
        'adjourn',
        'lane-bar-top',
        'lane-bar-mid',
        'lane-bar-bot',
        ...PIECES.map((p) => `roster-B-${p}`),
        ...PIECES.map((p) => `roster-A-${p}`),
      ];
      const row1: number[] = [];
      const row2: number[] = [];
      for (const id of ids) {
        const b = await boxOf(page, id);
        expect(b.width, `${id} wide enough`).toBeGreaterThanOrEqual(44);
        expect(b.height, `${id} tall enough`).toBeGreaterThanOrEqual(44);
        expect(b.x, `${id} inside on the left`).toBeGreaterThanOrEqual(0);
        expect(b.x + b.width, `${id} inside on the right`).toBeLessThanOrEqual(w + 0.5);
        expect(b.y + b.height, `${id} above the bottom`).toBeLessThanOrEqual(h);
        if (['speed-chip', 'auto-btn', 'adjourn'].includes(id)) row1.push(b.y);
        if (id.startsWith('lane-bar') || id.startsWith('roster-B')) row2.push(b.y);
      }
      // Pause, Auto and Adjourn share a row; the lane chips and Black's tokens share the next
      expect(Math.max(...row1) - Math.min(...row1)).toBeLessThan(2);
      expect(Math.max(...row2) - Math.min(...row2)).toBeLessThan(8);
      expect(Math.min(...row2)).toBeGreaterThan(Math.max(...row1) + 40);
      // the clock case is whole, not cut by the controls
      const clock = await boxOf(page, 'score');
      const speed = await boxOf(page, 'speed-chip');
      expect(clock.x + clock.width).toBeLessThanOrEqual(speed.x + 1);

      // the lane chips still lean the camera in
      await page.getByTestId('lane-bar-top').tap();
      await expect(page.getByTestId('hud')).toHaveAttribute('data-cam', 'lane');
      await page.getByTestId('lane-bar-top').tap();
      await expect(page.getByTestId('hud')).not.toHaveAttribute('data-cam', 'lane');
      expect(errors).toEqual([]);
    });

    test('the trays show only while a piece is down, under the bar', async ({ page }) => {
      test.setTimeout(240_000);
      await startLive(page);
      const opacity = (id: string): Promise<number> =>
        page.getByTestId(id).evaluate((el) => Number(getComputedStyle(el).opacity));
      expect(await opacity('tray-A')).toBe(0);
      expect(await opacity('tray-B')).toBe(0);
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
        for (let i = 0; i < 800; i++) {
          s.match.step(20);
          if (s.match.state.forks.length > 0) s.match.issue({ type: 'autoForks' });
          if (s.match.events.some((e) => e.type === 'death' && e.payload.kind === 'hero')) break;
        }
        s.notify();
      });
      await step(page, 1);
      const bar = await boxOf(page, 'court-bar');
      await expect
        .poll(async () => Math.max(await opacity('tray-A'), await opacity('tray-B')))
        .toBe(1);
      for (const id of ['tray-A', 'tray-B']) {
        if ((await opacity(id)) < 1) continue;
        const b = await boxOf(page, id);
        expect(b.y).toBeGreaterThanOrEqual(bar.y + bar.height - 1);
        expect(b.x).toBeGreaterThanOrEqual(0);
        expect(b.x + b.width).toBeLessThanOrEqual(w);
        expect(b.height).toBeGreaterThanOrEqual(44);
      }
      expect(await overflow(page)).toBeLessThanOrEqual(0);
    });
  });
}
