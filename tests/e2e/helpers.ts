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
  forks: { heroId: number; rank: number; options: { id: string; name: string }[] }[];
}

/** The shape of `window.__session` that the tests use (page.evaluate callbacks cannot share helpers). */
export interface TestSession {
  match: {
    step(n: number): number;
    snapshot(): TestSnap;
    events: { type: string; payload: Record<string, unknown> }[];
    state: { phase: { kind: string }; tempo: { A: number; B: number } };
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

/** Steps the sim directly (the HUD refreshes on the next frame). */
export function step(page: Page, n: number): Promise<number> {
  return page.evaluate((ticks) => {
    const s = (window as unknown as { __session: TestSession }).__session;
    const done = s.match.step(ticks);
    s.notify();
    return done;
  }, n);
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
