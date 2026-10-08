import { openSlotsForPhase, rerollJungle } from './camps';
import { TPS } from './combat';
import type { Ctx } from './ctx';
import { evaluateCurseOffers } from './curses';
import { endAllEvents, scheduleEvents } from './events';
import { relocateKeeper } from './keeper';
import { scheduleObelisks } from './obelisks';
import { applyPressure } from './pressure';
import { dirtyAll } from './stats';

export const actTicks = (ctx: Ctx): number => Math.round(ctx.t.phaseSeconds * TPS);

/**
 * Starts Act n inline (no pause): opens jungle clearings, re-rolls new camps, switches on pressure
 * events, moves the Keeper, lets the AI answer any curse offer, and schedules obelisks and events.
 */
export function enterAct(ctx: Ctx, n: number): void {
  const s = ctx.s;
  s.phase = { kind: 'live', n, startTick: s.tick };
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
  for (const u of s.units) {
    if (u.kind === 'obelisk' && u.alive) {
      u.alive = false;
      ctx.emit('obeliskExpired', { node: u.obelisk!.nodeId });
    }
  }
  endAllEvents(ctx);
  ctx.emit('phaseEnd', { phase: s.phase.n, kind: 'live' });
}

/** Act boundary check, run at the end of every tick. Past `maxPhases` Acts the match is a draw. */
export function tickActClock(ctx: Ctx): void {
  const s = ctx.s;
  if (s.phase.kind !== 'live' || s.tick - s.phase.startTick < actTicks(ctx)) return;
  endAct(ctx);
  if (s.phase.n >= ctx.t.maxPhases) {
    s.phase = { kind: 'end', n: s.phase.n, startTick: s.tick };
    ctx.emit('matchEnd', { winner: null, phase: s.phase.n });
    return;
  }
  enterAct(ctx, s.phase.n + 1);
}
