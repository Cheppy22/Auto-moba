import { rand } from '../core/rng';
import type { Ctx } from '../ctx';
import type { ActPieceStat, ActReport, LaneId, PlayTeam } from '../types';
import { other } from '../types';
import { swapLanes } from './swap';

const LANE_ORDER: LaneId[] = ['top', 'mid', 'bot'];

/** How a team did in a lane this Act: piece trades, pawnling trades and Bastions won or lost. */
function laneResult(report: ActReport, team: PlayTeam, lane: LaneId): number {
  const me = report.teams[team];
  const foe = report.teams[other(team)];
  let score = 0;
  for (const p of me.pieces) if (p.lane === lane) score += p.kills - p.deaths;
  score += 0.25 * (foe.pawnlingsLost[lane] - me.pawnlingsLost[lane]);
  score += 2 * foe.bastionsLost.filter((l) => l === lane).length;
  score -= 2 * me.bastionsLost.filter((l) => l === lane).length;
  return score;
}

/**
 * At an Act break the AI may move its most beaten piece (at least `replan.minDeaths` deaths) to
 * the lane that went best for the team, swapping with the steadiest piece there so the 2/2/1
 * formation holds. The chance roll is always drawn, so the `ai` stream advances the same way
 * whether or not a piece moves.
 */
export function replanLanes(ctx: Ctx, team: PlayTeam, report: ActReport): void {
  const cfg = ctx.t.bell.replan;
  if (rand(ctx.s.rng, 'ai') >= cfg.chance) return;
  const pieces = report.teams[team].pieces;
  const losing = pieces
    .filter((p) => p.deaths >= cfg.minDeaths)
    .sort((a, b) => b.deaths - a.deaths || a.damage - b.damage || a.id - b.id)[0];
  if (!losing) return;
  const target = LANE_ORDER.filter((l) => l !== losing.lane).sort(
    (a, b) => laneResult(report, team, b) - laneResult(report, team, a),
  )[0];
  const partner = pieces
    .filter((p: ActPieceStat) => p.lane === target)
    .sort((a, b) => a.deaths - b.deaths || b.damage - a.damage || a.id - b.id)[0];
  if (!partner) return;
  const a = ctx.unit(losing.id);
  const b = ctx.unit(partner.id);
  if (a?.hero && b?.hero) swapLanes(ctx, a, b);
}
