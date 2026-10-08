import { describe, expect, it } from 'vitest';
import type { Match } from '../src/sim';
import { dealDamage, fireTriggers, tryRevive } from '../src/sim/combat';
import { recompute } from '../src/sim/stats';
import type { Unit } from '../src/sim';
import { liveMatch, piece } from './helpers';

function live(seed = 11): { m: Match; p: Unit; foe: Unit } {
  const m = liveMatch(seed, { autoGambits: { A: false, B: false } });
  const p = piece(m, 'A', 'queen');
  const foe = piece(m, 'B', 'rook');
  return { m, p, foe };
}

function equip(m: Match, p: Unit, items: string[]): void {
  p.hero!.items = items;
  recompute(m.ctx, p);
}

describe('item triggers', () => {
  it('stacks a statMod up to maxStacks (Ratchet)', () => {
    const { m, p, foe } = live();
    equip(m, p, ['cogged_edge']);
    for (let i = 0; i < 9; i++) fireTriggers(m.ctx, p, 'hit', { victim: foe, damage: 10 });
    const mod = p.mods.find((x) => x.stat === 'atkSpeed')!;
    expect(mod.value).toBeCloseTo(1.2, 5);
  });

  it('every Nth hit fires (Piston Gauntlet strikes on the 4th)', () => {
    const { m, p, foe } = live();
    equip(m, p, ['piston_gauntlet']);
    const hp = foe.hp;
    for (let i = 0; i < 3; i++) fireTriggers(m.ctx, p, 'hit', { victim: foe, damage: 10 });
    expect(foe.hp).toBe(hp);
    fireTriggers(m.ctx, p, 'hit', { victim: foe, damage: 10 });
    expect(foe.hp).toBeLessThan(hp);
  });

  it('vs filters by victim kind (Honed only on heroes, Chop only on non-heroes)', () => {
    const { m, p, foe } = live();
    equip(m, p, ['whetstone_drill']);
    const hp = foe.hp;
    fireTriggers(m.ctx, p, 'hit', { victim: foe, damage: 10 });
    expect(foe.hp).toBeLessThan(hp);
    equip(m, p, ['rusted_cleaver']);
    const hp2 = foe.hp;
    fireTriggers(m.ctx, p, 'hit', { victim: foe, damage: 10 });
    expect(foe.hp).toBe(hp2);
  });

  it('execute finishes a hero under the threshold only (Vorpal Blade)', () => {
    const { m, p, foe } = live();
    equip(m, p, ['vorpal_blade']);
    foe.hp = foe.stats.maxHp * 0.3;
    fireTriggers(m.ctx, p, 'hit', { victim: foe, damage: 10 });
    expect(foe.pendingKill).toBeNull();
    foe.hp = foe.stats.maxHp * 0.1;
    fireTriggers(m.ctx, p, 'hit', { victim: foe, damage: 10 });
    expect(foe.pendingKill).not.toBeNull();
  });

  it('lastStand saves the holder once per life (Pocket Vault Shell)', () => {
    const { m, p, foe } = live();
    equip(m, p, ['pocket_vault_shell']);
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

  it('cooldownTick shortens ability cooldowns on a kill (Eternal Wick)', () => {
    const { m, p, foe } = live();
    equip(m, p, ['eternal_wick']);
    p.hero!.cd = [200, 50, 130, 0];
    fireTriggers(m.ctx, p, 'kill', { victim: foe });
    expect(p.hero!.cd).toEqual([80, 0, 10, 0]);
  });

  it('outOfCombat regen only runs when quiet (Iron Lung)', () => {
    const { m, p } = live();
    // Keep the enemy pieces out of it (a long-range snipe would spoil the reading).
    for (const id of m.state.teams.B.heroIds) m.unitById(id)!.alive = false;
    equip(m, p, ['iron_lung']);
    p.x = 500;
    p.y = 500;
    p.hp = p.stats.maxHp * 0.5;
    p.lastDamagedTick = m.state.tick;
    p.hero!.lastDealtTick = m.state.tick;
    const before = p.hp;
    m.step(60);
    const busy = p.hp - before;
    p.hp = p.stats.maxHp * 0.5;
    p.x = 500;
    p.y = 500;
    p.lastDamagedTick = -9999;
    p.hero!.lastDealtTick = -9999;
    const mid = p.hp;
    m.step(60);
    expect(p.hp - mid).toBeGreaterThan(busy);
  });

  it('self-cost custom behaviors never kill the holder (Wishgranter Receipt)', () => {
    const { m, p } = live();
    equip(m, p, ['wishgranters_receipt']);
    p.hp = 5;
    m.step(400);
    expect(p.hp).toBeGreaterThanOrEqual(1);
  });
});
