import { expect, type Page } from '@playwright/test';

/** What the tests read from the page. `window.__session` is the game's session object. */
export interface TestSnap {
  tick: number;
  act: number;
  winner: string | null;
  phase: { kind: string; n: number };
  tempo: { A: number; B: number };
  pawns: { A: { alive: number; cap: number; cost: number } };
  hand: {
    slot: number;
    cardId: string;
    target: 'lane' | 'point' | 'enemy' | 'none';
    usable: boolean;
    cost: number;
    reason: string;
  }[];
  forks: {
    heroId: number;
    piece: string;
    style: string;
    rank: number;
    options: { id: string; name: string }[];
    ticksLeft: number | null;
  }[];
}

/** The shape of `window.__session` that the tests use (page.evaluate callbacks cannot share helpers). */
export interface TestSession {
  match: {
    step(n: number): number;
    snapshot(): TestSnap;
    events: { type: string; payload: Record<string, unknown> }[];
    issue(cmd: { type: string }): { ok: boolean };
    state: { phase: { kind: string }; tempo: { A: number; B: number }; forks: unknown[] };
  };
  notify(): void;
  setUi(patch: { speed: number }): void;
}

/** Errors worth failing a test over (software WebGL is noisy). */
export const benign = /WebGL|GPU stall|GL Driver/i;

export function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error' && !benign.test(m.text())) errors.push(m.text());
  });
  return errors;
}

/** Title -> setup (defaults) -> Begin -> live, paused so the sim only moves when a test steps it. */
export async function startLive(page: Page, seed = '42', pause = true): Promise<void> {
  await page.goto('/');
  await expect(page.getByTestId('title')).toBeVisible();
  await page.getByTestId('seed').fill(seed);
  await page.getByTestId('start').click();
  await expect(page.getByTestId('setup')).toBeVisible();
  if (pause) await pauseAtStart(page);
  await page.getByTestId('begin').click();
  await expect(page.getByTestId('hud')).toBeVisible();
  await viewReady(page);
}

/** Waits for the 3D view to exist (taps on the board need it), or for the no-WebGL notice. */
export async function viewReady(page: Page): Promise<void> {
  await page.waitForFunction(
    () =>
      !!document.querySelector('[data-testid="stage"][data-ready="true"]') ||
      !!document.querySelector('[data-testid="no-webgl"]'),
    undefined,
    { timeout: 60_000 },
  );
}

/** Sets the speed to Pause while the setup board is open, so the match begins at tick 0 and holds. */
export function pauseAtStart(page: Page): Promise<void> {
  return page.evaluate(() => {
    (window as unknown as { __session: TestSession }).__session.setUi({ speed: 0 });
  });
}

/**
 * Steps the sim directly (the HUD refreshes on the next frame). The match halts whenever a White
 * fork opens, so a fork that opens on the way is answered with the AI's pick and stepping goes on.
 */
export function step(page: Page, n: number): Promise<number> {
  return page.evaluate((ticks) => {
    const s = (window as unknown as { __session: TestSession }).__session;
    let done = 0;
    for (let guard = 0; done < ticks && guard < 200; guard++) {
      done += s.match.step(ticks - done);
      if (done >= ticks || s.match.state.forks.length === 0) break;
      s.match.issue({ type: 'autoForks' });
    }
    s.notify();
    return done;
  }, n);
}

/** Taps the speed chip until it shows `speed` (0 is paused). */
export async function setSpeed(page: Page, speed: 0 | 1 | 2 | 4 | 8): Promise<void> {
  const chip = page.getByTestId('speed-chip');
  for (let i = 0; i < 5 && (await chip.getAttribute('data-speed')) !== String(speed); i++)
    await chip.click();
  await expect(chip).toHaveAttribute('data-speed', String(speed));
}

export function snap(page: Page): Promise<TestSnap> {
  return page.evaluate(() => {
    const s = (window as unknown as { __session: TestSession }).__session;
    return JSON.parse(JSON.stringify(s.match.snapshot())) as TestSnap;
  });
}

export function eventCount(page: Page, type: string): Promise<number> {
  return page.evaluate((t) => {
    const s = (window as unknown as { __session: TestSession }).__session;
    return s.match.events.filter((e) => e.type === t).length;
  }, type);
}

/**
 * Waits until the clock passes `tick`. A fork that opens on the way stops the match until it is
 * answered, so this answers it with "Let the AI choose" like a player would.
 */
export async function playPast(page: Page, tick: number, timeout = 60_000): Promise<void> {
  await expect
    .poll(
      async () => {
        const x = await snap(page);
        if (x.forks.length > 0) await page.getByTestId('fork-auto').click();
        return x.tick;
      },
      { timeout },
    )
    .toBeGreaterThan(tick);
}

/** Taps the camera button until it shows `mode`. */
export async function setCam(page: Page, mode: 'auto' | 'follow' | 'free'): Promise<void> {
  const btn = page.getByTestId('cam-btn');
  for (let i = 0; i < 4 && (await btn.getAttribute('data-mode')) !== mode; i++) await btn.click();
  await expect(btn).toHaveAttribute('data-mode', mode);
}

/** What to step the sim toward. */
export type Until =
  | { kind: 'fork' }
  | { kind: 'end' }
  /** A usable card with that target in the hand (Tempo is topped up while stepping). */
  | { kind: 'card'; target: 'lane' | 'point' | 'enemy' | 'none'; cardId?: string };

/**
 * Steps the sim inside the page (one round trip) in `chunk`-tick pieces until the condition holds:
 * cards expire every 40 s, forks open at Rank 4 and checkmate takes a few Acts.
 */
export async function stepUntil(
  page: Page,
  until: Until,
  chunk = 100,
  max = 800,
): Promise<TestSnap> {
  const out = await page.evaluate(
    ({ until, chunk, max }) => {
      const s = (window as unknown as { __session: TestSession }).__session;
      const met = (x: TestSnap): boolean =>
        until.kind === 'fork'
          ? x.forks.length > 0
          : until.kind === 'end'
            ? x.phase.kind !== 'live'
            : x.hand.some(
                (c) =>
                  c.target === until.target &&
                  c.usable &&
                  (until.cardId === undefined || c.cardId === until.cardId),
              );
      const topUp = (): void => {
        if (until.kind === 'card') s.match.state.tempo.A = 100;
      };
      topUp();
      let x = s.match.snapshot();
      for (let i = 0; i < max && !met(x) && x.phase.kind === 'live'; i++) {
        s.match.step(chunk);
        // the match halts for a White fork: only a test that waits for one leaves it open
        if (until.kind !== 'fork' && s.match.state.forks.length > 0)
          s.match.issue({ type: 'autoForks' });
        topUp();
        x = s.match.snapshot();
      }
      s.notify();
      return { met: met(x), snap: JSON.parse(JSON.stringify(x)) as TestSnap };
    },
    { until, chunk, max },
  );
  expect(out.met, `reached ${until.kind} while stepping the sim`).toBe(true);
  return out.snap;
}

/** Sets Tempo directly so gambits and pawns can be tested back to back. */
export function setTempo(page: Page, value: number): Promise<void> {
  return page.evaluate((v) => {
    const s = (window as unknown as { __session: TestSession }).__session;
    s.match.state.tempo.A = v;
    s.notify();
  }, value);
}

export async function boxOf(page: Page, id: string) {
  const box = await page.getByTestId(id).boundingBox();
  expect(box, id).not.toBeNull();
  return box!;
}

export function overflow(page: Page): Promise<number> {
  return page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
}

/** Plays the whole match to Checkmate inside the page (White's forks are answered by the AI). */
export async function playToEnd(page: Page): Promise<void> {
  await page.evaluate(() => {
    const s = (
      window as unknown as {
        __session: TestSession & {
          match: { issue(c: { type: 'autoForks' }): unknown; state: { forks: unknown[] } };
        };
      }
    ).__session;
    s.setUi({ speed: 0 });
    for (let i = 0; i < 400 && s.match.state.phase.kind === 'live'; i++) {
      if (s.match.state.forks.length > 0) s.match.issue({ type: 'autoForks' });
      s.match.step(600);
    }
    s.notify();
  });
}
