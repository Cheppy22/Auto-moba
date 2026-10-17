import { describe, expect, it, vi } from 'vitest';
import { Match } from '../src/sim';
import { restoreMatch, snapshotMatch } from '../src/ui/run/resume';
import { loadMatch, matchKey, saveMatch, type SaveStore } from '../src/ui/run/save';
import { content, logHash } from './helpers';

/** A match as the browser plays it: the Long Board, stopping for forks and for the Act break. */
function browserMatch(seed: number): Match {
  const m = Match.create(content, {
    seed,
    pauseForForks: true,
    pauseForBreak: true,
    map: 'long',
  });
  m.issue({ type: 'setupTeam', ...m.defaultSetup() });
  m.issue({ type: 'setPawnPlan', quota: { top: 2, mid: 2, bot: 2 } });
  return m;
}

/**
 * Plays like a player and a frame loop would: small uneven steps, a card or a pawn now and then,
 * forks and the Act break answered when they stop the clock. It depends on the match only, so two
 * matches in the same state get the same commands.
 */
function play(m: Match, ticks: number): void {
  const end = m.state.tick + ticks;
  let frame = 0;
  while (m.state.phase.kind === 'live' && m.state.tick < end) {
    frame++;
    const ran = m.step(1 + ((frame * 7 + m.state.tick) % 9));
    if (ran === 0) {
      if (m.state.forks.length > 0) m.issue({ type: 'autoForks' });
      else if (m.state.bell.stage === 'break') {
        m.issue({ type: 'autoRelic' });
        m.issue({ type: 'resumeAct' });
      } else break;
      continue;
    }
    if (frame % 40 === 0) {
      const slot = m.snapshot().hand.findIndex((h) => h.usable && h.target === 'lane');
      if (slot >= 0) m.issue({ type: 'playGambit', slot, lane: 'mid' });
    }
    if (frame % 90 === 0) m.issue({ type: 'fieldPawn', lane: 'top' });
  }
}

const memory = (): SaveStore & { map: Map<string, string> } => {
  const map = new Map<string, string>();
  return {
    map,
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => void map.set(k, v),
    removeItem: (k) => void map.delete(k),
  };
};

describe('resume a match after a reload', () => {
  it('replays to the saved position, and play from there matches the original', async () => {
    const m = browserMatch(8);
    play(m, 1800);
    const at = memory();
    saveMatch(snapshotMatch(m, null, 2), at);
    const save = loadMatch(content, at)!; // through JSON, as a reload does
    expect(save).not.toBeNull();
    expect(save.tick).toBe(m.state.tick);

    const progress: number[] = [];
    const back = await restoreMatch(content, save, (f) => progress.push(f));
    expect(back.state.tick).toBe(m.state.tick);
    expect(logHash(back)).toBe(logHash(m));
    expect(progress[progress.length - 1]).toBe(1);

    // the resumed match and the one that never stopped stay identical
    play(m, 800);
    play(back, 800);
    expect(back.state.tick).toBe(m.state.tick);
    expect(logHash(back)).toBe(logHash(m));
  }, 240_000);

  it('resumes across a fork that is waiting and across an Act break', async () => {
    const m = browserMatch(21);
    // run until the first stop of the clock (a fork), save there
    while (m.state.phase.kind === 'live' && m.state.forks.length === 0) {
      if (m.step(5) > 0) continue;
      if (m.state.bell.stage !== 'break') break;
      m.issue({ type: 'autoRelic' });
      m.issue({ type: 'resumeAct' });
    }
    expect(m.state.forks.length).toBeGreaterThan(0);
    const waiting = await restoreMatch(content, snapshotMatchViaJson(m), () => {});
    expect(waiting.state.forks.length).toBe(m.state.forks.length);
    expect(logHash(waiting)).toBe(logHash(m));

    // then to the Act break sheet
    while (m.state.phase.kind === 'live' && m.state.bell.stage !== 'break') {
      if (m.step(20) === 0) m.issue({ type: 'autoForks' });
    }
    expect(m.state.bell.stage).toBe('break');
    const onBreak = await restoreMatch(content, snapshotMatchViaJson(m), () => {});
    expect(onBreak.state.bell.stage).toBe('break');
    expect(logHash(onBreak)).toBe(logHash(m));
    // the sheet's answers carry on identically
    for (const x of [m, onBreak]) {
      x.issue({ type: 'autoRelic' });
      x.issue({ type: 'resumeAct' });
      play(x, 600);
    }
    expect(logHash(onBreak)).toBe(logHash(m));
  }, 240_000);

  it('refuses a save that does not reproduce the saved position', async () => {
    const m = browserMatch(3);
    play(m, 800);
    const save = snapshotMatchViaJson(m);
    await expect(restoreMatch(content, { ...save, check: 'other' }, () => {})).rejects.toThrow(
      /saved position/,
    );
    await expect(restoreMatch(content, { ...save, tick: save.tick + 1 }, () => {})).rejects.toThrow(
      /reached tick/,
    );
    // a log whose steps cannot run (the match is over before they end)
    const broken = { ...save, replay: { ...save.replay, ops: [...save.replay.ops] } };
    broken.replay.ops.splice(1, 0, { op: 'issue', cmd: { type: 'noSuchCommand' } as never });
    await expect(restoreMatch(content, broken, () => {})).rejects.toThrow();
  });

  it('drops a bad, old or foreign save with a warning, never a crash', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const m = browserMatch(5);
    play(m, 300);
    const good = snapshotMatch(m, null, 1);
    const at = memory();
    at.setItem(matchKey(), '{not json');
    expect(loadMatch(content, at)).toBeNull();
    saveMatch({ ...good, v: 2 as never }, at);
    expect(loadMatch(content, at)).toBeNull();
    expect(at.map.has(matchKey())).toBe(false);
    // recorded against other content (a balance change between visits)
    saveMatch({ ...good, replay: { ...good.replay, contentHash: 'older' } }, at);
    expect(loadMatch(content, at)).toBeNull();
    saveMatch({ ...good, replay: { ...good.replay, ops: [{ op: 'step', ticks: 0 }] } }, at);
    expect(loadMatch(content, at)).toBeNull();
    saveMatch(good, at);
    expect(loadMatch(content, at)).toEqual(good);
    saveMatch(null, at);
    expect(at.map.has(matchKey())).toBe(false);
    const broken: SaveStore = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
      removeItem: () => {},
    };
    expect(loadMatch(content, broken)).toBeNull();
    expect(() => saveMatch(good, broken)).not.toThrow();
    warn.mockRestore();
  });
});

function snapshotMatchViaJson(m: Match): ReturnType<typeof snapshotMatch> {
  return JSON.parse(JSON.stringify(snapshotMatch(m, null, 1)));
}
