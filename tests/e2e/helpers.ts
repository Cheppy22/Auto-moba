import { expect, type Page } from '@playwright/test';

/** What the tests read from the page. `window.__session` is the game's session object. */
export interface TestSnap {
  tick: number;
  act: { n: number; bell: string };
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
    kind: 'archetype' | 'skill';
    style: string | null;
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
    issue(cmd: { type: string; quota?: Record<string, number> }): { ok: boolean; reason?: string };
    state: {
      phase: { kind: string };
      tempo: { A: number; B: number };
      forks: unknown[];
      bell: { stage: string };
    };
  };
  notify(): void;
  setUi(patch: { speed: number }): void;
  /** Leaves the Act break sheet (refused while a fork, a relic pick or the lanes are unsettled). */
  resumeAct(): void;
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

/**
 * Title -> setup (defaults, Quick start) -> live, paused so the sim only moves when a test steps it.
 * White starts with a standing pawn plan (2 / 2 / 2) that fields pawns by itself; most specs count
 * the pawns they field by hand, so they clear it unless `plan` is true.
 */
export async function startLive(
  page: Page,
  seed = '42',
  pause = true,
  plan = false,
  /** Extra address parameters, e.g. `&map=long`. */
  query = '',
): Promise<void> {
  await page.goto(`/?intro=off${query}`);
  await expect(page.getByTestId('title')).toBeVisible();
  await page.getByTestId('seed').fill(seed);
  await page.getByTestId('start').click();
  await expect(page.getByTestId('setup')).toBeVisible();
  if (pause) await pauseAtStart(page);
  // "Quick start" begins with the defaults from any of the three setup pages
  await page.getByTestId('quick-start').click();
  await expect(page.getByTestId('hud')).toBeVisible();
  await viewReady(page);
  if (!plan) await clearPawnPlan(page);
}

/** Drops White's standing pawn plan (the default 2 / 2 / 2), so only hand-fielded pawns exist. */
export function clearPawnPlan(page: Page): Promise<void> {
  return page.evaluate(() => {
    const s = (window as unknown as { __session: TestSession }).__session;
    s.match.issue({ type: 'setPawnPlan', quota: { top: 0, mid: 0, bot: 0 } });
  });
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

/**
 * Taps the speed chip until it shows `speed` (0 is paused). A running match can reach the Act
 * break between two taps, and its sheet covers the chip, so a break is left before every tap.
 */
export async function setSpeed(page: Page, speed: 0 | 1 | 2 | 4 | 8): Promise<void> {
  const chip = page.getByTestId('speed-chip');
  for (let i = 0; i < 8 && (await chip.getAttribute('data-speed')) !== String(speed); i++) {
    if ((await snap(page)).act.bell === 'break') await leaveBreak(page);
    await chip.click({ timeout: 30_000 }).catch(() => undefined);
  }
  await expect(chip).toHaveAttribute('data-speed', String(speed));
}

export function snap(page: Page): Promise<TestSnap> {
  return page.evaluate(() => {
    const s = (window as unknown as { __session: TestSession }).__session;
    return JSON.parse(JSON.stringify(s.match.snapshot())) as TestSnap;
  });
}

/** How many events of `type` the match has logged, for one team's side only when `team` is given. */
export function eventCount(page: Page, type: string, team?: 'A' | 'B'): Promise<number> {
  return page.evaluate(
    ({ t, side }) => {
      const s = (window as unknown as { __session: TestSession }).__session;
      return s.match.events.filter((e) => e.type === t && (!side || e.payload.team === side))
        .length;
    },
    { t: type, side: team },
  );
}

/**
 * Waits until the clock passes `tick`. A fork that opens on the way stops the match until it is
 * answered, so this answers it with "Let the AI choose" like a player would. An Act break stops
 * it too, so the break sheet is left the same way (AI picks the relic, then Resume).
 */
export async function playPast(page: Page, tick: number, timeout = 60_000): Promise<void> {
  await expect
    .poll(
      async () => {
        const x = await snap(page);
        if (x.forks.length > 0) await page.getByTestId('fork-auto').click();
        else if (x.act.bell === 'break') await leaveBreak(page);
        return x.tick;
      },
      { timeout },
    )
    .toBeGreaterThan(tick);
}

/** True when the page draws the legacy corner HUD (`?hud=old`), false for the court bar. */
export async function isOldHud(page: Page): Promise<boolean> {
  return (await page.getByTestId('hud').getAttribute('data-hud')) === 'old';
}

/**
 * Makes the gambit cards reachable under either HUD: the old one always shows them, the court bar
 * keeps them in a drawer that an aim folds away, so this opens it if it is shut.
 */
export async function openHand(page: Page): Promise<void> {
  const toggle = page.getByTestId('drawer-toggle');
  if ((await toggle.count()) === 0) return;
  if ((await page.getByTestId('drawer').getAttribute('data-open')) !== 'true') await toggle.click();
  await expect(page.getByTestId('hand')).toBeVisible();
}

/** The camera mode the HUD shows: free (the default), auto, follow or lane. */
export function camMode(page: Page): Promise<string | null> {
  return page.getByTestId('hud').getAttribute('data-cam');
}

/** Turns the Auto camera on or off with its switch. */
export async function setAuto(page: Page, on: boolean): Promise<void> {
  const btn = page.getByTestId('auto-btn');
  if ((await btn.getAttribute('aria-pressed')) !== String(on)) await btn.click();
  await expect(btn).toHaveAttribute('aria-pressed', String(on));
}

/**
 * A spot on the canvas over open ground: no unit near it, at least `clear` map units from every
 * lane, and not under the HUD (null if the view shows none).
 */
export function bareGround(page: Page, clear = 220): Promise<{ x: number; y: number } | null> {
  return page.evaluate((far) => {
    interface Sess {
      view: {
        pickGround(x: number, y: number): { x: number; y: number } | null;
        pickUnit(x: number, y: number): number | null;
      } | null;
      match: { content: { map: { lanes: Record<string, number[][]> } } };
    }
    const s = (window as unknown as { __session: Sess }).__session;
    const view = s.view;
    const canvas = document.querySelector('canvas');
    if (!view || !canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const segDist = (px: number, py: number, a: number[], b: number[]): number => {
      const dx = b[0] - a[0];
      const dy = b[1] - a[1];
      const t = Math.max(
        0,
        Math.min(1, ((px - a[0]) * dx + (py - a[1]) * dy) / (dx * dx + dy * dy)),
      );
      return Math.hypot(px - a[0] - dx * t, py - a[1] - dy * t);
    };
    for (let j = 2; j < 18; j++)
      for (let i = 1; i < 12; i++) {
        const x = rect.left + (rect.width * i) / 12;
        const y = rect.top + (rect.height * j) / 20;
        const hit = document.elementFromPoint(x, y);
        if (hit !== canvas) continue;
        const g = view.pickGround(x, y);
        if (!g || view.pickUnit(x, y) !== null) continue;
        let d = Infinity;
        for (const lane of Object.values(s.match.content.map.lanes))
          for (let k = 1; k < lane.length; k++)
            d = Math.min(d, segDist(g.x, g.y, lane[k - 1], lane[k]));
        if (d >= far) return { x, y };
      }
    return null;
  }, clear);
}
/** What to step the sim toward. */
export type Until =
  | { kind: 'fork' }
  | { kind: 'end' }
  /**
   * A usable card with that target in the hand (Tempo is topped up while stepping). `cardId` names
   * one card, `anyOf` several; with neither, any card with the target will do, so a test needs a
   * kind of card and never a lucky draw.
   */
  | {
      kind: 'card';
      target: 'lane' | 'point' | 'enemy' | 'none';
      cardId?: string;
      anyOf?: readonly string[];
    };

/**
 * Steps the sim inside the page (one round trip) in `chunk`-tick pieces until the condition holds:
 * cards expire every 40 s, forks open at Rank 4 and checkmate takes a few Acts. Act breaks are
 * left on the way ("Let the AI choose" a relic, then Resume).
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
                  (until.cardId === undefined || c.cardId === until.cardId) &&
                  (until.anyOf === undefined || until.anyOf.includes(c.cardId)),
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
        // and at each Act break: the AI takes a relic and the next Act starts
        if (s.match.state.bell.stage === 'break') {
          s.match.issue({ type: 'autoRelic' });
          if (!s.match.issue({ type: 'resumeAct' }).ok) {
            s.match.issue({ type: 'declineRelic' });
            s.match.issue({ type: 'resumeAct' });
          }
        }
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

/** Plays the whole match to Checkmate inside the page (the AI answers White's forks, picks its relic and resumes at each Act break). */
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
      if (s.match.state.bell.stage === 'break') {
        // an Act break: the AI takes a relic and the next Act starts
        s.match.issue({ type: 'autoRelic' });
        if (!s.match.issue({ type: 'resumeAct' }).ok) {
          s.match.issue({ type: 'declineRelic' });
          s.match.issue({ type: 'resumeAct' });
        }
      }
      s.match.step(600);
    }
    s.notify();
  });
  await skipMateBeat(page);
}

/**
 * After a Checkmate the beat (letterbox, the King's topple) plays before the result splash; a
 * player can tap it away, and so does this, so a slow software-GL frame rate cannot hold the report.
 */
export async function skipMateBeat(page: Page): Promise<void> {
  const beat = page.getByTestId('mate-beat');
  await expect(beat.or(page.getByTestId('report')).first()).toBeVisible({ timeout: 15_000 });
  if (await beat.isVisible()) await beat.click({ force: true }).catch(() => undefined);
  await expect(page.getByTestId('report')).toBeVisible({ timeout: 15_000 });
}

/** Leaves the Act break like a player: "Let the AI choose" a relic, then Resume. */
export function leaveBreak(page: Page): Promise<void> {
  return page.evaluate(() => {
    const s = (window as unknown as { __session: TestSession }).__session;
    s.match.issue({ type: 'autoRelic' });
    s.resumeAct();
    if (s.match.state.bell.stage === 'break') throw new Error('could not leave the Act break');
  });
}
