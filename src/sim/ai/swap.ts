import type { Ctx } from '../ctx';
import { assignJunglers } from '../setup';
import type { HeroState, PlayTeam, Unit } from '../types';

export function isWary(ctx: Ctx, h: HeroState): boolean {
  const a = ctx.t.ai;
  const streak = h.lossStreak >= a.cautiousDeaths && ctx.s.tick - h.lastDeathTick < a.cautiousTicks;
  return streak || h.deaths - h.kills >= a.dominatedGap;
}

/** A hero that keeps dying without a kill trades lanes with the teammate who is doing best elsewhere. */
export function maybeSwapLane(ctx: Ctx, loser: Unit): void {
  const h = loser.hero;
  if (!h || loser.team === 'neutral') return;
  if (h.lossStreak < ctx.t.ai.swapAfterDeaths) return;
  const team = loser.team as PlayTeam;
  let best: Unit | null = null;
  let bestScore = -Infinity;
  for (const id of ctx.s.teams[team].heroIds) {
    const m = ctx.unit(id);
    if (!m?.hero || m.id === loser.id || m.hero.lane === h.lane) continue;
    if (m.hero.lossStreak > 0) continue;
    const score = m.hero.kills + m.hero.assists * 0.5 - m.hero.deaths;
    if (score > bestScore) {
      bestScore = score;
      best = m;
    }
  }
  if (!best?.hero) return;
  swapLanes(ctx, loser, best);
  h.lossStreak = 0;
}

/** Two pieces of one team trade lanes and roles; the 2/2/1 formation is unchanged. */
export function swapLanes(ctx: Ctx, a: Unit, b: Unit): void {
  const ha = a.hero!;
  const hb = b.hero!;
  const lane = ha.lane;
  ha.lane = hb.lane;
  a.lane = hb.lane;
  hb.lane = lane;
  b.lane = lane;
  const role = ha.role;
  ha.role = hb.role;
  hb.role = role;
  ha.goal = null;
  hb.goal = null;
  assignJunglers(ctx, a.team as PlayTeam);
  ctx.emit('laneSwap', { a: a.id, b: b.id });
}
