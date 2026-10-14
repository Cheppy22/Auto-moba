import { committed } from './bell';
import type { Ctx } from './ctx';
import { pawnCap } from './pawns';
import { workingRelic } from './relics';
import { PLAY_TEAMS } from './names';
import { fieldTowardQuota } from './relicsLive';
import { LANES } from './world/map';
import type { CommandResult, PawnQuota, PlayTeam } from './types';

/**
 * White's standing pawn plan (Orders at each Act break): pawns are fielded toward these lane
 * counts whenever Tempo is above the reserve. Pawn Structure does the same job with a chosen
 * reserve and auto pawns that cost 2 less, and takes over while it is held. An AI-controlled
 * side follows the same rule with the default counts (`aiOrPlayerPlan`).
 */
export function setPawnPlan(ctx: Ctx, quota: PawnQuota): CommandResult {
  if (LANES.some((l) => !Number.isInteger(quota[l]) || quota[l] < 0))
    return { ok: false, reason: 'set a pawn count for each lane' };
  const total = LANES.reduce((n, l) => n + quota[l], 0);
  const act = ctx.s.bell.stage === 'break' ? ctx.s.phase.n + 1 : ctx.s.phase.n;
  if (total > pawnCap(ctx, 'A', act)) return { ok: false, reason: 'more pawns than your cap' };
  ctx.s.pawnPlan = {
    quota: { top: quota.top, mid: quota.mid, bot: quota.bot },
    reserve: ctx.t.pawns.planReserve,
    auto: ctx.s.pawnPlan?.auto ?? true,
  };
  return { ok: true };
}

/** Turns the standing plan's automatic fielding on or off for the match; the counts stay. */
export function setPawnAuto(ctx: Ctx, auto: boolean): CommandResult {
  const plan = ctx.s.pawnPlan;
  if (plan) plan.auto = auto;
  else
    ctx.s.pawnPlan = { quota: { top: 0, mid: 0, bot: 0 }, reserve: ctx.t.pawns.planReserve, auto };
  return { ok: true };
}

/**
 * The plan a side's pawns follow now, or null: an AI-controlled side always uses the default
 * counts (`pawns.planQuota`, the browser's starting plan) and reserve; White as the player uses
 * its own plan while auto is on. Nothing while Pawn Structure is held (it takes over).
 */
function aiOrPlayerPlan(ctx: Ctx, team: PlayTeam): { quota: PawnQuota; reserve: number } | null {
  if (workingRelic(ctx, team, 'pawn_structure')) return null;
  if (ctx.s.autoGambits[team])
    return { quota: ctx.t.pawns.planQuota, reserve: ctx.t.pawns.planReserve };
  const plan = team === 'A' ? ctx.s.pawnPlan : undefined;
  return plan?.auto ? plan : null;
}

/** Every 10 ticks: field one pawn per side toward its plan (never during the bell's tolls and halt). */
export function tickPawnPlan(ctx: Ctx): void {
  const s = ctx.s;
  if (s.phase.kind !== 'live' || s.tick % 10 !== 0 || committed(ctx)) return;
  for (const team of PLAY_TEAMS) {
    const plan = aiOrPlayerPlan(ctx, team);
    if (plan) fieldTowardQuota(ctx, team, plan.quota, plan.reserve, 0);
  }
}
