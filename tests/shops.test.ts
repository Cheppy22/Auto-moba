import { describe, expect, it } from 'vitest';
import { Match } from '../src/sim';
import { quote } from '../src/sim/shop';
import { content } from './helpers';

function live(seed: number): Match {
  const m = Match.create(content, { seed, player: { heroId: 'queen', role: 'top' } });
  const id = m.state.playerHeroId!;
  const offer = m.state.upgradeOffers[id];
  if (offer) m.issue({ type: 'pickUpgrade', upgradeId: offer[0] });
  expect(m.issue({ type: 'startPhase' }).ok).toBe(true);
  return m;
}

describe('jungle shops', () => {
  it('has two shops placed on opposite diagonal sides', () => {
    const shops = content.map.shops;
    expect(shops).toHaveLength(2);
    const [a, b] = shops;
    expect(a.x + b.x).toBe(1000);
    expect(a.y + b.y).toBe(1000);
  });

  it('sells the base catalog to a hero standing at a shop', () => {
    const m = live(3);
    const p = m.unitById(m.state.playerHeroId!)!;
    p.hero!.gold = 3000;
    p.x = 900;
    p.y = 900;
    expect(m.issue({ type: 'buy', itemId: 'rusted_cleaver' }).ok).toBe(false);
    const sh = content.map.shops[0];
    p.x = sh.x + 10;
    p.y = sh.y;
    expect(m.issue({ type: 'buy', itemId: 'rusted_cleaver' }).ok).toBe(true);
  });

  it('sells tier 3 only at a jungle stall, discounted once an obelisk unlocked it', () => {
    const m = live(3);
    const p = m.unitById(m.state.playerHeroId!)!;
    p.hero!.gold = 9000;
    p.hero!.items = [];
    const base = m.ctx.world.basePos[p.team as 'A' | 'B'];
    p.x = base.x;
    p.y = base.y;
    const id = 'vorpal_blade';
    const item = content.itemById.get(id) ?? content.items.find((i) => i.tier === 3)!;
    if (!m.state.keeper.stock.includes(item.id)) {
      const atBase = quote(m.ctx, p, item.id);
      expect('error' in atBase).toBe(true);
    }
    const sh = content.map.shops[0];
    p.x = sh.x + 10;
    p.y = sh.y;
    const full = quote(m.ctx, p, item.id);
    expect('price' in full && full.price).toBe(item.cost);
    m.state.teams[p.team as 'A' | 'B'].unlocks.push(item.id);
    const cut = quote(m.ctx, p, item.id);
    expect('price' in cut && cut.price).toBe(Math.round(item.cost * 0.75));
  });

  it('there is no teleport to the keeper any more', () => {
    const m = live(4);
    expect(m.issue({ type: 'recall', dest: 'keeper' } as never).ok).toBe(false);
  });
});

describe('shop suggestions', () => {
  it('toggles, queues up to three and clears', () => {
    const m = live(5);
    const [a, b] = content.map.shops;
    expect(m.issue({ type: 'suggestShop', shopId: a.id }).ok).toBe(true);
    expect(m.snapshot().suggest).toEqual([a.id]);
    expect(m.issue({ type: 'suggestShop', shopId: b.id }).ok).toBe(true);
    expect(m.snapshot().suggest).toEqual([a.id, b.id]);
    expect(m.issue({ type: 'suggestShop', shopId: a.id }).ok).toBe(true);
    expect(m.snapshot().suggest).toEqual([b.id]);
    expect(m.issue({ type: 'suggestShop', shopId: 'nope' }).ok).toBe(false);
    expect(m.issue({ type: 'clearSuggest' }).ok).toBe(true);
    expect(m.snapshot().suggest).toEqual([]);
  });

  it('walks the hero to the shop and reports the visit', () => {
    const m = live(6);
    const near = content.map.shops[0];
    expect(m.issue({ type: 'suggestShop', shopId: near.id }).ok).toBe(true);
    let visited = false;
    for (let i = 0; i < 90 && !visited; i++) {
      m.step(40);
      visited = m.events.some((e) => e.type === 'shopVisit');
    }
    expect(visited).toBe(true);
    expect(m.snapshot().suggest).toEqual([]);
  });

  it('is only a suggestion: a badly hurt hero heads home instead', () => {
    const m = live(7);
    const p = m.unitById(m.state.playerHeroId!)!;
    const far = content.map.shops[1];
    m.issue({ type: 'suggestShop', shopId: far.id });
    p.x = 500;
    p.y = 500;
    p.hp = p.stats.maxHp * 0.1;
    m.step(60);
    expect(p.hero!.goal?.kind).not.toBe('visitShop');
    expect(m.snapshot().suggest).toEqual([far.id]);
  });
});
