import type { Ctx } from './ctx';
import type { LaneId } from './content/schema';
import { makePawn } from './units';
import { LANES } from './world/map';
import type { CommandResult, PlayTeam } from './types';

/** Living-pawn cap: `capBase` through Act capFromAct-1, then +capPerAct each Act. */
export function pawnCap(ctx: Ctx): number {
  const p = ctx.t.pawns;
  const act = Math.max(1, ctx.s.phase.n);
  return act < p.capFromAct ? p.capBase : p.capBase + p.capPerAct * (act - p.capFromAct + 1);
}

export function pawnsAlive(ctx: Ctx, team: PlayTeam): number {
  let n = 0;
  for (const u of ctx.s.units) if (u.alive && u.pawn && u.team === team) n++;
  return n;
}

/** Spends Tempo to field one elite pawn that marches the lane from the base. */
export function fieldPawn(ctx: Ctx, team: PlayTeam, lane: LaneId): CommandResult {
  if (ctx.s.phase.kind !== 'live')
    return { ok: false, reason: 'pawns are fielded during the match' };
  if (!LANES.includes(lane)) return { ok: false, reason: 'pick a lane' };
  const cost = ctx.t.pawns.cost;
  if (ctx.s.tempo[team] < cost) return { ok: false, reason: 'not enough Tempo' };
  if (pawnsAlive(ctx, team) >= pawnCap(ctx)) return { ok: false, reason: 'pawn cap reached' };
  ctx.s.tempo[team] -= cost;
  const u = makePawn(ctx, team, lane);
  ctx.grid.insert(u);
  ctx.emit('pawnFielded', { team, lane, id: u.id });
  return { ok: true };
}
