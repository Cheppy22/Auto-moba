import { describe, expect, it } from 'vitest';
import { Match } from '../src/sim';
import { STREAMS, seedStreams } from '../src/sim/core/rng';
import { content, logHash, runAi } from './helpers';

describe('determinism', () => {
  it('same seed gives an identical event log', () => {
    expect(logHash(runAi(11))).toBe(logHash(runAi(11)));
  });

  it('different seeds diverge', () => {
    expect(logHash(runAi(11))).not.toBe(logHash(runAi(12)));
  });

  it('a replay export reproduces the match exactly', () => {
    const m = runAi(5);
    const replay = m.exportReplay();
    const again = Match.fromReplay(content, JSON.parse(JSON.stringify(replay)));
    expect(logHash(again)).toBe(logHash(m));
    expect(again.state.tick).toBe(m.state.tick);
  });

  it('a replay refuses changed content', () => {
    const m = runAi(5, 1);
    const replay = m.exportReplay();
    expect(() => Match.fromReplay(content, { ...replay, contentHash: 'other' })).toThrow();
  });

  it('player commands are part of the replay', () => {
    const m = Match.create(content, { seed: 3 });
    const setup = m.defaultSetup();
    const pieces = setup.pieces.map((e) =>
      e.piece === 'knight' ? { ...e, path: 'utility' as const } : e,
    );
    expect(m.issue({ type: 'setupTeam', opening: setup.opening, pieces }).ok).toBe(true);
    m.step(600);
    expect(m.issue({ type: 'fieldPawn', lane: 'top' }).ok).toBe(true);
    const slot = m.snapshot().hand.findIndex((h) => h.usable && h.target === 'lane');
    if (slot >= 0) m.issue({ type: 'playGambit', slot, lane: 'mid' });
    const rook = m.state.teams.A.heroIds
      .map((id) => m.unitById(id)!)
      .find((u) => u.hero!.defId === 'rook')!;
    m.issue({ type: 'setLane', heroId: rook.id, lane: 'mid' });
    m.issue({ type: 'setPath', heroId: rook.id, path: 'offense' });
    m.step(1800);
    const fork = m.snapshot().forks[0];
    if (fork) m.issue({ type: 'chooseFork', heroId: fork.heroId, optionId: fork.options[1].id });
    m.step(1200);
    const again = Match.fromReplay(content, JSON.parse(JSON.stringify(m.exportReplay())));
    expect(logHash(again)).toBe(logHash(m));
  });

  it('adding the gambit stream leaves the other random streams unchanged', () => {
    const r = seedStreams(77);
    for (const name of STREAMS) {
      const solo = seedStreams(77);
      expect(r[name]).toBe(solo[name]);
    }
    // Each stream is derived from its own name, so the original seven keep their seeds.
    const legacy = ['mapgen', 'ai', 'combat', 'loot', 'keeper', 'draft', 'events'] as const;
    for (const name of legacy) expect(STREAMS).toContain(name);
    expect(STREAMS[STREAMS.length - 1]).toBe('gambit');
  });
});
