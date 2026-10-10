import { expect, test } from '@playwright/test';
import { setSpeed, setTempo, snap, startLive, stepUntil, watchErrors } from './helpers';

test.use({ viewport: { width: 800, height: 520 } });

/** The page-side view of the session that these tests poke at. */
interface Page2 {
  match: {
    step(n: number): number;
    snapshot(): {
      units: {
        id: number;
        team: string;
        piece: string | null;
        lane: string | null;
        inCombat: boolean;
      }[];
    };
    issue(cmd: Record<string, unknown>): { ok: boolean };
    state: { forks: unknown[] };
  };
  notify(): void;
}

test('long-pressing a gambit card opens it enlarged and pauses the game until it closes', async ({
  page,
}) => {
  test.setTimeout(240_000);
  const errors = watchErrors(page);
  await startLive(page, '42');
  await setTempo(page, 100);
  const s0 = await stepUntil(page, { kind: 'card', target: 'lane' });
  const slot = s0.hand.find((c) => c.target === 'lane' && c.usable)!.slot;

  // the clock runs at 1x
  await setSpeed(page, 1);
  const t0 = (await snap(page)).tick;
  await expect.poll(async () => (await snap(page)).tick, { timeout: 20_000 }).toBeGreaterThan(t0);

  // hold the card: the sheet opens with its details and the clock stops
  const box = (await page.getByTestId(`gambit-${slot}`).boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await expect(page.getByTestId('gambit-info')).toBeVisible({ timeout: 15_000 });
  await page.mouse.up();
  await expect(page.getByTestId('gambit-info')).toBeVisible();
  await expect(page.getByTestId('gambit-info-name')).not.toBeEmpty();
  await expect(page.getByTestId('gambit-info-cost')).toContainText('Tempo');
  await expect(page.getByTestId('gambit-info-desc')).not.toBeEmpty();
  await expect(page.getByTestId('gambit-info-target')).toContainText('lane');
  await expect(page.getByTestId('gambit-info-expiry')).toContainText('Expires');
  const frozen = (await snap(page)).tick;
  await page.waitForTimeout(1500);
  expect((await snap(page)).tick).toBe(frozen);
  await expect(page.getByTestId('aim')).toHaveCount(0);

  // Close resumes at the old speed
  await page.getByTestId('gambit-info-close').click();
  await expect(page.getByTestId('gambit-info')).toHaveCount(0);
  await expect(page.getByTestId('speed-chip')).toHaveAttribute('data-speed', '1');
  await expect
    .poll(async () => (await snap(page)).tick, { timeout: 20_000 })
    .toBeGreaterThan(frozen);

  // right-click opens the same sheet; Play closes it and starts aiming like a tap
  await page.getByTestId(`gambit-${slot}`).click({ button: 'right' });
  await expect(page.getByTestId('gambit-info')).toBeVisible();
  await page.getByTestId('gambit-info-play').click();
  await expect(page.getByTestId('gambit-info')).toHaveCount(0);
  await expect(page.getByTestId('aim')).toBeVisible();
  await expect(page.getByTestId('aim-mid')).toBeVisible();

  expect(errors).toEqual([]);
});

test('the roster lane tag follows setLane and flashes; fighting pieces flash red', async ({
  page,
}) => {
  test.setTimeout(240_000);
  const errors = watchErrors(page);
  await startLive(page, '42');
  const king = page.getByTestId('roster-A-king');
  const tag = king.getByTestId('lane-tag');
  const before = (await tag.textContent())!;
  await expect(tag).not.toHaveClass(/changed/);

  // software rendering can stall the page for longer than the flash lasts: watch for it in-page
  await page.evaluate(() => {
    const w = window as unknown as { __flashed: boolean };
    w.__flashed = false;
    const cell = document.querySelector('[data-testid="roster-A-king"]')!;
    new MutationObserver(() => {
      if (cell.querySelector('.lane-tag.changed')) w.__flashed = true;
    }).observe(cell, { attributes: true, childList: true, subtree: true });
  });
  const to = await page.evaluate(() => {
    const s = (window as unknown as { __session: Page2 }).__session;
    const k = s.match.snapshot().units.find((u) => u.team === 'A' && u.piece === 'king')!;
    const lane = k.lane === 'top' ? 'bot' : 'top';
    s.match.issue({ type: 'setLane', heroId: k.id, lane });
    s.notify();
    return lane;
  });
  await expect(tag).toHaveText(to === 'top' ? 'L' : 'R');
  expect(before).not.toBe(await tag.textContent());
  await expect
    .poll(() => page.evaluate(() => (window as unknown as { __flashed: boolean }).__flashed))
    .toBe(true);
  // the highlight is brief
  await expect(tag).not.toHaveClass(/changed/, { timeout: 8_000 });
  await expect(king).toHaveAttribute('data-lane', to);

  // run the sim until some White piece is in a fight: its portrait gets the red ring
  const fighting = await page.evaluate(() => {
    const s = (window as unknown as { __session: Page2 }).__session;
    for (let i = 0; i < 1500; i++) {
      s.match.step(20);
      if (s.match.state.forks.length > 0) s.match.issue({ type: 'autoForks' });
      const hit = s.match.snapshot().units.find((u) => u.team === 'A' && u.piece && u.inCombat);
      if (hit) {
        s.notify();
        return hit.piece;
      }
    }
    return null;
  });
  expect(fighting).not.toBeNull();
  await expect(page.getByTestId(`roster-A-${fighting}`)).toHaveAttribute('data-combat', 'true');
  expect(errors).toEqual([]);
});
