import { TPS } from './combat';
import type { Ctx } from './ctx';
import type { Unit } from './types';

export function startRecall(ctx: Ctx, u: Unit, dest: 'base' | 'keeper'): boolean {
  const h = u.hero;
  if (!h || !u.alive || h.recall) return false;
  const sec = dest === 'base' ? ctx.t.recall.baseSec : ctx.t.recall.keeperSec;
  h.recall = { startTick: ctx.s.tick, endTick: ctx.s.tick + Math.round(sec * TPS), dest };
  u.path = [];
  ctx.emit('recall', { id: u.id, dest, stage: 'start' });
  return true;
}

export function tickRecall(ctx: Ctx, u: Unit): boolean {
  const h = u.hero;
  if (!h || !h.recall) return false;
  if (u.lastDamagedTick >= h.recall.startTick) {
    ctx.emit('recall', { id: u.id, dest: h.recall.dest, stage: 'interrupted' });
    h.recall = null;
    return false;
  }
  if (ctx.s.tick >= h.recall.endTick) {
    const dest = h.recall.dest;
    if (dest === 'base' && u.team !== 'neutral') {
      const b = ctx.world.basePos[u.team];
      u.x = b.x + (u.team === 'A' ? 16 : -16);
      u.y = b.y + (u.team === 'A' ? -16 : 16);
    } else {
      const k = ctx.unit(ctx.s.keeper.unitId);
      if (k) {
        u.x = k.x + 18;
        u.y = k.y + 12;
      }
    }
    u.px = u.x;
    u.py = u.y;
    u.path = [];
    h.goal = null;
    ctx.emit('recall', { id: u.id, dest, stage: 'done' });
    h.recall = null;
    return false;
  }
  return true;
}
