import { describe, expect, it } from 'vitest';
import { Match } from '../src/sim';
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
    const m = Match.create(content, { seed: 3, player: { heroId: 'queen', role: 'top' } });
    m.issue({ type: 'setPosture', posture: 'farm' });
    const offer = m.state.upgradeOffers[m.state.playerHeroId!];
    m.issue({ type: 'pickUpgrade', upgradeId: offer[0] });
    expect(m.issue({ type: 'startPhase' }).ok).toBe(true);
    m.step(1200);
    m.issue({ type: 'setPosture', posture: 'push' });
    m.step(1200);
    const again = Match.fromReplay(content, m.exportReplay());
    expect(logHash(again)).toBe(logHash(m));
  });
});
