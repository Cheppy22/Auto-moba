import { TPS } from './combat';
import { gambitEffect } from './content/loader';
import type { GambitDef } from './content/schema';
import { dist } from './core/math';
import type { Ctx } from './ctx';
import { laneAt } from './feedback';
import type { GambitTarget } from './gambits';
import { teamPiece } from './pieces';
import { cardCost } from './relics';
import type { CardMetrics, CardRun, LaneId, PlayTeam, Unit, ZoneState } from './types';

const MAX_SEEN = 40;
/** Breakthrough: how long its pawnlings are watched after their wave spawns. */
const WAVE_WATCH_SEC = 45;

const zero = (): CardMetrics => ({
  dealt: 0,
  structure: 0,
  taken: 0,
  bonus: 0,
  prevented: 0,
  healed: 0,
  kills: 0,
  deaths: 0,
  met: 0,
  drained: 0,
});

const param = (def: GambitDef, key: string, fallback: number): number =>
  def.params[key] ?? fallback;

/**
 * Starts measuring a card the moment it is played (before its effect runs, so an instant hit is
 * caught). Each card is read for what the sim can attribute to it: damage turned away by its
 * armor, healing it did, its multiplier's share of the damage, Bastion damage by the units it
 * covers, enemies that reached its wall. Everything else is shown as a duration and the piece
 * kills and losses beside it.
 */
export function startRun(ctx: Ctx, team: PlayTeam, def: GambitDef, t: GambitTarget): CardRun {
  const fb = ctx.s.feedback;
  const tick = ctx.s.tick;
  const effect = gambitEffect(def);
  const run: CardRun = {
    ...zero(),
    id: fb.nextRun++,
    team,
    cardId: def.id,
    cost: cardCost(ctx, team, def),
    startTick: tick,
    endTick: tick,
    scope: 'team',
    who: 'any',
    lane: t.lane ?? null,
    x: t.x ?? 0,
    y: t.y ?? 0,
    r: 0,
    ids: [],
    targetId: t.targetId ?? null,
    attr: { on: 'none', mul: 1, until: 0, after: 1 },
    armor: false,
    fell: false,
    seen: [],
  };
  const dur = def.durationSec;
  let sec = dur <= 1 ? Math.max(dur, ctx.t.feedback.impact.graceSec) : dur;
  const until = tick + Math.round(dur * TPS);
  const piece = (id: 'king' | 'queen' | 'rook' | 'knight'): number[] => {
    const u = teamPiece(ctx, team, id);
    return u ? [u.id] : [];
  };
  switch (effect) {
    case 'advance':
    case 'open_file':
      run.scope = 'lane';
      break;
    case 'hold_the_file':
      run.scope = 'lane';
      run.who = 'hero';
      run.armor = true;
      break;
    case 'regroup':
      run.scope = 'point';
      run.r = param(def, 'radius', 180) * ctx.world.k;
      break;
    case 'pawn_storm':
      run.scope = 'lane';
      run.who = 'minion';
      run.attr = { on: 'dealt', mul: param(def, 'damageMul', 1.5), until, after: 1 };
      break;
    case 'check':
      run.scope = 'ids';
      run.ids = t.targetId !== undefined ? [t.targetId] : [];
      run.attr = { on: 'taken', mul: param(def, 'damageTakenMul', 1.2), until, after: 1 };
      break;
    case 'castle':
      run.scope = 'ids';
      run.ids = [...piece('king'), ...piece('rook')];
      break;
    case 'queens_gambit': {
      const after = param(def, 'afterSec', 6);
      sec += after;
      run.scope = 'ids';
      run.ids = piece('queen');
      run.attr = {
        on: 'dealt',
        mul: param(def, 'damageMul', 1.4),
        until,
        after: param(def, 'afterMul', 0.8),
      };
      break;
    }
    case 'siege': {
      const rook = teamPiece(ctx, team, 'rook');
      run.scope = 'ids';
      run.ids = rook
        ? ctx.s.teams[team].heroIds.filter((id) => {
            const u = ctx.unit(id);
            return !!u?.alive && (u === rook || u.hero!.lane === rook.hero!.lane);
          })
        : [];
      run.attr = { on: 'structure', mul: param(def, 'structureMul', 1.3), until, after: 1 };
      break;
    }
    case 'sanctuary':
      run.scope = 'point';
      run.r = param(def, 'radius', 140) * ctx.world.k;
      break;
    case 'pawn_sacrifice':
      run.scope = 'ids';
      run.ids = t.targetId !== undefined ? [t.targetId] : [];
      break;
    case 'exchange':
      run.attr = { on: 'dealt', mul: param(def, 'damageMul', 1.15), until, after: 1 };
      break;
    case 'poisoned_pawn':
      run.scope = 'ids';
      run.ids = t.targetId !== undefined ? [t.targetId] : [];
      break;
    case 'barricade':
      run.scope = 'point';
      run.r = param(def, 'reach', 300);
      break;
    case 'outpost':
      run.scope = 'point';
      run.r = param(def, 'radius', 160) * ctx.world.k;
      run.armor = true;
      break;
    case 'fork':
      run.scope = 'ids';
      run.ids = [...piece('knight'), ...(t.targetId !== undefined ? [t.targetId] : [])];
      break;
    case 'breakthrough':
      // watched from the cast; the extra pawnlings are named when the wave spawns (`noteBreakthrough`)
      run.scope = 'ids';
      sec = ctx.t.waves.intervalSec + WAVE_WATCH_SEC;
      break;
    case 'pin':
      run.scope = 'ids';
      run.ids = t.targetId !== undefined ? [t.targetId] : [];
      break;
    case 'desperado':
      run.scope = 'ids';
      run.ids = t.targetId !== undefined ? [t.targetId] : [];
      run.attr = { on: 'dealt', mul: param(def, 'damageMul', 1.6), until, after: 1 };
      break;
    case 'fortify':
      run.scope = 'ids';
      run.ids = t.targetId !== undefined ? [t.targetId] : [];
      break;
  }
  run.endTick = tick + Math.round(sec * TPS);
  fb.runs.push(run);
  return run;
}

/** Ties a zone-based card (Sanctuary, Barricade) to its run, and a Barricade to its wall. */
export function bindZone(run: CardRun, z: ZoneState): void {
  z.runId = run.id;
  if (z.kind === 'barricade') {
    run.x = z.x;
    run.y = z.y;
    run.r = z.radius;
  }
}

function inScope(r: CardRun, u: Unit): boolean {
  if (r.who === 'hero' && u.kind !== 'hero') return false;
  if (r.who === 'minion' && (u.kind !== 'minion' || !!u.ev)) return false;
  switch (r.scope) {
    case 'team':
      return true;
    case 'ids':
      return r.ids.includes(u.id);
    case 'lane':
      return (u.hero ? u.hero.lane : u.kind === 'minion' ? u.lane : null) === r.lane;
    case 'point':
      return dist(u.x, u.y, r.x, r.y) <= r.r;
  }
}

const isStructure = (u: Unit): boolean => u.kind === 'tower' || u.kind === 'guardian';

/** Called for every point of damage dealt: credits the cards whose units it touches. */
export function noteDamage(
  ctx: Ctx,
  src: Unit | null,
  tgt: Unit,
  raw: number,
  dtype: string,
  amount: number,
  absorbed = 0,
): void {
  const runs = ctx.s.feedback.runs;
  const tick = ctx.s.tick;
  for (const r of runs) {
    const dealt = src !== null && src.team === r.team && inScope(r, src);
    if (dealt) {
      r.dealt += amount;
      if (isStructure(tgt)) r.structure += amount;
    }
    const took = tgt.team === r.team && inScope(r, tgt);
    // Fortify: what its shield soaked (the damage counted as "prevented")
    if (took && absorbed > 0 && r.cardId === 'fortify') r.prevented += absorbed;
    if (took) {
      r.taken += amount;
      if (r.armor && (dtype === 'blade' || dtype === 'soul'))
        r.prevented += turnedAway(r, tgt, raw, dtype);
    }
    const a = r.attr;
    if (a.on === 'none') continue;
    const hit =
      a.on === 'taken' ? r.ids.includes(tgt.id) : dealt && (a.on === 'dealt' || isStructure(tgt));
    const mul = tick < a.until ? a.mul : a.after;
    if (hit && mul !== 1) r.bonus += amount - amount / mul;
  }
}

/** Damage an armor or resist bonus from this card turned away on one hit. */
function turnedAway(r: CardRun, tgt: Unit, raw: number, dtype: string): number {
  const stat = dtype === 'blade' ? 'armor' : 'resist';
  const now = tgt.stats[stat];
  let prevented = 0;
  for (const m of tgt.mods) {
    if (m.stat !== stat || !m.id.startsWith(`gambit:${r.cardId}`)) continue;
    const without = m.kind === 'mul' ? now / m.value : now - m.value;
    const was = (raw * 100) / (100 + Math.max(-50, without));
    const is = (raw * 100) / (100 + Math.max(-50, now));
    prevented += Math.max(0, was - is) * tgt.stats.damageTakenMult;
  }
  return prevented;
}

export function noteHeal(ctx: Ctx, z: ZoneState, amount: number): void {
  if (z.runId === undefined) return;
  const r = ctx.s.feedback.runs.find((x) => x.id === z.runId);
  if (r) r.healed += amount;
}

/** Any unit died: a marked unit falling, and piece kills and losses beside a card's effect. */
export function noteDeath(ctx: Ctx, victim: Unit, killer: Unit | null): void {
  for (const r of ctx.s.feedback.runs) {
    if (r.targetId === victim.id) r.fell = true;
    if (victim.kind !== 'hero') continue;
    const near =
      r.scope === 'team' ||
      (r.scope === 'ids' &&
        (r.ids.includes(victim.id) || (!!killer && r.ids.includes(killer.id)))) ||
      (r.scope === 'lane' &&
        laneAt(ctx, victim.x, victim.y, ctx.t.feedback.fight.laneRadius) === r.lane) ||
      (r.scope === 'point' && dist(victim.x, victim.y, r.x, r.y) <= Math.max(r.r * 1.5, 350));
    if (!near) continue;
    if (victim.team === r.team) r.deaths++;
    else r.kills++;
  }
}

/** Breakthrough's wave has spawned: its extra pawnlings are the units this card is measured by. */
export function noteBreakthrough(ctx: Ctx, team: PlayTeam, lane: LaneId, ids: number[]): void {
  const r = ctx.s.feedback.runs.find(
    (x) => x.cardId === 'breakthrough' && x.team === team && x.lane === lane && x.ids.length === 0,
  );
  if (!r) return;
  r.ids = ids;
  r.met = ids.length;
  r.endTick = ctx.s.tick + WAVE_WATCH_SEC * TPS;
}

/** Poisoned Pawn took Tempo from the team that killed its pawn. */
export function noteDrain(ctx: Ctx, pawnId: number, amount: number): void {
  const r = ctx.s.feedback.runs.find((x) => x.cardId === 'poisoned_pawn' && x.targetId === pawnId);
  if (r) r.drained += amount;
}

function finish(ctx: Ctx, r: CardRun): void {
  const round = (v: number): number => Math.round(v);
  ctx.emit('gambitEnd', {
    team: r.team,
    cardId: r.cardId,
    cost: r.cost,
    ...(r.lane ? { lane: r.lane } : {}),
    x: round(r.x),
    y: round(r.y),
    startTick: r.startTick,
    endTick: Math.min(r.endTick, ctx.s.tick),
    fell: r.fell,
    dealt: round(r.dealt),
    structure: round(r.structure),
    taken: round(r.taken),
    bonus: round(r.bonus),
    prevented: round(r.prevented),
    healed: round(r.healed),
    kills: r.kills,
    deaths: r.deaths,
    met: r.met,
    drained: round(r.drained),
  });
}

/** Closes every card still being measured (the Act ends, or the match does). */
export function flushRuns(ctx: Ctx): void {
  const fb = ctx.s.feedback;
  for (const r of fb.runs) finish(ctx, r);
  fb.runs = [];
}

/** Once a tick: counts enemies that reach a Barricade, and closes cards whose time is up. */
export function tickRuns(ctx: Ctx): void {
  const fb = ctx.s.feedback;
  if (fb.runs.length === 0) return;
  const tick = ctx.s.tick;
  const near = ctx.t.feedback.impact.barricadeNear;
  let ended = false;
  for (const r of fb.runs) {
    if (r.cardId === 'barricade' && tick % 5 === 0 && r.seen.length < MAX_SEEN) {
      for (const u of ctx.grid.query(r.x, r.y, r.r + near)) {
        if (!u.alive || u.team === r.team || u.team === 'neutral' || u.ev) continue;
        if (u.kind !== 'minion' && u.kind !== 'hero') continue;
        if (!r.seen.includes(u.id) && r.seen.length < MAX_SEEN) r.seen.push(u.id);
      }
      r.met = r.seen.length;
    }
    if (tick >= r.endTick) {
      finish(ctx, r);
      ended = true;
    }
  }
  if (ended) fb.runs = fb.runs.filter((r) => tick < r.endTick);
}
