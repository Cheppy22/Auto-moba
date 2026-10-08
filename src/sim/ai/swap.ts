import type { Ctx } from '../ctx';
import type { HeroState, PlayTeam, Unit } from '../types';

export function isWary(ctx: Ctx, h: HeroState): boolean {
  const a = ctx.t.ai;
  const streak = h.lossStreak >= a.cautiousDeaths && ctx.s.tick - h.lastDeathTick < a.cautiousTicks;
  return streak || h.deaths - h.kills >= a.dominatedGap;
}

/** A hero that keeps dying without a kill trades lanes with the teammate who is doing best elsewhere. */
export function maybeSwapLane(ctx: Ctx, loser: Unit): void {
  const h = loser.hero;
  if (!h || h.isPlayer || loser.team === 'neutral') return;
  if (h.lossStreak < ctx.t.ai.swapAfterDeaths) return;
  const team = loser.team as PlayTeam;
  let best: Unit | null = null;
  let bestScore = -Infinity;
  for (const id of ctx.s.teams[team].heroIds) {
    const m = ctx.unit(id);
    if (!m?.hero || m.id === loser.id || m.hero.isPlayer || m.hero.lane === h.lane) continue;
    if (m.hero.lossStreak > 0) continue;
    const score = m.hero.kills + m.hero.assists * 0.5 - m.hero.deaths;
    if (score > bestScore) {
      bestScore = score;
      best = m;
    }
  }
  if (!best?.hero) return;
  const b = best.hero;
  const lane = h.lane;
  h.lane = b.lane;
  loser.lane = b.lane;
  b.lane = lane;
  best.lane = lane;
  const role = h.role;
  h.role = b.role;
  b.role = role;
  h.lossStreak = 0;
  b.goal = null;
  ctx.emit('laneSwap', { a: loser.id, b: best.id });
}
