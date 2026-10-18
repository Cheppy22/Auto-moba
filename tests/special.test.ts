import { describe, expect, it } from 'vitest';
import { Match } from '../src/sim';
import { tryCast } from '../src/sim/combat';
import { startRecall } from '../src/sim/recall';
import { recompute } from '../src/sim/stats';
import { content, liveMatch, piece } from './helpers';

const ACT = content.tuning.phaseSeconds * content.tuning.tickRate;

describe('recall', () => {
  it('is interrupted by damage', () => {
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

describe('Dubious Techniques', () => {
  it('revives once with the Lantern of the Drowned', () => {
    const m = liveMatch(43);
    const p = piece(m, 'A', 'queen');
    p.hero!.techniques = [{ id: 'lantern_of_the_drowned', grade: 'plain' }];
    recompute(m.ctx, p);
    p.hp = 0;
    p.pendingKill = { killerId: 0, origin: 'test' };
    m.step(2);
    expect(p.alive).toBe(true);
    expect(p.hero!.revived).toBe(true);
    p.hp = 0;
    p.pendingKill = { killerId: 0, origin: 'test' };
    m.step(2);
    expect(p.alive).toBe(false);
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
    m.state.units = m.state.units.filter((u) => u.kind === 'hero');
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
