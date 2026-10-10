import { describe, expect, it } from 'vitest';
import { Grid } from '../src/sim/core/grid';
import { rand, seedStreams, shuffle } from '../src/sim/core/rng';
import { mitigate, abilityMods } from '../src/sim/combat';
import { quote, buyItem, sellItem, netWorth } from '../src/sim/shop';
import { buildWorld, findPath, lanePoint, laneT } from '../src/sim/world/map';
import { content, liveMatch, piece } from './helpers';

describe('rng', () => {
  it('streams are independent and repeatable', () => {
    const a = seedStreams(7);
    const b = seedStreams(7);
    rand(a, 'combat');
    rand(a, 'combat');
    expect(rand(a, 'ai')).toBe(rand(b, 'ai'));
    expect(shuffle(a, 'loot', [1, 2, 3, 4, 5]).length).toBe(5);
  });
});

describe('grid', () => {
  it('returns only items inside the radius', () => {
    const g = new Grid<{ x: number; y: number }>(1000, 100);
    g.insert({ x: 10, y: 10 });
    g.insert({ x: 500, y: 500 });
    expect(g.query(0, 0, 50)).toHaveLength(1);
    expect(g.query(500, 500, 5)).toHaveLength(1);
    expect(g.query(250, 250, 10)).toHaveLength(0);
  });
});

describe('world', () => {
  const world = buildWorld(content.map);
  it('projects points back onto their lane', () => {
    const p = lanePoint(world.lanes.top, 0.3);
    expect(laneT(world.lanes.top, p.x, p.y)).toBeCloseTo(0.3, 2);
  });
  it('paths respect closed slots', () => {
    const [ax, ay] = content.map.bases.A;
    const [bx, by] = content.map.bases.B;
    const from = { x: ax, y: ay };
    const to = { x: bx, y: by };
    const closed = findPath(world, from, to, new Set());
    const open = findPath(world, from, to, new Set(['tlc', 'brc']));
    expect(closed.length).toBeGreaterThan(2);
    expect(open.length).toBeGreaterThan(2);
  });
  it('towers are placed symmetrically', () => {
    const a = world.towerPos.A.mid[0];
    const b = world.towerPos.B.mid[0];
    expect(a.x + b.x).toBeCloseTo(content.map.size, 0);
    expect(a.y + b.y).toBeCloseTo(content.map.size, 0);
  });
});

describe('damage and shop', () => {
  const m = liveMatch(9, { autoGambits: { A: false, B: false } });
  const hero = piece(m, 'A', 'queen');

  it('armor reduces blade damage, resist reduces soul, true ignores both', () => {
    const blade = mitigate(hero, 100, 'blade');
    const soul = mitigate(hero, 100, 'soul');
    const truth = mitigate(hero, 100, 'true');
    expect(blade).toBeLessThan(100);
    expect(soul).toBeLessThan(100);
    expect(truth).toBe(100);
    if (hero.stats.armor > hero.stats.resist) expect(blade).toBeLessThan(soul);
    else expect(blade).toBeGreaterThanOrEqual(soul);
  });

  it('combining discounts owned components and refunds on sell', () => {
    hero.hero!.gold = 5000;
    hero.hero!.items = [];
    expect(buyItem(m.ctx, hero, 'rusted_cleaver').ok).toBe(true);
    expect(buyItem(m.ctx, hero, 'piston_gauntlet').ok).toBe(true);
    const q = quote(m.ctx, hero, 'cogged_edge');
    expect('price' in q && q.price).toBe(900 - 250 - 300);
    const before = hero.hero!.gold;
    expect(buyItem(m.ctx, hero, 'cogged_edge').ok).toBe(true);
    expect(hero.hero!.items).toEqual(['cogged_edge']);
    expect(hero.hero!.gold).toBe(before - 350);
    expect(netWorth(m.ctx, hero)).toBe(hero.hero!.gold + 900);
    expect(sellItem(m.ctx, hero, 'cogged_edge').ok).toBe(true);
    expect(hero.hero!.gold).toBe(before - 350 + 450);
  });

  it('tier 3 items are not in the base catalog; only the keeper stock sells them there', () => {
    const q = quote(m.ctx, hero, 'soot_reaver');
    const stocked = m.state.keeper.stock.includes('soot_reaver');
    expect('price' in q).toBe(stocked);
  });

  it('rank bonuses and fork picks scale ability numbers', () => {
    const st = content.pieceById.get('queen')!.styles[0];
    hero.hero!.style = st.id;
    const bonus = [st.ranks['5'], st.ranks['6'], st.ranks['7']].find(
      (r) => r.ability !== undefined && r.powerMul !== 1,
    );
    hero.hero!.perks = [];
    const idx = bonus?.ability ?? 0;
    const before = abilityMods(m.ctx, hero, idx).powerMul;
    if (bonus) {
      const rank = Number(Object.entries(st.ranks).find(([, r]) => r === bonus)![0]);
      hero.hero!.perks = [{ rank, optionId: null }];
      expect(abilityMods(m.ctx, hero, idx).powerMul).toBeCloseTo(before * bonus.powerMul);
    }
    const opt = st.forks['8'][0];
    hero.hero!.perks = [{ rank: 8, optionId: opt.id }];
    if (opt.ability !== undefined)
      expect(abilityMods(m.ctx, hero, opt.ability).powerMul).toBeCloseTo(opt.powerMul);
    hero.hero!.perks = [];
    hero.hero!.style = null;
  });
});
