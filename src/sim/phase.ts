import { freshTally } from './actReport';
import { openSlotsForPhase, rerollJungle } from './camps';
import { TPS } from './combat';
import type { Ctx } from './ctx';
import { evaluateCurseOffers } from './curses';
import { flushFights } from './feedback';
import { flushRuns } from './impact';
import { endAllEvents, scheduleEvents } from './events';
import { relocateKeeper } from './keeper';
import { scheduleObelisks } from './obelisks';
import { applyPressure } from './pressure';
import { dirtyAll } from './stats';

export const actTicks = (ctx: Ctx): number => Math.round(ctx.t.phaseSeconds * TPS);

/**
 * Starts Act n: opens jungle clearings, re-rolls new camps, switches on pressure
 * events, moves the Keeper, lets the AI answer any curse offer, and schedules obelisks and events.
 */
export function enterAct(ctx: Ctx, n: number): void {
  const s = ctx.s;
  s.phase = { kind: 'live', n, startTick: s.tick };
  s.actTally = freshTally(ctx.rec.seq);
  ctx.emit('phaseStart', { phase: n, kind: 'live' });
  const before = new Set(s.slots.filter((x) => x.open).map((x) => x.id));
  openSlotsForPhase(ctx);
  if (n >= 2)
    rerollJungle(ctx, new Set(s.slots.filter((x) => x.open && !before.has(x.id)).map((x) => x.id)));
  applyPressure(ctx);
  relocateKeeper(ctx);
  evaluateCurseOffers(ctx);
  if (n === 1) s.nextWaveTick = Math.round(ctx.t.waves.firstSec * TPS) + s.tick;
  scheduleObelisks(ctx);
  scheduleEvents(ctx);
  dirtyAll(ctx);
}

/** Closes the current Act's timed objectives; respawn timers and positions carry over. */
export function endAct(ctx: Ctx): void {
  const s = ctx.s;
  flushFights(ctx);
  flushRuns(ctx);
  for (const u of s.units) {
    if (u.kind === 'obelisk' && u.alive) {
      u.alive = false;
      ctx.emit('obeliskExpired', { node: u.obelisk!.nodeId });
    }
  }
  endAllEvents(ctx);
  ctx.emit('phaseEnd', { phase: s.phase.n, kind: 'live' });
}
