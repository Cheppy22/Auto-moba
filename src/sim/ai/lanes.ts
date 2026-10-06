import { dist } from '../core/math';
import type { Ctx } from '../ctx';
import type { LaneId } from '../content/schema';
import { LANES, lanePoint, laneT, type Pt } from '../world/map';
import type { PlayTeam, Unit } from '../types';
import { other } from '../types';

export function progressAt(ctx: Ctx, team: PlayTeam, lane: LaneId, x: number, y: number): number {
  const t = laneT(ctx.world.lanes[lane], x, y);
  return team === 'A' ? t : 1 - t;
}

export function pointAtProgress(ctx: Ctx, team: PlayTeam, lane: LaneId, p: number): Pt {
  const q = Math.max(0, Math.min(1, p));
  return lanePoint(ctx.world.lanes[lane], team === 'A' ? q : 1 - q);
}

export function updateFronts(ctx: Ctx): void {
  const tf = ctx.world.map.towerFractions;
  const best: Record<PlayTeam, Record<LaneId, number>> = {
    A: { top: -1, mid: -1, bot: -1 },
    B: { top: -1, mid: -1, bot: -1 },
  };
  for (const u of ctx.s.units) {
    if (u.kind !== 'minion' || !u.alive || !u.lane || u.team === 'neutral') continue;
    const p = progressAt(ctx, u.team, u.lane, u.x, u.y);
    if (p > best[u.team][u.lane]) best[u.team][u.lane] = p;
  }
  for (const team of ['A', 'B'] as PlayTeam[]) {
    for (const lane of LANES) {
      const [outer, inner] = ctx.towers[team][lane];
      const fallback = outer?.alive ? tf.outer + 0.03 : inner?.alive ? tf.inner + 0.03 : tf.inner;
      ctx.front[team][lane] = best[team][lane] >= 0 ? best[team][lane] : fallback;
    }
  }
}

export function enemyTowerTarget(ctx: Ctx, team: PlayTeam, lane: LaneId): Unit | null {
  const foe = other(team);
  const [outer, inner] = ctx.towers[foe][lane];
  if (outer?.alive) return outer;
  if (inner?.alive) return inner;
  return null;
}

export function closestLane(ctx: Ctx, u: Unit): LaneId {
  let best: LaneId = 'mid';
  let bestD = Infinity;
  for (const lane of LANES) {
    const t = laneT(ctx.world.lanes[lane], u.x, u.y);
    const p = lanePoint(ctx.world.lanes[lane], t);
    const d = dist(u.x, u.y, p.x, p.y);
    if (d < bestD) {
      bestD = d;
      best = lane;
    }
  }
  return best;
}

/**
 * Waypoints that keep a hero on its lane: walk (via the nav graph) to the lane point nearest the
 * hero, then follow the lane polyline to the goal. Null when the goal is not on the lane, so the
 * caller falls back to a plain nav-graph path.
 */
export function lanePath(
  ctx: Ctx,
  u: Unit,
  lane: LaneId,
  gx: number,
  gy: number,
  maxOff: number,
  route: (x: number, y: number) => [number, number][],
): [number, number][] | null {
  const geo = ctx.world.lanes[lane];
  const tg = laneT(geo, gx, gy);
  const pg = lanePoint(geo, tg);
  if (dist(gx, gy, pg.x, pg.y) > maxOff) return null;
  const tu = laneT(geo, u.x, u.y);
  const pu = lanePoint(geo, tu);
  const out: [number, number][] = [];
  if (dist(u.x, u.y, pu.x, pu.y) > maxOff) out.push(...route(pu.x, pu.y));
  else out.push([u.x, u.y]);
  const lo = Math.min(tu, tg) * geo.length;
  const hi = Math.max(tu, tg) * geo.length;
  const mid: [number, number][] = [];
  for (let i = 0; i < geo.pts.length; i++) {
    if (geo.cum[i] > lo + 1 && geo.cum[i] < hi - 1) mid.push([geo.pts[i][0], geo.pts[i][1]]);
  }
  if (tg < tu) mid.reverse();
  out.push(...mid, [gx, gy]);
  return out;
}
