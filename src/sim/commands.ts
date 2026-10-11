import { PATHS } from './content/schema';
import { frozen, resumeFromBreak } from './bell';
import { aimRelic, autoRelic, declineRelic, draftOpen, pickRelic } from './draft';
import type { Ctx } from './ctx';
import { playGambit } from './gambits';
import { fieldPawn } from './pawns';
import { setPawnPlan } from './pawnPlan';
import { formationError } from './relics';
import { autoForks, chooseFork } from './ranks';
import { assignJunglers, validateSetup } from './setup';
import { LANES } from './world/map';
import type { Command, CommandResult, TeamSetup, Unit } from './types';

/** Starts the match from the setup board (White's entries replace the pre-filled default). */
type StartMatchFn = (ctx: Ctx, white: TeamSetup) => void;

export function applyCommand(ctx: Ctx, cmd: Command, startMatch: StartMatchFn): CommandResult {
  const r = run(ctx, cmd, startMatch);
  if (!r.ok) ctx.emit('commandRejected', { cmd: cmd.type, reason: r.reason ?? 'rejected' });
  return r;
}

/** White's piece by unit id (the player only commands White). */
function whitePiece(ctx: Ctx, heroId: number): Unit | null {
  const u = ctx.unit(heroId);
  return u && u.hero && u.team === 'A' ? u : null;
}

function run(ctx: Ctx, cmd: Command, startMatch: StartMatchFn): CommandResult {
  const s = ctx.s;
  const kind = s.phase.kind;
  if (kind === 'end') return { ok: false, reason: 'match is over' };
  if (cmd.type === 'setupTeam') {
    if (kind !== 'setup') return { ok: false, reason: 'setup is over' };
    const err = validateSetup(ctx.c, cmd);
    if (err) return { ok: false, reason: err };
    startMatch(ctx, {
      opening: cmd.opening,
      pieces: cmd.pieces.map((e) => ({ piece: e.piece, path: e.path, lane: e.lane })),
    });
    return { ok: true };
  }
  if (kind !== 'live') return { ok: false, reason: 'the match has not started' };
  if (frozen(ctx) && (cmd.type === 'playGambit' || cmd.type === 'fieldPawn'))
    return { ok: false, reason: 'play is stopped for the bell' };
  switch (cmd.type) {
    case 'resumeAct': {
      if (s.bell.stage !== 'break') return { ok: false, reason: 'no Act break to leave' };
      if (s.forks.length > 0) return { ok: false, reason: 'answer the fork first' };
      if (draftOpen(ctx)) return { ok: false, reason: 'take a relic first' };
      const lanes = formationError(ctx, 'A');
      if (lanes) return { ok: false, reason: lanes };
      resumeFromBreak(ctx);
      return { ok: true };
    }
    case 'pickRelic':
      return pickRelic(ctx, cmd.relicId, cmd, cmd.replace);
    case 'declineRelic':
      return declineRelic(ctx);
    case 'autoRelic':
      return autoRelic(ctx);
    case 'aimRelic':
      return aimRelic(ctx, cmd.relicId, cmd);
    case 'chooseFork':
      if (!whitePiece(ctx, cmd.heroId)) return { ok: false, reason: 'not one of your pieces' };
      return chooseFork(ctx, cmd.heroId, cmd.optionId);
    case 'autoForks':
      return autoForks(ctx);
    case 'playGambit':
      return playGambit(ctx, 'A', cmd.slot, {
        lane: cmd.lane,
        x: cmd.x,
        y: cmd.y,
        targetId: cmd.targetId,
      });
    case 'fieldPawn':
      return fieldPawn(ctx, 'A', cmd.lane);
    case 'setPawnPlan':
      return setPawnPlan(ctx, cmd.quota);
    case 'setLane': {
      const u = whitePiece(ctx, cmd.heroId);
      if (!u) return { ok: false, reason: 'not one of your pieces' };
      if (!LANES.includes(cmd.lane)) return { ok: false, reason: 'unknown lane' };
      const h = u.hero!;
      h.lane = cmd.lane;
      h.role = cmd.lane;
      u.lane = cmd.lane;
      h.goal = null;
      h.order = null;
      u.dirty = true;
      assignJunglers(ctx, 'A');
      ctx.emit('laneSet', { id: u.id, lane: cmd.lane });
      return { ok: true };
    }
    case 'setPath': {
      const u = whitePiece(ctx, cmd.heroId);
      if (!u) return { ok: false, reason: 'not one of your pieces' };
      if (!(PATHS as readonly string[]).includes(cmd.path))
        return { ok: false, reason: 'unknown build path' };
      u.hero!.path = cmd.path;
      ctx.emit('pathSet', { id: u.id, path: cmd.path });
      return { ok: true };
    }
  }
}
