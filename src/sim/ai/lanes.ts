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
