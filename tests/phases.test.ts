import { describe, expect, it } from 'vitest';
import { Match } from '../src/sim';
import { healUnit } from '../src/sim/combat';
import { respawnTicks } from '../src/sim/systems';
import { content } from './helpers';

function openIds(m: Match): string[] {
  return m.state.slots.filter((s) => s.open).map((s) => s.id);
}

function stalemate(seed: number): Match {
  const m = Match.create(content, { seed, player: null });
  for (const team of ['A', 'B'] as const) {
    const g = m.ctx.guardians[team]!;
    g.base = { ...g.base, maxHp: 1e9 };
    g.hp = 1e9;
    g.dirty = true;
  }
  return m;
}

describe('phases and biomes', () => {
  it('opens two slots per phase, 3 in total, as pairs sharing a biome', () => {
    const m = Match.create(content, { seed: 4, player: null });
    expect(openIds(m).sort()).toEqual(['brc', 'tlc']);
    m.issue({ type: 'startPhase' });
    m.step(4800);
    m.issue({ type: 'continue' });
    expect(openIds(m).sort()).toEqual(['brb', 'brc', 'tla', 'tlc']);
    m.issue({ type: 'startPhase' });
    m.step(4800);
    m.issue({ type: 'continue' });
    expect(openIds(m)).toHaveLength(6);
    const byId = Object.fromEntries(m.state.slots.map((s) => [s.id, s]));
    expect(byId.tlc.biomeId).toBe(byId.brc.biomeId);
    expect(byId.tla.biomeId).toBe(byId.brb.biomeId);
    expect(byId.bra.biomeId).toBe(byId.tlb.biomeId);
  });

  it('randomizes biomes by seed', () => {
    const seen = new Set<string>();
    for (let seed = 1; seed <= 12; seed++) {
      const m = Match.create(content, { seed, player: null });
      seen.add(m.state.slots.map((s) => s.biomeId).join(','));
    }
    expect(seen.size).toBeGreaterThan(2);
  });

  it('re-rolls the jungle every phase', () => {
    const m = Match.create(content, { seed: 8, player: null });
    const rolls = (): number => m.events.filter((e) => e.type === 'campsRolled').length;
    const a = rolls();
    m.issue({ type: 'startPhase' });
    m.step(4800);
    m.issue({ type: 'continue' });
    expect(rolls()).toBeGreaterThan(a);
    const types = m.state.slots.filter((s) => s.open).flatMap((s) => s.types);
    expect(types.length).toBeGreaterThan(0);
  });

  it('respawn time grows inside a phase and its base rises each phase', () => {
    const m = Match.create(content, { seed: 2, player: null });
    const hero = m.unitById(m.state.teams.A.heroIds[0])!;
    m.issue({ type: 'startPhase' });
    const early = respawnTicks(m.ctx, hero);
    m.ctx.s.tick += 4000;
    const late = respawnTicks(m.ctx, hero);
    expect(late).toBeGreaterThan(early);
    m.ctx.s.tick -= 4000;
    m.ctx.s.phase.n = 3;
    expect(respawnTicks(m.ctx, hero)).toBeGreaterThan(early);
  });

  it('a hero who is dead at the end of a phase stays dead into the next', () => {
    const m = Match.create(content, { seed: 2, player: null });
    m.issue({ type: 'startPhase' });
    m.step(4700);
    const hero = m.unitById(m.state.teams.A.heroIds[0])!;
    hero.hp = 0;
    hero.pendingKill = { killerId: 0 };
    m.step(100);
    expect(hero.alive).toBe(false);
    const due = hero.hero!.respawnAt!;
    expect(m.state.phase.kind).toBe('report');
    m.issue({ type: 'continue' });
    m.issue({ type: 'startPhase' });
    expect(hero.alive).toBe(false);
    m.step(Math.max(1, due - m.state.tick) + 2);
    expect(hero.alive).toBe(true);
  });

  it('stacks pressure events in the fixed order from phase 4', () => {
    const m = stalemate(5);
    const seenAt: Record<number, string[]> = {};
    for (let i = 0; i < 8 && m.state.phase.kind !== 'end'; i++) {
      m.issue({ type: 'startPhase' });
      seenAt[m.state.phase.n] = m.state.pressure.slice();
      m.step(4800);
      if (m.state.phase.kind === 'report') m.issue({ type: 'continue' });
    }
    expect(seenAt[3]).toEqual([]);
    expect(seenAt[4]).toEqual(['thinning_veil']);
    expect(seenAt[5]).toEqual(['thinning_veil', 'spirit_tide']);
    expect(seenAt[6]).toEqual(['thinning_veil', 'spirit_tide', 'keeper_debts']);
    expect(seenAt[7]).toEqual([
      'thinning_veil',
      'spirit_tide',
      'keeper_debts',
      'restless_guardians',
    ]);
    expect(m.state.tagMult.heal).toBe(0.5);
    expect(m.state.tagMult.curse).toBe(2);
    expect(m.ctx.guardians.A!.roaming).toBe(true);
    expect(m.events.filter((e) => e.type === 'pressure')).toHaveLength(4);
  });

  it('thinning veil halves healing', () => {
    const m = Match.create(content, { seed: 1, player: null });
    const hero = m.unitById(m.state.teams.A.heroIds[0])!;
    hero.hp = 100;
    const full = healUnit(m.ctx, null, hero, 100, 'test', false);
    hero.hp = 100;
    m.state.tagMult.heal = 0.5;
    const half = healUnit(m.ctx, null, hero, 100, 'test', false);
    expect(half).toBeCloseTo(full / 2);
  });

  it('spirit tide sends neutral spirits into the lanes', () => {
    const m = stalemate(6);
    for (let i = 0; i < 5; i++) {
      m.issue({ type: 'startPhase' });
      m.step(4800);
      m.issue({ type: 'continue' });
    }
    m.issue({ type: 'startPhase' });
    m.step(700);
    const tide = m.state.units.filter((u) => u.defId === 'tide_spirit');
    expect(tide.length).toBeGreaterThan(0);
    expect(tide.every((u) => u.team === 'neutral')).toBe(true);
  });

  it('refuses to continue past the phase limit', () => {
    const m = stalemate(7);
    m.state.phase = { kind: 'report', n: content.tuning.maxPhases, startTick: 0 };
    expect(m.issue({ type: 'continue' }).ok).toBe(false);
  });

  it('roaming guardians end every stalemate within ten phases', () => {
    for (const seed of [21, 22]) {
      const m = Match.create(content, { seed, player: null });
      m.runToEnd(content.tuning.maxPhases);
      expect(m.state.winner).not.toBeNull();
    }
  });
});
