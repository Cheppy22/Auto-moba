// Gold: each piece earns its own (Ranks follow lifetime gold) and spends it only at the Act break,
// on Technique rerolls and upgrades (`builds.ts`).
import type { Ctx } from './ctx';
import { checkRank } from './ranks';
import type { PlayTeam, Unit } from './types';

export function giveGold(ctx: Ctx, u: Unit, amount: number, source: string, silent = false): void {
  const h = u.hero;
  if (!h || amount <= 0) return;
  const real = Math.round(amount * u.stats.incomeMult);
  h.gold += real;
  h.goldEarned += real;
  if (!silent) ctx.emit('gold', { id: u.id, amount: real, source });
  checkRank(ctx, u);
}

/** How far a side is ahead: its pieces' lifetime gold earned (spending never lowers it). */
export function teamGoldEarned(ctx: Ctx, team: PlayTeam): number {
  let sum = 0;
  for (const id of ctx.s.teams[team].heroIds) {
    const u = ctx.unit(id);
    if (u?.hero) sum += u.hero.goldEarned;
  }
  return sum;
}
