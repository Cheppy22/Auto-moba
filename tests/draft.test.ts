import { describe, expect, it } from 'vitest';
import { Match } from '../src/sim';
import { content } from './helpers';

describe('one hero per match', () => {
  it('never repeats a hero in a full AI draft', () => {
    for (let seed = 1; seed <= 40; seed++) {
      const m = Match.create(content, { seed, player: null });
      const ids = [...m.state.teams.A.heroIds, ...m.state.teams.B.heroIds].map(
        (id) => m.unitById(id)!.defId,
      );
      expect(new Set(ids).size).toBe(ids.length);
    }
  });

  it('keeps the player hero out of the AI picks', () => {
    for (let seed = 1; seed <= 40; seed++) {
      const m = Match.create(content, { seed, player: { heroId: 'smelter', role: 'top' } });
      const ids = [...m.state.teams.A.heroIds, ...m.state.teams.B.heroIds].map(
        (id) => m.unitById(id)!.defId,
      );
      expect(ids.filter((x) => x === 'smelter')).toHaveLength(1);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });

  it('rejects picking a hero that is already on a team', () => {
    const m = Match.create(content, { seed: 5 });
    const taken = m.state.draft!.aiHeroes.B[0];
    expect(m.issue({ type: 'pickHero', heroId: taken }).ok).toBe(false);
    const free = content.heroes.find(
      (h) => ![...m.state.draft!.aiHeroes.A, ...m.state.draft!.aiHeroes.B].includes(h.id),
    )!;
    expect(m.issue({ type: 'pickHero', heroId: free.id }).ok).toBe(true);
  });

  it('allows duplicates in a fixed draft (mirror tests)', () => {
    const m = Match.create(content, {
      seed: 1,
      player: null,
      draft: { A: Array(5).fill('smelter'), B: Array(5).fill('smelter') },
    });
    expect(m.state.draft).toBeNull();
    expect(m.state.teams.A.heroIds).toHaveLength(5);
  });
});
