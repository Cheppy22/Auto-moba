import { describe, expect, it } from 'vitest';
import { Match } from '../src/sim';
import { tryCast } from '../src/sim/combat';
import { evaluateCurseOffers, grantSpecial } from '../src/sim/curses';
import { startRecall } from '../src/sim/recall';
import { buyItem } from '../src/sim/shop';
import { recompute } from '../src/sim/stats';
import { content, liveMatch, piece } from './helpers';

const ACT = content.tuning.phaseSeconds * content.tuning.tickRate;

describe('keeper', () => {
  it('moves each Act and stocks three tier-3 items', () => {
    const m = liveMatch(31);
    expect(m.state.keeper.stock).toHaveLength(3);
    for (const id of m.state.keeper.stock) expect(content.itemById.get(id)!.tier).toBe(3);
    const before = m.events.filter((e) => e.type === 'keeperMoved').length;
    m.step(ACT);
    expect(m.events.filter((e) => e.type === 'keeperMoved').length).toBeGreaterThan(before);
  });

  it('standing next to the keeper gives access to its stock', () => {
    const m = liveMatch(32);
    const p = piece(m, 'A', 'queen');
    p.hero!.gold = 5000;
    p.hero!.items = [];
    const stocked = m.state.keeper.stock[0];
    expect(buyItem(m.ctx, p, stocked).ok).toBe(false);
    const k = m.unitById(m.state.keeper.unitId)!;
    p.x = k.x + 20;
    p.y = k.y;
    expect(buyItem(m.ctx, p, stocked).ok).toBe(true);
    expect(p.hero!.items).toContain(stocked);
  });

  it('recall is interrupted by damage', () => {
    const m = liveMatch(33);
    const p = piece(m, 'A', 'queen');
    expect(startRecall(m.ctx, p, 'base')).toBe(true);
    p.lastDamagedTick = m.state.tick + 1;
    m.step(5);
    expect(p.hero!.recall).toBeNull();
    expect(m.events.some((e) => e.type === 'recall' && e.payload.stage === 'interrupted')).toBe(
      true,
    );
  });
});

describe('cursed items', () => {
  function cursedSetup(): { m: Match; id: number } {
    const m = liveMatch(41);
    m.step(ACT - 1);
    const id = piece(m, 'A', 'queen').id;
    for (const t of ['A', 'B'] as const) {
      for (const hid of m.state.teams[t].heroIds) {
        const u = m.unitById(hid)!;
        u.hero!.items = [];
        u.hero!.gold = t === 'A' ? (hid === id ? 0 : 3000) : 6000;
        u.dirty = true;
      }
    }
    m.step(1);
    return { m, id };
  }

  it('at an Act start offers one curse to the furthest-behind piece and the AI answers it', () => {
    const { m, id } = cursedSetup();
    expect(m.state.phase.n).toBe(2);
    const offers = m.state.curseOffers.filter((o) => o.phase === 2);
    expect(offers).toHaveLength(1);
    expect(offers[0].heroId).toBe(id);
    expect(offers[0].resolved).toBe(true);
    expect(m.state.teams.A.curseOffers).toBe(1);
    const answered = m.events.some((e) => e.type === 'curseAccepted' || e.type === 'curseRefused');
    expect(answered).toBe(true);
  });

  it('brings the keeper to the spot nearest the offered piece', () => {
    const m = liveMatch(44);
    const p = piece(m, 'A', 'queen');
    for (const t of ['A', 'B'] as const)
      for (const hid of m.state.teams[t].heroIds) {
        const u = m.unitById(hid)!;
        u.hero!.items = [];
        u.hero!.gold = t === 'A' ? (u === p ? 0 : 3000) : 6000;
      }
    m.state.phase.n = 2;
    evaluateCurseOffers(m.ctx);
    const nearest = content.map.keeperSpots
      .map((s) => ({ s, d: Math.hypot(s.x - p.x, s.y - p.y) }))
      .sort((a, b) => a.d - b.d)[0].s;
    expect(m.state.keeper.spot).toBe(nearest.id);
  });

  it('supports a Fallen Saint: holy and cursed together', () => {
    const m = liveMatch(45);
    const p = piece(m, 'A', 'rook');
    grantSpecial(m.ctx, p, content.cursed[0].id);
    p.hero!.flaws[content.cursed[0].id] = content.cursed[0].flaws[0].id;
    grantSpecial(m.ctx, p, content.holy[0].id);
    const held = p.hero!.items;
    expect(held.some((x) => content.cursedById.has(x))).toBe(true);
    expect(held.some((x) => content.holyById.has(x))).toBe(true);
    recompute(m.ctx, p);
    expect(p.stats.maxHp).toBeGreaterThan(0);
  });

  it('keeper debts doubles both the boon and the flaw', () => {
    const m = liveMatch(42);
    const p = piece(m, 'A', 'queen');
    p.hero!.items = ['hungry_mask'];
    p.hero!.flaws.hungry_mask = 'gnaw';
    recompute(m.ctx, p);
    const dmg1 = p.stats.bladeDmg;
    const taken1 = p.stats.damageTakenMult;
    m.state.tagMult.curse = 2;
    recompute(m.ctx, p);
    const boon = content.cursedById
      .get('hungry_mask')!
      .boons.find((b) => b.stat === 'bladeDmg')!.value;
    const flaw = content.cursedById
      .get('hungry_mask')!
      .flaws.find((f) => f.id === 'gnaw')!
      .mods.find((x) => x.stat === 'damageTakenMult')!.value;
    expect(p.stats.bladeDmg / dmg1).toBeCloseTo(((boon - 1) * 2 + 1) / boon, 5);
    expect(p.stats.damageTakenMult / taken1).toBeCloseTo(((flaw - 1) * 2 + 1) / flaw, 5);
  });

  it('revives once with the Lantern of the Drowned', () => {
    const m = liveMatch(43);
    const p = piece(m, 'A', 'queen');
    p.hero!.items = ['lantern_of_the_drowned'];
    p.hero!.flaws.lantern_of_the_drowned = 'slow_flame';
    recompute(m.ctx, p);
    p.hp = 0;
    p.pendingKill = { killerId: 0 };
    m.step(2);
    expect(p.alive).toBe(true);
    expect(p.hero!.revived).toBe(true);
    p.hp = 0;
    p.pendingKill = { killerId: 0 };
    m.step(2);
    expect(p.alive).toBe(false);
  });
});

describe('holy auction', () => {
  it('stays switched off: no bids or awards in a full match', () => {
    expect(content.tuning.auction.enabled).toBe(false);
    const m = liveMatch(51);
    m.step(ACT * 3);
    expect(m.events.some((e) => e.type === 'bid' || e.type === 'auctionResolved')).toBe(false);
  });
});

function isolate(m: Match, keep: number[]): void {
  m.state.units = m.state.units.filter((u) => u.kind !== 'minion');
  m.ctx.idx.clear();
  for (const u of m.state.units) m.ctx.idx.set(u.id, u);
  m.state.nextWaveTick = 1e9;
  for (const t of ['A', 'B'] as const) {
    for (const hid of m.state.teams[t].heroIds) {
      if (keep.includes(hid)) continue;
      const u = m.unitById(hid)!;
      u.x = 0;
      u.y = 0;
      u.hero!.recall = {
        startTick: m.state.tick,
        endTick: m.state.tick + 99999,
        dest: 'base',
        auto: false,
      };
    }
  }
}

function hold(m: Match, ids: number[], x: number, y: number, ticks: number): void {
  for (let i = 0; i < ticks / 5; i++) {
    for (const id of ids) {
      const u = m.unitById(id)!;
      u.x = x;
      u.y = y;
      u.hp = u.stats.maxHp;
    }
    m.step(5);
  }
}

describe('obelisks', () => {
  it('spawn on schedule and are claimed by holding the radius', () => {
    const m = liveMatch(61, { autoGambits: { A: false, B: false } });
    m.step(1010);
    const ob = m.state.units.find((u) => u.kind === 'obelisk')!;
    expect(ob).toBeDefined();
    const hero = m.state.teams.A.heroIds[0];
    isolate(m, [hero]);
    const pts = m.state.teams.A.points;
    hold(m, [hero], ob.x, ob.y, 130);
    expect(m.events.some((e) => e.type === 'obeliskClaimed' && e.payload.team === 'A')).toBe(true);
    expect(m.state.teams.A.points).toBeGreaterThanOrEqual(pts + content.tuning.obelisk.points);
  });

  it('are contested when both teams stand there', () => {
    const m = liveMatch(62, { autoGambits: { A: false, B: false } });
    m.step(1010);
    const ob = m.state.units.find((u) => u.kind === 'obelisk')!;
    const alive = (t: 'A' | 'B'): number =>
      m.state.teams[t].heroIds.find((id) => m.unitById(id)!.alive) ?? m.state.teams[t].heroIds[0];
    const a = alive('A');
    const b = alive('B');
    const claimed = (): number => m.events.filter((e) => e.type === 'obeliskClaimed').length;
    const before = claimed();
    isolate(m, [a, b]);
    hold(m, [a, b], ob.x, ob.y, 130);
    expect(claimed()).toBe(before);
  });

  it('only spawn during Acts one to three', () => {
    const m = liveMatch(63);
    for (const team of ['A', 'B'] as const) {
      const g = m.ctx.guardians[team]!;
      g.base = { ...g.base, maxHp: 1e9 };
      g.hp = 1e9;
      g.dirty = true;
    }
    m.step(ACT * 3);
    const before = m.events.filter((e) => e.type === 'obeliskSpawn').length;
    m.step(ACT);
    expect(m.events.filter((e) => e.type === 'obeliskSpawn').length).toBe(before);
    expect(before).toBeGreaterThan(0);
  });
});

describe('area abilities', () => {
  it('burst abilities hit enemies around the target and never the caster or allies', () => {
    const m = liveMatch(71);
    m.step(1);
    const caster = piece(m, 'A', 'bishop');
    const ally = piece(m, 'A', 'rook');
    const enemy = piece(m, 'B', 'queen');
    const bystander = piece(m, 'B', 'knight');
    for (const u of m.state.units) if (u.kind === 'hero') u.x = u.y = 0;
    m.state.units = m.state.units.filter((u) => u.kind === 'hero' || u.kind === 'keeper');
    caster.x = 500;
    caster.y = 500;
    enemy.x = 560;
    enemy.y = 500;
    ally.x = 565;
    ally.y = 505;
    bystander.x = 570;
    bystander.y = 510;
    m.ctx.grid.clear();
    for (const u of m.state.units) if (u.alive) m.ctx.grid.insert(u);
    const hp = new Map([caster, ally, enemy, bystander].map((u) => [u.id, u.hp]));
    caster.hero!.cd = [0, 0, 0, 0];
    // Censure (the Bishop's third base skill) is a burst centred on an enemy piece.
    expect(tryCast(m.ctx, caster, 2)).toBe(true);
    expect(enemy.hp).toBeLessThan(hp.get(enemy.id)!);
    expect(bystander.hp).toBeLessThan(hp.get(bystander.id)!);
    expect(ally.hp).toBe(hp.get(ally.id));
    expect(caster.hp).toBe(hp.get(caster.id));
  });
});
