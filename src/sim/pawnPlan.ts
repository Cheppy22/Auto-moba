import { committed } from './bell';
import type { Ctx } from './ctx';
import { pawnCap } from './pawns';
import { workingRelic } from './relics';
import { fieldTowardQuota } from './relicsLive';
import { LANES } from './world/map';
import type { CommandResult, PawnQuota } from './types';

/** Tempo the standing plan keeps back so gambits stay playable (Pawn Structure lets you choose). */
export const PLAN_RESERVE = 20;

/**
 * White's standing pawn plan (Orders at each Act break): pawns are fielded toward these lane
 * counts whenever Tempo is above the reserve. Pawn Structure does the same job with a chosen
 * reserve and auto pawns that cost 2 less, and takes over while it is held. The AI never sets
 * a plan, so AI-vs-AI matches are untouched.
 */
export function setPawnPlan(ctx: Ctx, quota: PawnQuota): CommandResult {
  if (LANES.some((l) => !Number.isInteger(quota[l]) || quota[l] < 0))
    return { ok: false, reason: 'set a pawn count for each lane' };
  const total = LANES.reduce((n, l) => n + quota[l], 0);
  const act = ctx.s.bell.stage === 'break' ? ctx.s.phase.n + 1 : ctx.s.phase.n;
  if (total > pawnCap(ctx, 'A', act)) return { ok: false, reason: 'more pawns than your cap' };
  ctx.s.pawnPlan = {
    quota: { top: quota.top, mid: quota.mid, bot: quota.bot },
    reserve: PLAN_RESERVE,
    auto: ctx.s.pawnPlan?.auto ?? true,
  };
  return { ok: true };
}

/** Turns the standing plan's automatic fielding on or off for the match; the counts stay. */
export function setPawnAuto(ctx: Ctx, auto: boolean): CommandResult {
  const plan = ctx.s.pawnPlan;
  if (plan) plan.auto = auto;
  else ctx.s.pawnPlan = { quota: { top: 0, mid: 0, bot: 0 }, reserve: PLAN_RESERVE, auto };
  return { ok: true };
}

/** Every 10 ticks: field one pawn toward White's plan (never during the bell's tolls and halt). */
export function tickPawnPlan(ctx: Ctx): void {
  const s = ctx.s;
  const plan = s.pawnPlan;
  if (!plan || !plan.auto || s.phase.kind !== 'live' || s.tick % 10 !== 0 || committed(ctx)) return;
  if (workingRelic(ctx, 'A', 'pawn_structure')) return;
  fieldTowardQuota(ctx, 'A', plan.quota, plan.reserve, 0);
}
