import type { Ctx } from '../ctx';
import type { PlayTeam, Unit } from '../types';

export function removeBoardClaim(ctx: Ctx, u: Unit): void {
  const h = u.hero;
  if (!h || !h.goal || u.team === 'neutral') return;
  const board = ctx.s.board[u.team as PlayTeam];
  board.claims[h.goal.key] = Math.max(0, (board.claims[h.goal.key] ?? 1) - 1);
  h.goal = null;
}
