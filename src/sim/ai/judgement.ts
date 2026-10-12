import { TPS } from '../combat';
import { dist } from '../core/math';
import { hpPct, type Ctx } from '../ctx';
import { LANES } from '../world/map';
import type { PlayTeam, Unit } from '../types';
import { closestLane } from './lanes';
import { unitDps, unitEhp } from './power';
import { isWary } from './swap';

/**
 * Piece judgement shared by the fight loop and the goal picker: the retreat line, sure kills,
 * enemy structure cover and the tower-dive check. Numbers are in `content/tuning.json` → `judgement`.
 */

/**
 * The enemy Bastion or Throne whose reach (plus `margin`) covers (x, y), or the nearest one with
 * `margin` Infinity. Null when none.
 */
export function enemyCover(
  ctx: Ctx,
  team: PlayTeam,
  x: number,
  y: number,
  margin: number,
): Unit | null {
  const foe: PlayTeam = team === 'A' ? 'B' : 'A';
  let best: Unit | null = null;
  let bestGap = margin;
  const consider = (t: Unit | null | undefined): void => {
    if (!t?.alive) return;
    const gap = dist(x, y, t.x, t.y) - t.stats.range;
    if (gap <= bestGap) {
      bestGap = gap;
      best = t;
    }
  };
  for (const lane of LANES) for (const t of ctx.towers[foe][lane]) consider(t);
  consider(ctx.guardians[foe]);
  return best;
}

export function underEnemyTower(ctx: Ctx, team: PlayTeam, x: number, y: number): boolean {
  return enemyCover(ctx, team, x, y, 12) !== null;
}

/** Health share at which this piece breaks off: by role, sooner when it keeps dying. */
export function retreatLine(ctx: Ctx, u: Unit): number {
  const h = u.hero!;
  return (ctx.t.judgement.retreatHp[h.defId] ?? 0.3) + (isWary(ctx, h) ? 0.12 : 0);
}

/**
 * True when enemy piece `t` is sure to fall within `judgement.finishSec` to the damage of `u`'s
 * side that can reach it now (pieces, pawns, pawnlings and structures in reach).
 */
export function sureKill(ctx: Ctx, u: Unit, t: Unit): boolean {
  if (t.kind !== 'hero' || !t.alive || dist(u.x, u.y, t.x, t.y) > u.stats.range + 40) return false;
  let dps = 0;
  for (const a of ctx.grid.query(t.x, t.y, 220)) {
    if (!a.alive || a.team !== u.team) continue;
    if (dist(a.x, a.y, t.x, t.y) > a.stats.range + 40) continue;
    if (a.kind === 'hero') dps += unitDps(a);
    else if (a.kind === 'minion') dps += unitDps(a) * 0.5;
    else if (a.kind === 'tower' || a.kind === 'guardian') dps += unitDps(a) * 0.8;
  }
  return unitEhp(t) <= dps * ctx.t.judgement.finishSec;
}

/**
 * Tower-dive check for chasing enemy piece `t`: refused when the chase ends inside an enemy
 * Bastion's or Throne's reach (or the target gets there before `u` catches it), unless `u` is
 * healthy, the structure is busy with someone other than a piece, and the kill is sure.
 */
export function diveBlocked(ctx: Ctx, u: Unit, t: Unit): boolean {
  if (t.kind !== 'hero') return false;
  const j = ctx.t.judgement;
  const team = u.team as PlayTeam;
  let cover = enemyCover(ctx, team, t.x, t.y, j.diveMargin);
  if (!cover) {
    const near = enemyCover(ctx, team, t.x, t.y, Infinity);
    if (!near) return false;
    const toCover = dist(t.x, t.y, near.x, near.y) - near.stats.range - j.diveMargin;
    const mySpeed = (u.stats.moveSpeed * ctx.t.movement.speedMul) / TPS;
    const itsSpeed = (t.stats.moveSpeed * ctx.t.movement.speedMul) / TPS;
    // the target runs when it is breaking off or heading home (its state, not this tick's motion,
    // so the answer does not depend on which unit moved first in the tick)
    const g = t.hero?.goal?.kind;
    const runs = t.hero?.engage === 'flee' || g === 'retreat' || g === 'base';
    const gap = Math.max(0, dist(u.x, u.y, t.x, t.y) - u.stats.range);
    const closing = Math.max(mySpeed * 0.25, runs ? mySpeed - itsSpeed : mySpeed);
    if (toCover / Math.max(0.01, itsSpeed) >= gap / closing) return false;
    cover = near;
  }
  if (hpPct(u) < j.diveHp) return true;
  const shot = cover.targetId !== null ? ctx.unit(cover.targetId) : undefined;
  const busy = !!shot && shot.alive && shot.kind !== 'hero';
  return !(busy && sureKill(ctx, u, t));
}

/** Any enemy pressure on this spot: pieces, a structure in reach, or pawns that outgun us. */
export function threatened(ctx: Ctx, u: Unit, ratio: number, enemyHeroes: number): boolean {
  return enemyHeroes > 0 || ratio < 1 || underEnemyTower(ctx, u.team as PlayTeam, u.x, u.y);
}

/**
 * Where a piece that is outmatched but not badly hurt falls back to: just behind the nearest own
 * Bastion of its lane (or its Throne) that lies between it and its base, else the base itself.
 */
export function fallbackPoint(ctx: Ctx, u: Unit): { x: number; y: number; structure: Unit | null } {
  const team = u.team as PlayTeam;
  const base = ctx.world.basePos[team];
  const mine = dist(u.x, u.y, base.x, base.y);
  let best: Unit | null = null;
  let bestD = Infinity;
  const consider = (st: Unit | null | undefined): void => {
    if (!st?.alive) return;
    if (dist(st.x, st.y, base.x, base.y) > mine - 40) return;
    const d = dist(u.x, u.y, st.x, st.y);
    if (d < bestD) {
      bestD = d;
      best = st;
    }
  };
  for (const st of ctx.towers[team][closestLane(ctx, u)]) consider(st);
  consider(ctx.guardians[team]);
  const st = best as Unit | null;
  if (!st) return { x: base.x, y: base.y, structure: null };
  const dx = base.x - st.x;
  const dy = base.y - st.y;
  const l = Math.sqrt(dx * dx + dy * dy) || 1;
  return { x: st.x + (dx / l) * 40, y: st.y + (dy / l) * 40, structure: st };
}
