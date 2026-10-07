import { describe, expect, it } from 'vitest';
import { Match } from '../src/sim';
import { quote } from '../src/sim/shop';
import { content } from './helpers';

function live(seed: number, heroId = 'smelter'): Match {
  const m = Match.create(content, { seed, player: { heroId, role: 'top' } });
  const id = m.state.playerHeroId!;
  const offer = m.state.upgradeOffers[id];
  if (offer) m.issue({ type: 'pickUpgrade', upgradeId: offer[0] });
  m.issue({ type: 'refuseCurse' } as never);
  expect(m.issue({ type: 'startPhase' }).ok).toBe(true);
  return m;
}

describe('deferred draft', () => {
  it('lets the player pick from every hero before the AI drafts', () => {
    const m = Match.create(content, { seed: 5 });
    const d = m.state.draft!;
    expect(d.deferred).toBe(true);
    expect(d.aiHeroes.A).toHaveLength(0);
    expect(m.issue({ type: 'pickHero', heroId: content.heroes[0].id }).ok).toBe(true);
    expect(d.aiHeroes.A).toHaveLength(4);
    expect(d.aiHeroes.B).toHaveLength(5);
    const all = [...d.aiHeroes.A, ...d.aiHeroes.B, content.heroes[0].id];
    expect(new Set(all).size).toBe(10);
  });

  it('re-picking a hero the AI took swaps it out of the AI teams', () => {
    const m = Match.create(content, { seed: 6 });
    const d = m.state.draft!;
    m.issue({ type: 'pickHero', heroId: content.heroes[0].id });
    const taken = d.aiHeroes.A[0];
    expect(m.issue({ type: 'pickHero', heroId: taken }).ok).toBe(true);
    const all = [...d.aiHeroes.A, ...d.aiHeroes.B, taken];
    expect(new Set(all).size).toBe(10);
  });
});

describe('player shopping and recall', () => {
  it('a dead player can still buy tier 1-2 items', () => {
    const m = live(3);
    const p = m.unitById(m.state.playerHeroId!)!;
    p.hero!.gold = 3000;
    p.alive = false;
    const q = quote(m.ctx, p, 'rusted_cleaver');
    expect('price' in q).toBe(true);
    expect('error' in quote(m.ctx, p, 'soot_reaver')).toBe(true);
  });

  it('auto-buy spends the player gold at base', () => {
    const m = live(4);
    const p = m.unitById(m.state.playerHeroId!)!;
    p.hero!.gold = 2500;
    expect(p.hero!.autoBuy).toBe(true);
    m.step(60);
    expect(p.hero!.items.length).toBeGreaterThan(0);
  });

  it('turning auto-buy off leaves gold alone', () => {
    const m = live(4);
    m.issue({ type: 'setAutoBuy', on: false });
    const p = m.unitById(m.state.playerHeroId!)!;
    p.hero!.gold = 2500;
    m.step(60);
    expect(p.hero!.items).toHaveLength(0);
  });

  it('prep no longer sells keeper stock', () => {
    const m = Match.create(content, { seed: 9, player: { heroId: 'smelter', role: 'top' } });
    const p = m.unitById(m.state.playerHeroId!)!;
    p.hero!.gold = 9000;
    for (const id of m.state.keeper.stock) expect('error' in quote(m.ctx, p, id)).toBe(true);
  });
});

describe('event suggestion', () => {
  it('accepts a suggestion only for a running event', () => {
    const m = live(7);
    expect(m.issue({ type: 'suggestEvent', eventId: 9999 }).ok).toBe(false);
  });
});
