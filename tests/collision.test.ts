import { describe, expect, it } from 'vitest';
import { walkable } from '../src/sim';
import type { Match, Unit } from '../src/sim';
import { stepToward } from '../src/sim/behavior';
import { bodyRadius, resolveCollisions } from '../src/sim/collision';
import { content, liveMatch, logHash } from './helpers';

const tol = content.tuning.collision.tolerance;
const isFixed = (u: Unit): boolean =>
  u.kind === 'tower' || u.kind === 'guardian' || u.kind === 'obelisk' || u.kind === 'keeper';

/** The collision step as the tick runs it: the grid holds where everyone stood a moment ago. */
function settle(m: Match, move?: () => void): void {
  const ctx = m.ctx;
  ctx.grid.clear();
  for (const u of ctx.s.units) {
    u.px = u.x;
    u.py = u.y;
    if (u.alive) ctx.grid.insert(u);
  }
  move?.();
  resolveCollisions(ctx);
}

function worstOverlap(m: Match): number {
  const ctx = m.ctx;
  const live = ctx.s.units.filter((u) => u.alive && !u.ev?.ghost);
  let worst = 0;
  for (let i = 0; i < live.length; i++) {
    for (let j = i + 1; j < live.length; j++) {
      const a = live[i];
      const b = live[j];
      if (isFixed(a) && isFixed(b)) continue;
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      worst = Math.max(worst, bodyRadius(ctx, a) + bodyRadius(ctx, b) - d);
    }
  }
  return worst;
}

describe('soft collision', () => {
  it('pulls a pile of pieces and pawns apart until nothing overlaps beyond the tolerance', () => {
    const m = liveMatch(7);
    m.step(700);
    const ctx = m.ctx;
    const crowd = ctx.s.units.filter(
      (u) => u.alive && (u.kind === 'hero' || u.kind === 'minion') && !u.ev,
    );
    expect(crowd.length).toBeGreaterThan(20);
    // Everyone dropped on the middle of the mid lane, a few units apart.
    const mid = content.map.size / 2;
    crowd.slice(0, 26).forEach((u, i) => {
      u.x = mid + ((i % 6) - 2.5) * 9;
      u.y = mid + (Math.floor(i / 6) - 2) * 9;
    });
    for (const u of crowd.slice(26)) {
      u.x = 0;
      u.y = 0;
      u.alive = false;
    }
    expect(worstOverlap(m)).toBeGreaterThan(8);
    for (let i = 0; i < 90; i++) settle(m);
    expect(worstOverlap(m)).toBeLessThanOrEqual(tol + 1.5);
    for (const u of crowd.slice(0, 26))
      expect(walkable(ctx.world.terrain, ctx.open, u.x, u.y)).toBe(true);
  });

  it('never moves a Bastion, Throne, obelisk or the Keeper', () => {
    const m = liveMatch(9);
    const fixed = m.ctx.s.units.filter(isFixed);
    const before = fixed.map((u) => [u.x, u.y]);
    expect(fixed.length).toBeGreaterThan(10);
    m.step(2400);
    fixed.forEach((u, i) => expect([u.x, u.y]).toEqual(before[i]));
  });

  it('lets a piece through a narrow gate between two Bastions', () => {
    const m = liveMatch(3);
    const ctx = m.ctx;
    const y = content.map.bases.A[1];
    const gap = bodyRadius(ctx, ctx.towers.A.bot[0]) + 14;
    ctx.towers.A.bot[0].x = 500;
    ctx.towers.A.bot[0].y = y - gap;
    ctx.towers.A.bot[1].x = 500;
    ctx.towers.A.bot[1].y = y + gap;
    const hero = ctx.unit(ctx.s.teams.A.heroIds[0])!;
    hero.x = 380;
    hero.y = y + 4;
    for (let t = 0; t < 400 && hero.x < 640; t++) settle(m, () => stepToward(ctx, hero, 700, y));
    expect(hero.x).toBeGreaterThan(600);
  });

  it('slides a piece walking head-on into a Bastion past it instead of freezing', () => {
    const m = liveMatch(3);
    const ctx = m.ctx;
    const y = content.map.bases.A[1];
    const tower = ctx.towers.A.bot[0];
    tower.x = 500;
    tower.y = y;
    const hero = ctx.unit(ctx.s.teams.A.heroIds[0])!;
    hero.x = 420;
    hero.y = y;
    for (let t = 0; t < 400 && hero.x < 600; t++) settle(m, () => stepToward(ctx, hero, 700, y));
    expect(hero.x).toBeGreaterThan(560);
    expect(tower.x).toBe(500);
  });

  it('is deterministic: the same seed gives the same log', () => {
    const a = liveMatch(21);
    const b = liveMatch(21);
    a.step(3000);
    b.step(3000);
    expect(logHash(a)).toBe(logHash(b));
    const c = liveMatch(22);
    c.step(3000);
    expect(logHash(c)).not.toBe(logHash(a));
  });
});
