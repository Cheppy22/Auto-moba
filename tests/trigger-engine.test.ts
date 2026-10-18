import { describe, expect, it } from 'vitest';
import type { Match } from '../src/sim';
import { dealDamage, fireTriggers, tryRevive } from '../src/sim/combat';
import { recompute } from '../src/sim/stats';
import type { Unit } from '../src/sim';
import { content, liveMatch, piece } from './helpers';

// The trigger engine (the rules pieces, styles and Techniques share), read through Techniques.

function live(seed = 11): { m: Match; p: Unit; foe: Unit } {
  const m = liveMatch(seed, { autoGambits: { A: false, B: false } });
  const p = piece(m, 'A', 'queen');
  const foe = piece(m, 'B', 'rook');
  return { m, p, foe };
}

function hold(m: Match, p: Unit, ids: string[]): void {
  p.hero!.techniques = ids.map((id) => ({ id, grade: 'plain' as const }));
  recompute(m.ctx, p);
}

describe('trigger engine', () => {
  it('every Nth hit fires (Wind-up strikes on the 4th)', () => {
    const { m, p, foe } = live();
    hold(m, p, ['wind_up']);
    const hp = foe.hp;
    for (let i = 0; i < 3; i++) fireTriggers(m.ctx, p, 'hit', { victim: foe, damage: 10 });
    expect(foe.hp).toBe(hp);
    fireTriggers(m.ctx, p, 'hit', { victim: foe, damage: 10 });
    expect(foe.hp).toBeLessThan(hp);
  });

  it('vs filters by victim kind (Battering Hits only on structures)', () => {
    const { m, p, foe } = live();
    hold(m, p, ['battering_hits']);
    const hp = foe.hp;
    fireTriggers(m.ctx, p, 'hit', { victim: foe, damage: 100 });
    expect(foe.hp).toBe(hp);
    const tower = m.state.units.find((u) => u.kind === 'tower' && u.team === 'B')!;
    const thp = tower.hp;
    fireTriggers(m.ctx, p, 'hit', { victim: tower, damage: 100 });
    expect(tower.hp).toBeLessThan(thp);
  });

  it('execute finishes a piece under the threshold only (Huntress: For the Kill)', () => {
    const { m, p, foe } = live();
    hold(m, p, ['huntress_kill']);
    foe.hp = foe.stats.maxHp * 0.3;
    fireTriggers(m.ctx, p, 'hit', { victim: foe, damage: 10 });
    expect(foe.pendingKill).toBeNull();
    foe.hp = foe.stats.maxHp * 0.1;
    fireTriggers(m.ctx, p, 'hit', { victim: foe, damage: 10 });
    expect(foe.pendingKill).not.toBeNull();
  });

  it('lastStand saves the holder once per life (The Vault)', () => {
    const { m, p, foe } = live();
    hold(m, p, ['the_vault']);
    p.hp = 10;
    dealDamage(m.ctx, foe, p, 9999, 'true', 'test');
    expect(p.pendingKill).not.toBeNull();
    expect(tryRevive(m.ctx, p)).toBe(true);
    expect(p.hp).toBe(1);
    expect(p.shields.length).toBeGreaterThan(0);
    p.shields = [];
    dealDamage(m.ctx, foe, p, 9999, 'true', 'test');
    expect(tryRevive(m.ctx, p)).toBe(false);
  });

  it('cooldownTick shortens ability cooldowns on a kill (Regent: Endless Decree)', () => {
    const { m, p, foe } = live();
    hold(m, p, ['regent_endless']);
    p.hero!.cd = [200, 50, 130, 0];
    fireTriggers(m.ctx, p, 'kill', { victim: foe });
    // 8 s at 20 ticks a second
    expect(p.hero!.cd).toEqual([40, 0, 0, 0]);
  });

  it('outOfCombat regen heals a piece left alone (Deep Breath)', () => {
    // the same quiet stretch twice, with and without the Technique (enemy pieces out of it)
    const quiet = (ids: string[]): number => {
      const { m, p } = live();
      for (const id of m.state.teams.B.heroIds) m.unitById(id)!.alive = false;
      hold(m, p, ids);
      p.x = content.map.size / 2;
      p.y = content.map.size / 2;
      p.hp = p.stats.maxHp * 0.5;
      p.lastDamagedTick = -9999;
      p.hero!.lastDealtTick = -9999;
      const before = p.hp;
      m.step(60);
      return p.hp - before;
    };
    expect(quiet(['deep_breath'])).toBeGreaterThan(quiet([]));
  });

  it('a self-cost never kills the holder (Blood Price)', () => {
    const { m, p } = live();
    hold(m, p, ['blood_price']);
    p.hp = 5;
    p.lastDamagedTick = m.state.tick;
    m.step(400);
    expect(p.hp).toBeGreaterThanOrEqual(1);
  });
});
