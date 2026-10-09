import { PATHS } from './content/schema';
import type { Ctx } from './ctx';
import { playGambit } from './gambits';
import { fieldPawn } from './pawns';
import { autoForks, chooseFork } from './ranks';
import { assignJunglers, validateSetup } from './setup';
import { LANES } from './world/map';
import type { Command, CommandResult, SetupEntry, Unit } from './types';

/** Starts the match from the setup board (White's entries replace the pre-filled default). */
export type StartMatchFn = (ctx: Ctx, white: SetupEntry[]) => void;

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
    const err = validateSetup(ctx.c, cmd.pieces);
    if (err) return { ok: false, reason: err };
    startMatch(
      ctx,
      cmd.pieces.map((e) => ({ piece: e.piece, style: e.style, path: e.path, lane: e.lane })),
    );
    return { ok: true };
  }
  if (kind !== 'live') return { ok: false, reason: 'the match has not started' };
  switch (cmd.type) {
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
