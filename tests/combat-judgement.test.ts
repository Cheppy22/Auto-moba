import { describe, expect, it } from 'vitest';
import type { Match, Unit } from '../src/sim';
import { updateEngage } from '../src/sim/behavior';
import { diveBlocked, retreatLine } from '../src/sim/ai/judgement';
import { matchupAt } from '../src/sim/ai/power';
import { bodyRadius } from '../src/sim/collision';
import { planSlots, slotFor } from '../src/sim/spacing';
import { content, liveMatch, piece } from './helpers';

const j = content.tuning.judgement;
const C = content.map.size / 2;

/** The grid as the tick builds it, after a test moved units by hand. */
function regrid(m: Match): void {
  m.ctx.grid.clear();
  for (const u of m.ctx.s.units) if (u.alive) m.ctx.grid.insert(u);
}

function place(u: Unit, x: number, y: number): void {
  u.x = x;
  u.y = y;
  u.px = x;
  u.py = y;
}

const d = (a: { x: number; y: number }, b: { x: number; y: number }): number =>
  Math.hypot(a.x - b.x, a.y - b.y);

describe('engagement spacing', () => {
  it('gives attackers on one target distinct slots in reach, fanned toward their own side', () => {
    const m = liveMatch(5);
    m.step(1);
    const ctx = m.ctx;
    for (const u of ctx.s.units) u.targetId = null;
    const t = piece(m, 'B', 'rook');
    place(t, C, C);
    const melee = (['king', 'rook', 'knight'] as const).map((id) => piece(m, 'A', id));
    const bishop = piece(m, 'A', 'bishop');
    // all four arrive at nearly the same spot, square to the line between the bases
    [...melee, bishop].forEach((u, i) => {
      place(u, C + 30 + i * 0.5, C + 30);
      u.targetId = t.id;
    });
    planSlots(ctx);
    const slots = melee.map((u) => slotFor(u, t)!);
    for (const [i, u] of melee.entries()) {
      expect(slots[i]).not.toBeNull();
      expect(d(slots[i], t)).toBeLessThanOrEqual(u.stats.range + 4);
      expect(d(slots[i], t)).toBeGreaterThanOrEqual(bodyRadius(ctx, u) + bodyRadius(ctx, t));
    }
    for (let a = 0; a < slots.length; a++)
      for (let b = a + 1; b < slots.length; b++)
        expect(d(slots[a], slots[b])).toBeGreaterThanOrEqual(2 * bodyRadius(ctx, melee[a]));
    // the fan leans from where they arrived toward White's base (bottom left): a White line
    const base = ctx.world.basePos.A;
    const mean = slots.reduce((s, p) => ({ x: s.x + p.x / 3, y: s.y + p.y / 3 }), { x: 0, y: 0 });
    expect((mean.x - t.x) * (base.x - t.x) + (mean.y - t.y) * (base.y - t.y)).toBeGreaterThan(0);
    // the ranged Bishop holds a standoff, well outside the melee ring and inside its reach
    const bs = slotFor(bishop, t)!;
    expect(d(bs, t)).toBeGreaterThan(60);
    expect(d(bs, t)).toBeLessThanOrEqual(bishop.stats.range + 4);
  });
});

describe('piece judgement', () => {
  it('a low-health piece never follows a target into Bastion range; a healthy one may finish it', () => {
    const m = liveMatch(5);
    m.step(200);
    const ctx = m.ctx;
    const tower = ctx.towers.B.mid[0];
    const toA = { x: ctx.world.basePos.A.x - tower.x, y: ctx.world.basePos.A.y - tower.y };
    const l = Math.hypot(toA.x, toA.y);
    const at = (k: number): [number, number] => [
      tower.x + (toA.x / l) * k,
      tower.y + (toA.y / l) * k,
    ];
    const t = piece(m, 'B', 'knight');
    const u = piece(m, 'A', 'queen');
    place(t, ...at(tower.stats.range - 30));
    place(u, ...at(tower.stats.range + 50));
    regrid(m);
    u.hp = u.stats.maxHp * (j.diveHp - 0.1);
    expect(diveBlocked(ctx, u, t)).toBe(true);
    // healthy, but the Bastion is idle (it would shoot the diver): still refused
    u.hp = u.stats.maxHp;
    tower.targetId = null;
    expect(diveBlocked(ctx, u, t)).toBe(true);
    // healthy, the Bastion busy with a pawnling and the target all but dead: allowed
    const pawnling = ctx.s.units.find((x) => x.alive && x.kind === 'minion' && x.team === 'A')!;
    tower.targetId = pawnling.id;
    t.hp = 1;
    expect(diveBlocked(ctx, u, t)).toBe(false);
    // a fleeing target that reaches cover before it can be caught is let go
    t.hp = t.stats.maxHp;
    tower.targetId = null;
    place(t, ...at(tower.stats.range + j.diveMargin + 10));
    t.hero!.engage = 'flee';
    place(u, ...at(tower.stats.range + j.diveMargin + 200));
    expect(diveBlocked(ctx, u, t)).toBe(true);
  });

  it('breaks off a 2v1 at even strength that its temperament would once have held', () => {
    const m = liveMatch(5);
    m.step(1);
    const ctx = m.ctx;
    const u = piece(m, 'A', 'queen');
    const foes = [piece(m, 'B', 'queen'), piece(m, 'B', 'bishop')];
    place(u, C, C);
    place(foes[0], C + 60, C - 40);
    place(foes[1], C + 80, C - 60);
    regrid(m);
    const h = u.hero!;
    h.goal = { kind: 'joinFight', x: C, y: C, targetId: null, key: 'joinFight:test' };
    h.holdTicks = 400;
    const ratio = matchupAt(ctx, 'A', u.x, u.y, u).ratio;
    expect(ratio).toBeLessThan(j.badOdds);
    // the old rule (temperament x patience x commitment) would have held this fight
    const ai = content.tuning.ai;
    const pers = content.tuning.personalities.opportunist;
    const eff = ratio * pers.riskTaking * ai.holdBraveCap * ai.commitBonus;
    expect(eff).toBeGreaterThanOrEqual(pers.engageRatio * 0.5);
    updateEngage(ctx, u);
    expect(h.engage).toBe('flee');
    // with a second White piece beside it, the same fight is taken
    const mate = piece(m, 'A', 'rook');
    place(mate, C - 20, C + 10);
    regrid(m);
    h.engage = 'fight';
    updateEngage(ctx, u);
    expect(h.engage).not.toBe('flee');
  });

  it('retreats below its role line and turns back only well above it (hysteresis)', () => {
    const m = liveMatch(5);
    m.step(1);
    const ctx = m.ctx;
    const u = piece(m, 'A', 'knight');
    const foe = piece(m, 'B', 'knight');
    const mate = piece(m, 'A', 'rook');
    place(u, C, C);
    place(mate, C - 20, C + 10);
    place(foe, C + 120, C - 120);
    regrid(m);
    const h = u.hero!;
    const line = retreatLine(ctx, u);
    u.hp = u.stats.maxHp * (line - 0.05);
    updateEngage(ctx, u);
    expect(h.engage).toBe('flee');
    // healed a little, past the line but not past the margin, long after the flight began
    h.fleeSince = ctx.s.tick - 200;
    u.hp = u.stats.maxHp * (line + j.retreatExitHp / 2);
    updateEngage(ctx, u);
    expect(h.engage).toBe('flee');
    // well clear of the line, with a teammate beside it: back in the fight
    u.hp = u.stats.maxHp * (line + j.retreatExitHp + 0.3);
    updateEngage(ctx, u);
    expect(h.engage).not.toBe('flee');
    // the same piece, fighting, does not flee just under the exit margin
    u.hp = u.stats.maxHp * (line + j.retreatExitHp / 2);
    updateEngage(ctx, u);
    expect(h.engage).not.toBe('flee');
  });
});
