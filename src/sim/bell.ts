import { inCombat, TPS } from './combat';
import type { Ctx } from './ctx';
import { replanLanes } from './ai/replan';
import { buildActReport } from './actReport';
import { actTicks, endAct, enterAct } from './phase';
import type { BellStage, BellState, PlayTeam } from './types';

const PIECE_TEAMS: PlayTeam[] = ['A', 'B'];

export const freshBell = (): BellState => ({
  stage: 'none',
  since: 0,
  calm: 0,
  toll: 0,
  report: null,
});

/** The sim has stopped (halt and break): the gambit hand and pawns are inert. */
export const frozen = (ctx: Ctx): boolean =>
  ctx.s.bell.stage === 'halt' || ctx.s.bell.stage === 'break';

/** Once the tolls start the Act is over: no new pawnling wave spawns until the next Act. */
export const committed = (ctx: Ctx): boolean => ctx.s.bell.stage === 'tolling' || frozen(ctx);

function setStage(ctx: Ctx, stage: BellStage, toll?: number): void {
  const b = ctx.s.bell;
  b.stage = stage;
  b.since = ctx.s.tick;
  ctx.emit('bell', { stage, act: ctx.s.phase.n, ...(toll ? { toll } : {}) });
}

function boardCalm(ctx: Ctx): boolean {
  for (const team of PIECE_TEAMS) {
    for (const id of ctx.s.teams[team].heroIds) {
      const u = ctx.unit(id);
      if (u?.alive && inCombat(ctx.s.tick, u)) return false;
    }
  }
  return true;
}

/** The Act ends: the report is cut, both AIs re-plan, and the sheet waits (or resumes at once). */
function enterBreak(ctx: Ctx): void {
  const s = ctx.s;
  endAct(ctx);
  const report = buildActReport(ctx);
  s.bell.report = report;
  replanLanes(ctx, 'B', report);
  if (!ctx.pauseForBreak) {
    replanLanes(ctx, 'A', report);
    resumeFromBreak(ctx);
    return;
  }
  setStage(ctx, 'break');
}

/** Starts the next Act from the break; the next pawnling wave follows right after. */
export function resumeFromBreak(ctx: Ctx): void {
  const s = ctx.s;
  const next = s.phase.n + 1;
  s.bell = freshBell();
  enterAct(ctx, next);
  s.nextWaveTick = s.tick + Math.round(ctx.t.bell.resumeWaveSec * TPS);
}

/**
 * Act boundary check, run at the end of every tick. At 0:00 the board waits for calm, tolls three
 * times, halts and breaks. Past `maxPhases` Acts the match is a draw (no break).
 */
export function tickBell(ctx: Ctx): void {
  const s = ctx.s;
  if (s.phase.kind !== 'live') return;
  const b = s.bell;
  const cfg = ctx.t.bell;
  switch (b.stage) {
    case 'none':
      if (s.tick - s.phase.startTick < actTicks(ctx)) return;
      if (s.phase.n >= ctx.t.maxPhases) {
        endAct(ctx);
        s.phase = { kind: 'end', n: s.phase.n, startTick: s.tick };
        ctx.emit('matchEnd', { winner: null, phase: s.phase.n });
        return;
      }
      b.calm = 0;
      setStage(ctx, 'pending');
      return;
    case 'pending':
      b.calm = boardCalm(ctx) ? b.calm + 1 : 0;
      if (
        b.calm >= Math.round(cfg.calmSec * TPS) ||
        s.tick - b.since >= Math.round(cfg.capSec * TPS)
      ) {
        b.toll = 1;
        setStage(ctx, 'tolling', 1);
      }
      return;
    case 'tolling': {
      const every = Math.max(1, Math.round(cfg.tollSec * TPS));
      const k = Math.floor((s.tick - b.since) / every);
      if (k >= cfg.tolls) {
        setStage(ctx, 'halt', b.toll);
      } else if (k + 1 > b.toll) {
        b.toll = k + 1;
        ctx.emit('bell', { stage: 'tolling', act: s.phase.n, toll: b.toll });
      }
      return;
    }
    case 'halt':
      if (s.tick - b.since >= cfg.haltTicks) enterBreak(ctx);
      return;
    case 'break':
      return;
  }
}

/** The app's step-rate multiplier: 1 normally, easing out to 0 across the halt. */
export function bellTimeScale(ctx: Ctx): number {
  const b = ctx.s.bell;
  if (b.stage === 'break') return 0;
  if (b.stage !== 'halt') return 1;
  const p = Math.min(1, (ctx.s.tick - b.since) / ctx.t.bell.haltTicks);
  return Math.sqrt(1 - p);
}
