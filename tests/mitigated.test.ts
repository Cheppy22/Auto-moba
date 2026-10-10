import { describe, expect, it } from 'vitest';
import { buildActReport } from '../src/sim/actReport';
import { dealDamage } from '../src/sim/combat';
import { liveMatch, piece } from './helpers';

function lastDamage(m: ReturnType<typeof liveMatch>, tgt: number): { amount: number; mit: number } {
  const list = m.events.filter((e) => e.type === 'damage' && e.payload.tgt === tgt);
  const e = list[list.length - 1];
  if (e?.type !== 'damage') throw new Error('no damage event');
  return { amount: e.payload.amount, mit: e.payload.mitigated ?? 0 };
}

describe('damage mitigated', () => {
  it('records armor and shield reduction on the defender, and nothing when none applies', () => {
    const m = liveMatch(5, { autoGambits: { A: false, B: false } });
    const qa = piece(m, 'A', 'queen');
    const rb = piece(m, 'B', 'rook');
    rb.stats.armor = 0;
    rb.stats.damageTakenMult = 1;
    rb.shields = [];
    dealDamage(m.ctx, qa, rb, 100, 'blade', 'test');
    expect(lastDamage(m, rb.id)).toEqual({ amount: 100, mit: 0 });

    // 100 armor halves a blade hit: 50 mitigated, 50 taken.
    rb.stats.armor = 100;
    dealDamage(m.ctx, qa, rb, 100, 'blade', 'test');
    expect(lastDamage(m, rb.id)).toEqual({ amount: 50, mit: 50 });

    // A shield soaks part of what armor let through: 50 + 20 mitigated.
    rb.shields = [{ amount: 20, expiresTick: m.state.tick + 100 }];
    dealDamage(m.ctx, qa, rb, 100, 'blade', 'test');
    expect(lastDamage(m, rb.id)).toEqual({ amount: 50, mit: 70 });

    // A damage-taken multiplier below 1 counts too; amplification does not.
    rb.stats.armor = 0;
    rb.stats.damageTakenMult = 0.6;
    dealDamage(m.ctx, qa, rb, 100, 'true', 'test');
    expect(lastDamage(m, rb.id)).toEqual({ amount: 60, mit: 40 });
    rb.stats.damageTakenMult = 1.2;
    dealDamage(m.ctx, qa, rb, 10, 'true', 'test');
    expect(lastDamage(m, rb.id).mit).toBe(0);

    const act = buildActReport(m.ctx);
    const row = act.teams.B.pieces.find((p) => p.id === rb.id)!;
    expect(row.mitigated).toBe(160);
    expect(act.teams.B.mitigated).toBe(160);
    expect(act.teams.A.mitigated).toBe(0);
  });
});
