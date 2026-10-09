import { describe, expect, it } from 'vitest';
import type { Match, Unit } from '../src/sim';
import { buyItem, quote } from '../src/sim/shop';
import { content, liveMatch, piece } from './helpers';

function live(seed: number): { m: Match; p: Unit } {
  const m = liveMatch(seed, { autoGambits: { A: false, B: false } });
  const p = piece(m, 'A', 'queen');
  p.hero!.items = [];
  return { m, p };
}

describe('jungle shops', () => {
  it('has two shops placed on opposite diagonal sides', () => {
    const shops = content.map.shops;
    expect(shops).toHaveLength(2);
    const [a, b] = shops;
    expect(a.x + b.x).toBe(content.map.size);
    expect(a.y + b.y).toBe(content.map.size);
  });

  it('sells the base catalog to a piece standing at a shop', () => {
    const { m, p } = live(3);
    p.hero!.gold = 3000;
    p.x = 900;
    p.y = 900;
    expect(buyItem(m.ctx, p, 'rusted_cleaver').ok).toBe(false);
    const sh = content.map.shops[0];
    p.x = sh.x + 10;
    p.y = sh.y;
    expect(buyItem(m.ctx, p, 'rusted_cleaver').ok).toBe(true);
  });

  it('sells tier 3 only at a jungle stall, discounted once an obelisk unlocked it', () => {
    const { m, p } = live(3);
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
});
