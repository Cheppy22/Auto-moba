import { TPS } from './combat';
import { dealDamage, healUnit, stunUnit } from './combat';
import { gambitEffect } from './content/loader';
import { SCHOOLS, type GambitDef, type LaneId, type School } from './content/schema';
import { dist } from './core/math';
import { weightedPick } from './core/rng';
import { hpPct, isTargetable, type Ctx } from './ctx';
import { enemyTowerTarget } from './ai/lanes';
import { bindZone, noteClock, noteDrain, noteHeal, startRun } from './impact';
import { pawnsAlive } from './pawns';
import { teamPiece } from './pieces';
import {
  LANE_SPEED_TAG,
  boundCards,
  cardCost,
  handSize,
  refillSec,
  tempoCap,
  tempoRate,
} from './relics';
import { addMod } from './stats';
import { LANES, lanePoint, seatLanes } from './world/map';
import { confine, shapeDist, walkable, type WalkShape } from './world/terrain';
import type {
  CommandResult,
  GambitOrder,
  HandSlot,
  Modifier,
  PlayTeam,
  Unit,
  ZoneState,
} from './types';
import { other } from './types';
import { PLAY_TEAMS } from './names';
import { booksOf } from './runRules';
import { aiTempoTurn } from './pawnPlan';

/** The mod that marks a Poisoned Pawn (a no-op multiplier; its presence is the mark). */
export const POISON_MOD = 'gambit:poisoned_pawn';
/** The mod Desperado puts on a piece (its damage boost; its presence is the mark). */
export const DESPERADO_MOD = 'gambit:desperado:b';

export interface GambitTarget {
  lane?: LaneId;
  x?: number;
  y?: number;
  targetId?: number;
  /** Pin: the enemy piece behind the pinned one (set when the target is checked). */
  behindId?: number;
}

const p = (def: GambitDef, key: string, fallback: number): number => def.params[key] ?? fallback;

export function addTempo(ctx: Ctx, team: PlayTeam, amount: number): void {
  if (amount <= 0) return;
  amount = slowedIncome(ctx, team, amount);
  ctx.s.actTally.tempo[team] += amount;
  ctx.s.tempo[team] = Math.min(tempoCap(ctx, team), ctx.s.tempo[team] + amount);
}

function alivePieces(ctx: Ctx, team: PlayTeam): Unit[] {
  const out: Unit[] = [];
  for (const id of ctx.s.teams[team].heroIds) {
    const u = ctx.unit(id);
    if (u?.alive) out.push(u);
  }
  return out;
}

// ---------------------------------------------------------------- hand

/** A card's weight in a side's draw: the Opening's two schools come up twice as often. */
export function drawWeight(ctx: Ctx, team: PlayTeam): (g: GambitDef) => number {
  const favoured = ctx.c.openingById.get(ctx.s.opening[team])?.schools ?? [];
  return (g) => g.weight * (favoured.includes(g.school) ? 2 : 1);
}

/** Draws a card for a side; `only` limits the draw to those schools (Opening Book). */
function drawCard(ctx: Ctx, team: PlayTeam, only?: readonly School[]): string | null {
  const held = new Set(ctx.s.hands[team].map((h) => h.cardId).filter((x) => x !== null));
  const bound = boundCards(ctx, team);
  const deck = ctx.c.gambits.filter((g) => {
    if (g.weight <= 0 || bound.includes(g.id)) return false;
    if (only && only.length > 0 && !only.includes(g.school)) return false;
    if (g.piece === null) return true;
    return !!teamPiece(ctx, team, g.piece)?.alive;
  });
  const fresh = deck.filter((g) => !held.has(g.id));
  const pool = fresh.length > 0 ? fresh : deck;
  if (pool.length === 0) return null;
  const weight = drawWeight(ctx, team);
  return weightedPick(ctx.s.rng, 'gambit', pool, weight).id;
}

function deal(ctx: Ctx, team: PlayTeam, slot: number, only?: readonly School[]): void {
  const h = ctx.s.hands[team][slot];
  if (h.discarded !== undefined) delete h.discarded;
  if (h.opening) delete h.opening;
  if (h.book) delete h.book;
  h.cardId = drawCard(ctx, team, only);
  h.expireTick = ctx.s.tick + Math.round(ctx.t.gambits.expireSec * TPS);
  h.refillTick = h.cardId === null ? ctx.s.tick + TPS : null;
}

/** A card a Standing Order now keeps always on leaves the hand: its slot is dealt again. */
export function dropBoundCards(ctx: Ctx, team: PlayTeam): void {
  const bound = boundCards(ctx, team);
  ctx.s.hands[team].forEach((h, i) => {
    if (h.cardId !== null && bound.includes(h.cardId)) deal(ctx, team, i);
  });
}

/** Quiet Move shrinks the hand to two cards; losing it deals the third back. */
export function syncHands(ctx: Ctx, team: PlayTeam): void {
  const hand = ctx.s.hands[team];
  const want = handSize(ctx, team);
  while (hand.length > want) hand.pop();
  while (hand.length < want) {
    hand.push({ cardId: null, expireTick: 0, refillTick: null });
    deal(ctx, team, hand.length - 1);
  }
}

/**
 * The first hand. An Opening's card goes in slot 0 and a run's book move in the next slot (slot 0
 * for the Italian Game, which has no Opening card); both stay until played or until Act 1 ends.
 * The Italian Game deals its other cards from schools not yet in the hand, so it still holds three
 * different schools. A book move that is the Opening's own card, or one a Standing Order keeps
 * always on, is not dealt twice.
 */
export function initHands(ctx: Ctx): void {
  for (const team of PLAY_TEAMS) {
    const hand: HandSlot[] = [];
    ctx.s.hands[team] = hand;
    const opening = ctx.c.openingById.get(ctx.s.opening[team]);
    const card = opening?.openingCard ? ctx.c.gambitById.get(opening.openingCard) : undefined;
    const bound = boundCards(ctx, team);
    const kept: { id: string; book: boolean }[] = [];
    if (card && !bound.includes(card.id)) kept.push({ id: card.id, book: false });
    for (const id of booksOf(ctx, team))
      if (!bound.includes(id) && !kept.some((x) => x.id === id)) kept.push({ id, book: true });
    for (let i = 0; i < ctx.t.gambits.handSize; i++) {
      hand.push({ cardId: null, expireTick: 0, refillTick: null });
      if (i < kept.length) {
        const h = hand[i];
        h.cardId = kept[i].id;
        h.opening = true;
        if (kept[i].book) h.book = true;
        h.expireTick = Number.MAX_SAFE_INTEGER;
        continue;
      }
      if (opening && !card) {
        // no opening card: three different schools, so the first hand is never one-sided
        const held = new Set(
          hand.flatMap((h) => (h.cardId ? [ctx.c.gambitById.get(h.cardId)!.school] : [])),
        );
        deal(
          ctx,
          team,
          i,
          SCHOOLS.filter((sc) => !held.has(sc)),
        );
      } else deal(ctx, team, i);
    }
  }
}

/** The tick a held card was dealt (the opening card, held since the start, counts from 0). */
const dealtTick = (ctx: Ctx, h: HandSlot): number =>
  h.opening ? 0 : h.expireTick - Math.round(ctx.t.gambits.expireSec * TPS);

/** Why a held card cannot be played right now ('' when it can). */
export function cardBlock(ctx: Ctx, team: PlayTeam, slot: number): string {
  const h = ctx.s.hands[team][slot];
  if (!h || h.cardId === null) return 'no card in that slot';
  const def = ctx.c.gambitById.get(h.cardId)!;
  if (def.piece) {
    const u = teamPiece(ctx, team, def.piece);
    if (!u?.alive) return `${ctx.c.pieceById.get(def.piece)!.name} is down`;
  }
  if (ctx.s.tempo[team] < cardCost(ctx, team, def)) return 'not enough Tempo';
  const eff = gambitEffect(def);
  if (eff === 'castle' && !teamPiece(ctx, team, 'rook')?.alive) return 'Rook is down';
  if (eff === 'pawn_sacrifice' && pawnsAlive(ctx, team) === 0) return 'no pawn to sacrifice';
  if (eff === 'desperado' && !desperadoPieces(ctx, team, def).length)
    return `none of your pieces is under ${Math.round(p(def, 'hpMax', 0.4) * 100)}% health`;
  if (eff === 'zugzwang' && dearestSlot(ctx, other(team), def) < 0)
    return `no enemy card of ${p(def, 'minCost', 17)}+ Tempo in hand`;
  return '';
}

// ---------------------------------------------------------------- effects

function timedMod(
  ctx: Ctx,
  u: Unit,
  id: string,
  stat: Modifier['stat'],
  value: number,
  sec: number,
  tags: string[] = [],
): void {
  addMod(ctx, u, {
    id,
    stat,
    kind: 'mul',
    value,
    source: id,
    tags,
    expiresTick: ctx.s.tick + Math.round(sec * TPS),
  });
}

export function setOrder(ctx: Ctx, u: Unit, order: GambitOrder): void {
  const h = u.hero!;
  h.order = order;
  h.goalSetTick = -999;
  if (h.recall) h.recall = null;
}

function laneUnits(ctx: Ctx, team: PlayTeam, lane: LaneId, pieces: boolean): Unit[] {
  const out: Unit[] = [];
  for (const u of ctx.s.units) {
    if (!u.alive || u.team !== team) continue;
    if (pieces && u.hero && u.hero.lane === lane) out.push(u);
    if (!pieces && u.kind === 'minion' && !u.ev && u.lane === lane) out.push(u);
  }
  return out;
}

/** Your front-most elite pawn in a lane: the one nearest the enemy's front Bastion. */
function frontPawn(ctx: Ctx, team: PlayTeam, lane: LaneId): Unit | null {
  const aim = enemyTowerTarget(ctx, team, lane) ?? ctx.guardians[other(team)];
  let best: Unit | null = null;
  let bestD = Infinity;
  for (const u of ctx.s.units) {
    if (!u.alive || !u.pawn || u.team !== team || u.lane !== lane) continue;
    const d = aim ? dist(u.x, u.y, aim.x, aim.y) : 0;
    if (d < bestD) {
      bestD = d;
      best = u;
    }
  }
  return best;
}

/** Pawn Sacrifice: the pawn that goes and the enemy Bastion in that lane nearest to it. */
function sacrificePlan(
  ctx: Ctx,
  team: PlayTeam,
  lane: LaneId,
): { pawn: Unit; tower: Unit } | string {
  const pawn = frontPawn(ctx, team, lane);
  if (!pawn) return 'no elite pawn of yours in that lane';
  let tower: Unit | null = null;
  let bestD = Infinity;
  for (const tw of ctx.towers[other(team)][lane]) {
    if (!tw?.alive) continue;
    const d = dist(pawn.x, pawn.y, tw.x, tw.y);
    if (d < bestD) {
      bestD = d;
      tower = tw;
    }
  }
  if (!tower) return 'no enemy Bastion left in that lane';
  return { pawn, tower };
}

// ---- wave 3 helpers (Breakthrough, Pin, Desperado, Fortify)

/** Your pieces Desperado can lift: alive and under the card's health line. */
function desperadoPieces(ctx: Ctx, team: PlayTeam, def: GambitDef): Unit[] {
  return alivePieces(ctx, team).filter((u) => hpPct(u) < p(def, 'hpMax', 0.4));
}

/** Your front Bastion in a lane (outer, then inner), or the Throne once none stand. */
function ownFront(ctx: Ctx, team: PlayTeam, lane: LaneId): Unit | null {
  const [o, i] = ctx.towers[team][lane];
  const st = o?.alive ? o : i?.alive ? i : ctx.guardians[team];
  return st?.alive ? st : null;
}

/** Pin: the enemy piece nearest behind the pinned one (toward its own base), within reach. */
function pinBehind(ctx: Ctx, def: GambitDef, pinned: Unit): Unit | null {
  if (pinned.team === 'neutral') return null;
  const home = ctx.world.basePos[pinned.team];
  const own = dist(pinned.x, pinned.y, home.x, home.y);
  const reach = p(def, 'behindR', 300) * ctx.world.k;
  let best: Unit | null = null;
  let bestD = Infinity;
  for (const u of alivePieces(ctx, pinned.team)) {
    if (u === pinned || dist(u.x, u.y, home.x, home.y) >= own) continue;
    const d = dist(u.x, u.y, pinned.x, pinned.y);
    if (d <= reach && d < bestD) {
      bestD = d;
      best = u;
    }
  }
  return best;
}

const isPinned = (ctx: Ctx, u: Unit): boolean =>
  u.rootUntil !== undefined && u.rootUntil > ctx.s.tick;

/** Breakthrough: the extra melee pawnlings a side's wave in this lane carries, taken once. */
export function takeBreakthrough(ctx: Ctx, team: PlayTeam, lane: LaneId): number {
  const n = ctx.s.breakthrough[team][lane] ?? 0;
  if (n > 0) delete ctx.s.breakthrough[team][lane];
  return n;
}

const WALLED: readonly WalkShape['kind'][] = ['lane', 'port', 'road', 'sally'];

/** The wall a Barricade raises: across the gate path or lane corridor nearest to the point. */
function wallFor(
  ctx: Ctx,
  def: GambitDef,
  x: number,
  y: number,
): NonNullable<ZoneState['wall']> | null {
  const k = ctx.world.k;
  let best: WalkShape | null = null;
  let bestD = Infinity;
  for (const sh of ctx.world.terrain.shapes) {
    // corridors a wall can seal: lanes (and the Long Board's ramps), gates, River Road, Sally Paths
    if (!WALLED.includes(sh.kind) || (sh.ax === sh.bx && sh.ay === sh.by)) continue;
    if (sh.slot !== null && !ctx.open.has(sh.slot)) continue;
    const d = shapeDist(sh, x, y) + sh.r;
    if (d < bestD) {
      bestD = d;
      best = sh;
    }
  }
  if (!best || bestD > p(def, 'reach', 300) * k) return null;
  const dx = best.bx - best.ax;
  const dy = best.by - best.ay;
  const l2 = dx * dx + dy * dy;
  if (l2 === 0) return null;
  const lo = best.kind === 'port' ? 0.25 : 0;
  const hi = best.kind === 'port' ? 0.75 : 1;
  const f = Math.max(lo, Math.min(hi, ((x - best.ax) * dx + (y - best.ay) * dy) / l2));
  const cx = best.ax + dx * f;
  const cy = best.ay + dy * f;
  const l = Math.sqrt(l2);
  const nx = -dy / l;
  const ny = dx / l;
  const half = best.r + p(def, 'margin', 12);
  return {
    ax: cx - nx * half,
    ay: cy - ny * half,
    bx: cx + nx * half,
    by: cy + ny * half,
    r: p(def, 'thickness', 14),
  };
}

/** Keeps the terrain's walls in step with the Barricades that stand. */
function syncWalls(ctx: Ctx): void {
  ctx.world.terrain.blocks = ctx.s.zones.flatMap((z) => (z.wall ? [z.wall] : []));
}

function validTarget(
  ctx: Ctx,
  team: PlayTeam,
  def: GambitDef,
  t: GambitTarget,
): string | GambitTarget {
  switch (def.target) {
    case 'lane': {
      if (!t.lane || !LANES.includes(t.lane)) return 'pick a lane';
      const eff = gambitEffect(def);
      if (eff === 'pawn_sacrifice') {
        const plan = sacrificePlan(ctx, team, t.lane);
        return typeof plan === 'string' ? plan : { lane: t.lane, targetId: plan.pawn.id };
      }
      if (eff === 'poisoned_pawn') {
        const pawn = frontPawn(ctx, team, t.lane);
        return pawn ? { lane: t.lane, targetId: pawn.id } : 'no elite pawn of yours in that lane';
      }
      if (eff === 'breakthrough' && ctx.s.breakthrough[team][t.lane])
        return 'a Breakthrough already waits in that lane';
      if (eff === 'fortify') {
        const st = ownFront(ctx, team, t.lane);
        if (!st) return 'no Bastion of yours stands in that lane';
        if (st.shields.length > 0) return 'that Bastion already has a shield';
        return { lane: t.lane, targetId: st.id };
      }
      return { lane: t.lane };
    }
    case 'point': {
      const { width, length } = ctx.world;
      if (t.x === undefined || t.y === undefined || !Number.isFinite(t.x) || !Number.isFinite(t.y))
        return 'pick a point';
      if (t.x < 0 || t.y < 0 || t.x > width || t.y > length) return 'point is off the map';
      const q = walkable(ctx.world.terrain, ctx.open, t.x, t.y)
        ? { x: t.x, y: t.y }
        : confine(ctx.world.terrain, ctx.open, t.x, t.y);
      const eff = gambitEffect(def);
      if (eff === 'barricade') {
        const w = wallFor(ctx, def, q.x, q.y);
        if (!w) return 'no gate path or crossing near that point';
        return { x: (w.ax + w.bx) / 2, y: (w.ay + w.by) / 2 };
      }
      if (eff === 'outpost') {
        const reach = p(def, 'reach', 260) * ctx.world.k;
        const mine = countNear(
          ctx,
          team,
          q.x,
          q.y,
          reach,
          (u) => u.kind === 'hero' || u.kind === 'minion',
        );
        if (mine === 0) return 'none of your units are near that point';
      }
      return { x: q.x, y: q.y };
    }
    case 'ally': {
      const u = t.targetId !== undefined ? ctx.unit(t.targetId) : undefined;
      if (!u || !u.alive || u.team !== team || !u.hero) return 'pick one of your pieces';
      if (gambitEffect(def) === 'desperado' && hpPct(u) >= p(def, 'hpMax', 0.4))
        return `that piece is over ${Math.round(p(def, 'hpMax', 0.4) * 100)}% health`;
      return { targetId: u.id };
    }
    case 'enemy': {
      const u = t.targetId !== undefined ? ctx.unit(t.targetId) : undefined;
      if (!u || !u.alive || u.team !== other(team)) return 'pick an enemy';
      const eff = gambitEffect(def);
      if (eff === 'siege') {
        if (u.kind !== 'tower' && u.kind !== 'guardian') return 'pick a Bastion or Throne';
      } else if (!u.hero) return 'pick an enemy piece';
      if (eff === 'fork') {
        const k = teamPiece(ctx, team, 'knight')!;
        if (dist(k.x, k.y, u.x, u.y) > p(def, 'reach', 975)) return 'out of the Knight’s reach';
      }
      if (eff === 'pin') {
        const behind = pinBehind(ctx, def, u);
        return behind ? { targetId: u.id, behindId: behind.id } : { targetId: u.id };
      }
      return { targetId: u.id };
    }
    case 'none':
      return {};
  }
}

function applyCard(ctx: Ctx, team: PlayTeam, def: GambitDef, t: GambitTarget): ClockNote {
  const s = ctx.s;
  const dur = def.durationSec;
  const until = s.tick + Math.round(dur * TPS);
  const tag = `gambit:${def.id}`;
  switch (gambitEffect(def)) {
    case 'advance': {
      const lane = t.lane!;
      for (const u of laneUnits(ctx, team, lane, true)) {
        setOrder(ctx, u, { kind: 'push', lane, x: u.x, y: u.y, targetId: null, untilTick: until });
        timedMod(ctx, u, tag, 'moveSpeed', p(def, 'moveSpeedMul', 1.1), dur, [LANE_SPEED_TAG]);
      }
      for (const u of laneUnits(ctx, team, lane, false))
        timedMod(ctx, u, tag, 'moveSpeed', p(def, 'moveSpeedMul', 1.1), dur, [LANE_SPEED_TAG]);
      break;
    }
    case 'hold_the_file': {
      const lane = t.lane!;
      for (const u of laneUnits(ctx, team, lane, true)) {
        setOrder(ctx, u, {
          kind: 'defend',
          lane,
          x: u.x,
          y: u.y,
          targetId: null,
          untilTick: until,
        });
        timedMod(ctx, u, `${tag}:a`, 'armor', p(def, 'armorMul', 1.15), dur);
        timedMod(ctx, u, `${tag}:r`, 'resist', p(def, 'resistMul', 1.15), dur);
      }
      break;
    }
    case 'regroup':
      for (const u of alivePieces(ctx, team))
        setOrder(ctx, u, {
          kind: 'gather',
          lane: null,
          x: t.x!,
          y: t.y!,
          targetId: null,
          untilTick: until,
        });
      break;
    case 'pawn_storm': {
      for (const u of laneUnits(ctx, team, t.lane!, false)) {
        timedMod(ctx, u, `${tag}:d`, 'bladeDmg', p(def, 'damageMul', 1.5), dur);
        timedMod(ctx, u, `${tag}:m`, 'moveSpeed', p(def, 'moveSpeedMul', 1.5), dur);
      }
      break;
    }
    case 'check': {
      const u = ctx.unit(t.targetId!)!;
      timedMod(ctx, u, 'gambit:check', 'damageTakenMult', p(def, 'damageTakenMul', 1.2), dur);
      break;
    }
    case 'castle': {
      const k = teamPiece(ctx, team, 'king')!;
      const r = teamPiece(ctx, team, 'rook')!;
      const kx = k.x;
      const ky = k.y;
      for (const [u, x, y] of [
        [k, r.x, r.y],
        [r, kx, ky],
      ] as [Unit, number, number][]) {
        u.x = x;
        u.y = y;
        u.px = x;
        u.py = y;
        u.path = [];
        u.pathI = 0;
        u.detour = null;
        u.targetId = null;
        u.hero!.recall = null;
        u.hero!.goal = null;
      }
      break;
    }
    case 'queens_gambit': {
      const q = teamPiece(ctx, team, 'queen')!;
      const up = p(def, 'damageMul', 1.4);
      timedMod(ctx, q, `${tag}:b`, 'bladeDmg', up, dur);
      timedMod(ctx, q, `${tag}:s`, 'soulPower', up, dur);
      const after = p(def, 'afterMul', 0.8);
      const afterTicks = Math.round(p(def, 'afterSec', 6) * TPS);
      for (const stat of ['bladeDmg', 'soulPower'] as const)
        s.timedMods.push({
          atTick: until,
          unitId: q.id,
          mod: {
            id: `${tag}:after:${stat}`,
            stat,
            kind: 'mul',
            value: after,
            source: tag,
            tags: [],
            expiresTick: until + afterTicks,
          },
        });
      break;
    }
    case 'siege': {
      const rook = teamPiece(ctx, team, 'rook')!;
      const st = ctx.unit(t.targetId!)!;
      const lane: LaneId = st.tower ? st.tower.lane : (rook.hero!.lane ?? 'mid');
      const crew = alivePieces(ctx, team).filter(
        (u) => u === rook || u.hero!.lane === rook.hero!.lane,
      );
      for (const u of crew) {
        setOrder(ctx, u, {
          kind: 'push',
          lane,
          x: st.x,
          y: st.y,
          targetId: st.id,
          untilTick: until,
        });
        u.hero!.structMul = { value: p(def, 'structureMul', 1.3), untilTick: until };
      }
      break;
    }
    case 'sanctuary':
      s.zones.push({
        kind: 'sanctuary',
        team,
        cardId: def.id,
        x: t.x!,
        y: t.y!,
        radius: p(def, 'radius', 140),
        endTick: until,
      });
      break;
    case 'pawn_sacrifice': {
      const plan = sacrificePlan(ctx, team, t.lane!);
      if (typeof plan === 'string') break;
      const { pawn, tower } = plan;
      // The pawn spends itself: one hit of twice its health, past the structure damage cap.
      dealDamage(ctx, pawn, tower, pawn.stats.maxHp * p(def, 'hpMul', 2), 'true', tag, true);
      pawn.alive = false;
      pawn.hp = 0;
      break;
    }
    case 'exchange': {
      const u = ctx.unit(t.targetId!)!;
      u.hp = Math.max(1, u.hp * (1 - p(def, 'healthLoss', 0.25)));
      s.teamDamage[team] = { value: p(def, 'damageMul', 1.15), untilTick: until };
      break;
    }
    case 'poisoned_pawn':
      timedMod(ctx, ctx.unit(t.targetId!)!, POISON_MOD, 'damageTakenMult', 1, dur);
      break;
    case 'barricade': {
      const wall = wallFor(ctx, def, t.x!, t.y!);
      if (!wall) break;
      s.zones.push({
        kind: 'barricade',
        team,
        cardId: def.id,
        x: (wall.ax + wall.bx) / 2,
        y: (wall.ay + wall.by) / 2,
        radius: Math.hypot(wall.bx - wall.ax, wall.by - wall.ay) / 2,
        wall,
        endTick: until,
      });
      syncWalls(ctx);
      break;
    }
    case 'open_file': {
      const lane = t.lane!;
      const mid = lanePoint(ctx.world.lanes[lane], 0.5);
      s.zones.push({
        kind: 'openFile',
        team,
        cardId: def.id,
        lane,
        x: mid.x,
        y: mid.y,
        radius: 0,
        endTick: until,
      });
      break;
    }
    case 'outpost':
      s.zones.push({
        kind: 'outpost',
        team,
        cardId: def.id,
        x: t.x!,
        y: t.y!,
        radius: p(def, 'radius', 160) * ctx.world.k,
        endTick: until,
      });
      break;
    case 'fork': {
      const k = teamPiece(ctx, team, 'knight')!;
      const foe = ctx.unit(t.targetId!)!;
      const dx = k.x - foe.x;
      const dy = k.y - foe.y;
      const d = Math.sqrt(dx * dx + dy * dy) || 1;
      const off = Math.min(d, Math.max(10, k.stats.range * 0.6));
      let x = foe.x + (dx / d) * off;
      let y = foe.y + (dy / d) * off;
      if (!walkable(ctx.world.terrain, ctx.open, x, y)) {
        const q = confine(ctx.world.terrain, ctx.open, x, y);
        x = q.x;
        y = q.y;
      }
      k.x = x;
      k.y = y;
      k.px = x;
      k.py = y;
      k.path = [];
      k.detour = null;
      k.targetId = foe.id;
      k.hero!.recall = null;
      stunUnit(ctx, foe, p(def, 'stunSec', 1));
      break;
    }
    case 'breakthrough':
      s.breakthrough[team][t.lane!] = Math.round(p(def, 'extraMelee', 3));
      break;
    case 'pin': {
      const foe = ctx.unit(t.targetId!)!;
      foe.rootUntil = Math.max(foe.rootUntil ?? 0, s.tick + Math.round(p(def, 'rootSec', 3) * TPS));
      foe.path = [];
      foe.detour = null;
      if (foe.hero?.recall) foe.hero.recall = null;
      const behind = t.behindId !== undefined ? ctx.unit(t.behindId) : undefined;
      if (behind?.alive)
        timedMod(ctx, behind, `${tag}:slow`, 'moveSpeed', p(def, 'slowMul', 0.6), dur);
      break;
    }
    case 'desperado': {
      const u = ctx.unit(t.targetId!)!;
      const up = p(def, 'damageMul', 1.6);
      timedMod(ctx, u, DESPERADO_MOD, 'bladeDmg', up, dur);
      timedMod(ctx, u, `${tag}:s`, 'soulPower', up, dur);
      break;
    }
    case 'fortify': {
      const st = ctx.unit(t.targetId!)!;
      st.shields.push({ amount: st.stats.maxHp * p(def, 'shieldPct', 0.2), expiresTick: until });
      break;
    }
    case 'zugzwang':
    case 'time_trouble':
    case 'opening_book':
    case 'increment':
      return applyClock(ctx, team, def);
  }
  return {};
}

/** Pays for a card, runs it and logs it (shared by the hand and by Sealed Move). */
function cast(
  ctx: Ctx,
  team: PlayTeam,
  def: GambitDef,
  target: GambitTarget,
  cost: number,
): CommandResult {
  const t = validTarget(ctx, team, def, target);
  if (typeof t === 'string') return { ok: false, reason: t };
  ctx.s.tempo[team] -= cost;
  ctx.s.tempoSpent[team].cards += cost;
  incrementRefund(ctx, team, cost);
  const run = startRun(ctx, team, def, t);
  const zones = ctx.s.zones.length;
  const note = applyCard(ctx, team, def, t);
  if (ctx.s.zones.length > zones) bindZone(run, ctx.s.zones[ctx.s.zones.length - 1]);
  ctx.emit('gambit', { team, cardId: def.id, ...t, ...note });
  return { ok: true };
}

/** Plays the card in a team's hand slot (validates everything first). */
export function playGambit(
  ctx: Ctx,
  team: PlayTeam,
  slot: number,
  target: GambitTarget,
): CommandResult {
  if (ctx.s.phase.kind !== 'live')
    return { ok: false, reason: 'gambits are played during the match' };
  if (!Number.isInteger(slot) || slot < 0 || slot >= ctx.s.hands[team].length)
    return { ok: false, reason: 'no such slot' };
  const block = cardBlock(ctx, team, slot);
  if (block) return { ok: false, reason: block };
  const h = ctx.s.hands[team][slot];
  const def = ctx.c.gambitById.get(h.cardId!)!;
  const r = cast(ctx, team, def, target, cardCost(ctx, team, def));
  if (!r.ok) return r;
  h.cardId = null;
  delete h.opening;
  delete h.book;
  h.refillTick = ctx.s.tick + Math.round(refillSec(ctx, team) * TPS);
  return { ok: true };
}

/**
 * Sealed Move: the AI's targeting picks where the card goes. Plays it for `cost` Tempo when it has
 * a target, its piece is up and the Tempo is there; false otherwise (the caller waits and retries).
 */
export function playSealed(ctx: Ctx, team: PlayTeam, def: GambitDef, cost: number): boolean {
  if (ctx.s.tempo[team] < cost) return false;
  if (def.piece && !teamPiece(ctx, team, def.piece)?.alive) return false;
  const target = plan(ctx, team, def)?.target;
  if (!target) return false;
  return cast(ctx, team, def, target, cost).ok;
}

// ---------------------------------------------------------------- Clock school
// Zugzwang, Time Trouble, Opening Book, Increment: cards that work on Tempo and the hands, not
// the board (spec SPEC-GAMBITS-OPENINGS-2026-10-18, phase A).

/** What a Clock card did, for the `gambit` event (Black's banner names it). */
type ClockNote = { discarded?: string; drained?: number };

const isActive = (w: { untilTick: number } | null, tick: number): boolean =>
  w !== null && tick < w.untilTick;

/** Time Trouble: income earned while slowed; the part held back is credited to the card. */
function slowedIncome(ctx: Ctx, team: PlayTeam, amount: number): number {
  const slow = ctx.s.tempoSlow[team];
  if (!slow || !isActive(slow, ctx.s.tick)) return amount;
  const kept = amount * slow.value;
  noteClock(ctx, other(team), 'time_trouble', 'drained', amount - kept);
  return kept;
}

/** Increment: a card played while it runs gives Tempo back, never taking a card below the minimum. */
function incrementRefund(ctx: Ctx, team: PlayTeam, cost: number): void {
  const inc = ctx.s.increment[team];
  if (!inc || !isActive(inc, ctx.s.tick)) return;
  const back = Math.min(inc.value, Math.max(0, cost - ctx.t.gambits.minCost));
  if (back <= 0) return;
  const held = ctx.s.tempo[team];
  addTempo(ctx, team, back);
  noteClock(ctx, team, 'increment', 'refund', ctx.s.tempo[team] - held);
}

/** Zugzwang's mark: the slot of a side's dearest card at its own price (at least `minCost`), or -1. */
export function dearestSlot(ctx: Ctx, team: PlayTeam, def: GambitDef): number {
  let best = -1;
  let bestCost = p(def, 'minCost', 17) - 1;
  ctx.s.hands[team].forEach((h, i) => {
    const card = h.cardId !== null ? ctx.c.gambitById.get(h.cardId) : undefined;
    if (!card) return;
    const cost = cardCost(ctx, team, card);
    if (cost > bestCost) {
      bestCost = cost;
      best = i;
    }
  });
  return best;
}

function applyClock(ctx: Ctx, team: PlayTeam, def: GambitDef): ClockNote {
  const s = ctx.s;
  const foe = other(team);
  const until = s.tick + Math.round(def.durationSec * TPS);
  switch (gambitEffect(def)) {
    case 'zugzwang': {
      const slot = dearestSlot(ctx, foe, def);
      if (slot < 0) return {};
      const h = s.hands[foe][slot];
      const card = h.cardId!;
      const ticks = Math.round(p(def, 'refillSec', 15) * TPS);
      h.cardId = null;
      delete h.opening;
      delete h.book;
      h.refillTick = s.tick + ticks;
      h.discarded = ticks;
      noteClock(ctx, team, def.id, 'cards', 1);
      const run = s.feedback.runs[s.feedback.runs.length - 1];
      if (run?.cardId === def.id && run.team === team) run.card = card;
      return { discarded: card };
    }
    case 'time_trouble': {
      const drained = Math.min(s.tempo[foe], p(def, 'drain', 20));
      s.tempo[foe] -= drained;
      s.tempoSlow[foe] = { value: p(def, 'incomeMul', 0.7), untilTick: until };
      noteClock(ctx, team, def.id, 'drained', drained);
      return { drained: Math.round(drained) };
    }
    case 'opening_book': {
      const schools = ctx.c.openingById.get(s.opening[team])?.schools ?? [];
      // the book's own slot (the first holding it) stays; it refills as a played card does
      const own = s.hands[team].findIndex((h) => h.cardId === def.id);
      let n = 0;
      s.hands[team].forEach((h, i) => {
        if (i === own || h.cardId === null || h.opening) return;
        deal(ctx, team, i, schools);
        n++;
      });
      noteClock(ctx, team, def.id, 'cards', n);
      return {};
    }
    case 'increment':
      s.increment[team] = { value: p(def, 'refund', 5), untilTick: until };
      return {};
    default:
      return {};
  }
}

// ---------------------------------------------------------------- tick

export function tickGambits(ctx: Ctx): void {
  const s = ctx.s;
  if (s.tick % TPS === 0) {
    addTempo(ctx, 'A', tempoRate(ctx, 'A'));
    addTempo(ctx, 'B', tempoRate(ctx, 'B'));
  }
  for (const team of PLAY_TEAMS) {
    const hand = s.hands[team];
    for (let i = 0; i < hand.length; i++) {
      const h = hand[i];
      if (h.cardId === null) {
        if (h.refillTick !== null && s.tick >= h.refillTick) deal(ctx, team, i);
      } else if (h.opening ? s.phase.n >= 2 : s.tick >= h.expireTick) deal(ctx, team, i);
    }
  }
  if (s.timedMods.length) {
    const due = s.timedMods.filter((m) => m.atTick <= s.tick);
    if (due.length) {
      s.timedMods = s.timedMods.filter((m) => m.atTick > s.tick);
      for (const m of due) {
        const u = ctx.unit(m.unitId);
        if (u?.alive) addMod(ctx, u, m.mod);
      }
    }
  }
  if (s.zones.length) {
    const standing = s.zones.length;
    s.zones = s.zones.filter((z) => z.endTick > s.tick);
    if (s.zones.length !== standing) syncWalls(ctx);
    for (const z of s.zones) tickZone(ctx, z);
  }
  for (const team of PLAY_TEAMS) {
    if (!s.autoGambits[team]) continue;
    if (s.tick % TPS === (team === 'A' ? 5 : 15)) aiGambits(ctx, team);
  }
}

/** Holds a mod on a unit while a zone covers it (a short expiry the zone keeps renewing). */
function holdMod(
  ctx: Ctx,
  u: Unit,
  z: ZoneState,
  id: string,
  stat: Modifier['stat'],
  kind: Modifier['kind'],
  value: number,
  tags: string[] = [],
): void {
  const have = u.mods.find((m) => m.id === id);
  if (have && have.expiresTick !== null && have.expiresTick - ctx.s.tick > 6) return;
  addMod(ctx, u, {
    id,
    stat,
    kind,
    value,
    source: id,
    tags,
    expiresTick: Math.min(z.endTick, ctx.s.tick + 12),
  });
}

function tickZone(ctx: Ctx, z: ZoneState): void {
  const s = ctx.s;
  const def = ctx.c.gambitById.get(z.cardId);
  if (!def) return;
  switch (z.kind) {
    case 'sanctuary':
      for (const u of ctx.grid.query(z.x, z.y, z.radius)) {
        if (!u.alive || u.team !== z.team || (u.kind !== 'hero' && u.kind !== 'minion')) continue;
        if (dist(u.x, u.y, z.x, z.y) > z.radius) continue;
        noteHeal(
          ctx,
          z,
          healUnit(
            ctx,
            null,
            u,
            (u.stats.maxHp * p(def, 'healPctPerSec', 0.04)) / TPS,
            `gambit:${z.cardId}`,
            false,
          ),
        );
      }
      break;
    case 'outpost':
      if (s.tick % 5 !== 0) break;
      for (const u of ctx.grid.query(z.x, z.y, z.radius)) {
        if (!u.alive || u.team !== z.team || (u.kind !== 'hero' && u.kind !== 'minion')) continue;
        if (u.ev || dist(u.x, u.y, z.x, z.y) > z.radius) continue;
        holdMod(ctx, u, z, `gambit:${z.cardId}:a`, 'armor', 'add', p(def, 'armor', 20));
        holdMod(ctx, u, z, `gambit:${z.cardId}:r`, 'resist', 'add', p(def, 'resist', 20));
      }
      break;
    case 'openFile':
      if (s.tick % 5 !== 0) break;
      for (const u of s.units) {
        if (!u.alive || u.team !== z.team || u.ev) continue;
        const lane = u.hero ? u.hero.lane : u.kind === 'minion' ? u.lane : null;
        if (lane !== z.lane) continue;
        holdMod(ctx, u, z, `gambit:${z.cardId}`, 'moveSpeed', 'mul', p(def, 'moveSpeedMul', 1.25), [
          LANE_SPEED_TAG,
        ]);
      }
      break;
    case 'barricade':
      break;
  }
}

/**
 * Poisoned Pawn: whoever kills the marked pawn is slowed, and their team loses Tempo. Called for
 * every unit that dies (a no-op unless it carries the mark).
 */
export function onPoisonedDeath(ctx: Ctx, victim: Unit, killer: Unit | null): void {
  const mark = victim.mods.find((m) => m.id === POISON_MOD);
  if (!mark || (mark.expiresTick !== null && mark.expiresTick <= ctx.s.tick)) return;
  if (!killer || killer.team === 'neutral' || killer.team === victim.team) return;
  const def = ctx.c.gambitById.get('poisoned_pawn');
  if (!def) return;
  const team = killer.team;
  const held = ctx.s.tempo[team];
  ctx.s.tempo[team] = Math.max(0, held - p(def, 'tempoLoss', 10));
  noteDrain(ctx, victim.id, held - ctx.s.tempo[team]);
  if (killer.kind === 'hero' || killer.kind === 'minion')
    timedMod(
      ctx,
      killer,
      `${POISON_MOD}:slow`,
      'moveSpeed',
      p(def, 'slowMul', 0.6),
      p(def, 'slowSec', 4),
    );
}

/**
 * Desperado: a piece that falls while its boost lasts gives its team Tempo back. Called for
 * every unit that dies (a no-op unless it carries the mark).
 */
export function onDesperadoDeath(ctx: Ctx, victim: Unit): void {
  const mark = victim.mods.find((m) => m.id === DESPERADO_MOD);
  if (!mark || (mark.expiresTick !== null && mark.expiresTick <= ctx.s.tick)) return;
  if (victim.team === 'neutral') return;
  const def = ctx.c.gambitById.get('desperado');
  if (!def) return;
  const back = p(def, 'refund', 10);
  addTempo(ctx, victim.team, back);
  noteClock(ctx, victim.team, def.id, 'refund', back);
}

// ---------------------------------------------------------------- AI

export interface Plan {
  score: number;
  target: GambitTarget;
}

function countNear(
  ctx: Ctx,
  team: PlayTeam,
  x: number,
  y: number,
  r: number,
  test: (u: Unit) => boolean,
): number {
  let n = 0;
  for (const u of ctx.grid.query(x, y, r)) {
    if (u.alive && u.team === team && test(u) && dist(u.x, u.y, x, y) <= r) n++;
  }
  return n;
}

const isPiece = (u: Unit): boolean => u.kind === 'hero';
const inFight = (ctx: Ctx, u: Unit): boolean => ctx.s.tick - u.lastDamagedTick <= 2 * TPS;

function frontStructure(ctx: Ctx, team: PlayTeam, lane: LaneId): Unit | null {
  const t = enemyTowerTarget(ctx, team, lane);
  if (t) return t;
  const g = ctx.guardians[other(team)];
  return g && g.alive && isTargetable(ctx, g) ? g : null;
}

/** `nested`: asked by another card's plan (Increment, Opening Book), so those two stay quiet. */
function plan(ctx: Ctx, team: PlayTeam, def: GambitDef, nested = false): Plan | null {
  const foe = other(team);
  const mine = alivePieces(ctx, team);
  const theirs = alivePieces(ctx, foe);
  const deadFoes = 5 - theirs.length;
  switch (gambitEffect(def)) {
    case 'advance': {
      let best: Plan | null = null;
      for (const lane of seatLanes(ctx.world, team)) {
        const st = frontStructure(ctx, team, lane);
        if (!st) continue;
        const a = mine.filter((u) => u.hero!.lane === lane && hpPct(u) > 0.5).length;
        if (a === 0) continue;
        const defenders = countNear(ctx, foe, st.x, st.y, 700, isPiece);
        const score = 0.35 * a + 0.35 * deadFoes - 0.2 * defenders;
        if (!best || score > best.score) best = { score, target: { lane } };
      }
      return best;
    }
    case 'hold_the_file': {
      let best: Plan | null = null;
      for (const lane of seatLanes(ctx.world, team)) {
        const [o, i] = ctx.towers[team][lane];
        const st = o?.alive ? o : i?.alive ? i : ctx.guardians[team];
        if (!st || !st.alive) continue;
        const e = countNear(ctx, foe, st.x, st.y, 550, isPiece);
        const a = mine.filter((u) => u.hero!.lane === lane).length;
        if (a === 0 || e === 0) continue;
        const score = 0.45 * e + 0.15 * a;
        if (!best || score > best.score) best = { score, target: { lane } };
      }
      return best;
    }
    case 'regroup': {
      const g = ctx.guardians[team];
      if (g?.alive) {
        const e = countNear(ctx, foe, g.x, g.y, 650, isPiece);
        if (e >= 2) return { score: 0.9 + 0.2 * e, target: { x: g.x, y: g.y } };
      }
      if (deadFoes >= 2 && mine.length >= 4) {
        let st: Unit | null = null;
        for (const lane of seatLanes(ctx.world, team)) {
          const c = frontStructure(ctx, team, lane);
          if (c && (!st || c.kind === 'guardian' || (c.tower && c.tower.index === 1))) st = c;
        }
        if (st) {
          const b = ctx.world.basePos[team];
          const dx = b.x - st.x;
          const dy = b.y - st.y;
          const l = Math.sqrt(dx * dx + dy * dy) || 1;
          return {
            score: 0.4 + 0.3 * deadFoes,
            target: { x: st.x + (dx / l) * 220, y: st.y + (dy / l) * 220 },
          };
        }
      }
      return null;
    }
    case 'pawn_storm': {
      let best: Plan | null = null;
      for (const lane of seatLanes(ctx.world, team)) {
        const st = frontStructure(ctx, team, lane);
        if (!st) continue;
        const n = countNear(
          ctx,
          team,
          st.x,
          st.y,
          420,
          (u) => u.kind === 'minion' && !u.ev && u.lane === lane,
        );
        const pawns = countNear(ctx, team, st.x, st.y, 420, (u) => !!u.pawn && u.lane === lane);
        const score = 0.13 * n + 0.15 * pawns;
        if (!best || score > best.score) best = { score, target: { lane } };
      }
      return best;
    }
    case 'check': {
      let best: Plan | null = null;
      for (const e of theirs) {
        if (!inFight(ctx, e)) continue;
        const a = countNear(ctx, team, e.x, e.y, 350, isPiece);
        if (a < 2) continue;
        const score = 0.45 + 0.25 * a + (1 - hpPct(e)) * 0.4;
        if (!best || score > best.score) best = { score, target: { targetId: e.id } };
      }
      return best;
    }
    case 'castle': {
      const k = teamPiece(ctx, team, 'king');
      const r = teamPiece(ctx, team, 'rook');
      if (!k?.alive || !r?.alive) return null;
      // the King is hurt in a fight and the Rook stands somewhere safer: swap them
      if (hpPct(k) > 0.45 || hpPct(r) < 0.5 || !inFight(ctx, k)) return null;
      const atKing = countNear(ctx, foe, k.x, k.y, 320, isPiece);
      if (atKing === 0) return null;
      if (countNear(ctx, foe, r.x, r.y, 380, isPiece) >= atKing) return null;
      return { score: 1.4 + 0.3 * atKing, target: {} };
    }
    case 'queens_gambit': {
      const q = teamPiece(ctx, team, 'queen');
      if (!q?.alive || hpPct(q) < 0.4) return null;
      const e = countNear(ctx, foe, q.x, q.y, 320, isPiece);
      if (e === 0) return null;
      return { score: 1.1 + 0.25 * e, target: {} };
    }
    case 'siege': {
      const r = teamPiece(ctx, team, 'rook');
      if (!r?.alive || hpPct(r) < 0.45) return null;
      let best: Plan | null = null;
      for (const lane of seatLanes(ctx.world, team)) {
        const st = frontStructure(ctx, team, lane);
        if (!st || !isTargetable(ctx, st)) continue;
        const d = dist(r.x, r.y, st.x, st.y);
        if (d > 650 * ctx.world.k) continue;
        const allies = countNear(ctx, team, st.x, st.y, 500 * ctx.world.k, isPiece);
        const score = 1 + 0.2 * allies + (st.kind === 'guardian' ? 0.4 : 0) - d / 2000;
        if (!best || score > best.score) best = { score, target: { targetId: st.id } };
      }
      return best;
    }
    case 'sanctuary': {
      const b = teamPiece(ctx, team, 'bishop');
      if (!b?.alive) return null;
      const r = p(def, 'radius', 140);
      let best: Plan | null = null;
      for (const u of mine) {
        if (!inFight(ctx, u)) continue;
        let hurt = 0;
        let n = 0;
        for (const v of mine) {
          if (dist(u.x, u.y, v.x, v.y) > r) continue;
          hurt += 1 - hpPct(v);
          n++;
        }
        if (n < 2) continue;
        const score = 0.6 + hurt;
        if (!best || score > best.score) best = { score, target: { x: u.x, y: u.y } };
      }
      return best;
    }
    case 'fork': {
      const k = teamPiece(ctx, team, 'knight');
      if (!k?.alive || hpPct(k) < 0.5) return null;
      const reach = p(def, 'reach', 975);
      let best: Plan | null = null;
      for (const e of theirs) {
        if (dist(k.x, k.y, e.x, e.y) > reach) continue;
        const allies = countNear(ctx, team, e.x, e.y, 400, isPiece);
        const guards = countNear(ctx, foe, e.x, e.y, 350, isPiece);
        const score = 0.9 + (1 - hpPct(e)) * 0.9 + 0.2 * allies - 0.2 * Math.max(0, guards - 1);
        if (!best || score > best.score) best = { score, target: { targetId: e.id } };
      }
      return best;
    }
    case 'pawn_sacrifice': {
      let best: Plan | null = null;
      for (const lane of seatLanes(ctx.world, team)) {
        const sp = sacrificePlan(ctx, team, lane);
        if (typeof sp === 'string') continue;
        const hit = sp.pawn.stats.maxHp * p(def, 'hpMul', 2);
        const frac = Math.min(1, hit / Math.max(1, sp.tower.hp));
        if (frac < 0.5) continue;
        const allies = countNear(ctx, team, sp.tower.x, sp.tower.y, 700 * ctx.world.k, isPiece);
        const score =
          0.35 + 1.1 * frac + 0.15 * Math.min(3, allies) + (hit >= sp.tower.hp ? 0.4 : 0);
        if (!best || score > best.score) best = { score, target: { lane } };
      }
      return best;
    }
    case 'exchange': {
      const fighting = mine.filter((u) => inFight(ctx, u));
      if (fighting.length < 2) return null;
      let foes = 0;
      for (const e of theirs) if (inFight(ctx, e)) foes++;
      if (foes < 2) return null;
      let giver: Unit | null = null;
      for (const u of fighting) {
        if (hpPct(u) < 0.6) continue;
        if (!giver || u.stats.maxHp * hpPct(u) > giver.stats.maxHp * hpPct(giver)) giver = u;
      }
      if (!giver) return null;
      return {
        score: 0.4 + 0.3 * fighting.length + 0.1 * foes,
        target: { targetId: giver.id },
      };
    }
    case 'poisoned_pawn': {
      let best: Plan | null = null;
      for (const lane of seatLanes(ctx.world, team)) {
        const pawn = frontPawn(ctx, team, lane);
        if (!pawn) continue;
        const e = countNear(ctx, foe, pawn.x, pawn.y, 400 * ctx.world.k, isPiece);
        if (e === 0) continue;
        const score = 0.3 + 0.35 * e + (1 - hpPct(pawn)) * 0.5;
        if (!best || score > best.score) best = { score, target: { lane } };
      }
      return best;
    }
    case 'barricade': {
      const k = ctx.world.k;
      let best: Plan | null = null;
      for (const lane of seatLanes(ctx.world, team)) {
        const [o, i] = ctx.towers[team][lane];
        const st = o?.alive ? o : i?.alive ? i : ctx.guardians[team];
        if (!st || !st.alive) continue;
        let n = 0;
        let pieces = 0;
        let cx = 0;
        let cy = 0;
        for (const u of ctx.grid.query(st.x, st.y, 900 * k)) {
          if (!u.alive || u.team !== foe || u.lane !== lane || u.ev) continue;
          if (u.kind !== 'minion' && u.kind !== 'hero') continue;
          n++;
          if (u.kind === 'hero') pieces++;
          cx += u.x;
          cy += u.y;
        }
        if (n < 4) continue;
        cx /= n;
        cy /= n;
        const d = dist(cx, cy, st.x, st.y) || 1;
        // A wall just ahead of the column, on the way to our Bastion.
        const ahead = Math.min(d * 0.5, 160 * k);
        const target = { x: cx + ((st.x - cx) / d) * ahead, y: cy + ((st.y - cy) / d) * ahead };
        const score = 0.1 * n + 0.25 * pieces;
        if (!best || score > best.score) best = { score, target };
      }
      return best;
    }
    case 'open_file': {
      let best: Plan | null = null;
      for (const lane of seatLanes(ctx.world, team)) {
        if (!enemyTowerTarget(ctx, team, lane) && !ctx.guardians[foe]?.alive) continue;
        let n = 0;
        for (const u of ctx.s.units) {
          if (!u.alive || u.team !== team || u.ev) continue;
          if ((u.hero ? u.hero.lane : u.kind === 'minion' ? u.lane : null) === lane) n++;
        }
        const score = 0.07 * n;
        if (!best || score > best.score) best = { score, target: { lane } };
      }
      return best;
    }
    case 'outpost': {
      const reach = p(def, 'radius', 160) * ctx.world.k;
      let best: Plan | null = null;
      for (const u of mine) {
        if (!inFight(ctx, u)) continue;
        const n = countNear(
          ctx,
          team,
          u.x,
          u.y,
          reach,
          (v) => v.kind === 'hero' || (v.kind === 'minion' && !v.ev),
        );
        const e = countNear(ctx, foe, u.x, u.y, reach * 1.5, isPiece);
        if (n < 3 || e === 0) continue;
        const score = 0.25 * n + 0.2 * e;
        if (!best || score > best.score) best = { score, target: { x: u.x, y: u.y } };
      }
      return best;
    }
    case 'breakthrough': {
      let best: Plan | null = null;
      for (const lane of seatLanes(ctx.world, team)) {
        if (ctx.s.breakthrough[team][lane]) continue;
        const st = frontStructure(ctx, team, lane);
        if (!st) continue;
        const a = mine.filter((u) => u.hero!.lane === lane && hpPct(u) > 0.5).length;
        if (a === 0) continue;
        const defenders = countNear(ctx, foe, st.x, st.y, 700, isPiece);
        const score = 0.45 + 0.3 * a + 0.8 * (1 - hpPct(st)) - 0.15 * defenders;
        if (!best || score > best.score) best = { score, target: { lane } };
      }
      return best;
    }
    case 'pin': {
      let best: Plan | null = null;
      for (const e of theirs) {
        if (!inFight(ctx, e) || isPinned(ctx, e)) continue;
        const a = countNear(ctx, team, e.x, e.y, 350, isPiece);
        if (a < 2) continue;
        const score = 0.45 + 0.25 * a + (1 - hpPct(e)) * 0.4 + (pinBehind(ctx, def, e) ? 0.15 : 0);
        if (!best || score > best.score) best = { score, target: { targetId: e.id } };
      }
      return best;
    }
    case 'desperado': {
      const line = p(def, 'hpMax', 0.4);
      let best: Plan | null = null;
      for (const u of desperadoPieces(ctx, team, def)) {
        if (!inFight(ctx, u)) continue;
        const e = countNear(ctx, foe, u.x, u.y, u.stats.range + 150, isPiece);
        if (e === 0) continue;
        const score = 0.8 + 0.3 * Math.min(2, e) + 0.3 * (1 - hpPct(u) / line);
        if (!best || score > best.score) best = { score, target: { targetId: u.id } };
      }
      return best;
    }
    case 'fortify': {
      let best: Plan | null = null;
      for (const lane of seatLanes(ctx.world, team)) {
        const st = ownFront(ctx, team, lane);
        if (!st || st.shields.length > 0 || hpPct(st) >= 0.8) continue;
        const e = countNear(ctx, foe, st.x, st.y, 550, isPiece);
        const n = countNear(
          ctx,
          foe,
          st.x,
          st.y,
          450,
          (u) => u.kind === 'hero' || (u.kind === 'minion' && !u.ev),
        );
        if (e < 2 && n < 4) continue;
        const score = 0.6 + 0.2 * e + 0.06 * n + 0.8 * (0.8 - hpPct(st));
        if (!best || score > best.score) best = { score, target: { lane } };
      }
      return best;
    }
    case 'zugzwang':
    case 'time_trouble':
      return clockPlan(ctx, team, def, theirs);
    case 'opening_book':
    case 'increment':
      return nested ? null : clockPlan(ctx, team, def, theirs);
  }
}

/** The best plan score among a side's other held cards (not `def`'s slot), or 0. */
function otherCardsBest(ctx: Ctx, team: PlayTeam, def: GambitDef): number {
  const hand = ctx.s.hands[team];
  const own = hand.findIndex((h) => h.cardId === def.id);
  let best = 0;
  hand.forEach((h, i) => {
    if (i === own || h.cardId === null) return;
    const card = ctx.c.gambitById.get(h.cardId)!;
    if (card.piece && !teamPiece(ctx, team, card.piece)?.alive) return;
    best = Math.max(best, plan(ctx, team, card, true)?.score ?? 0);
  });
  return best;
}

/** The cheapest other held card whose plan fires (its price), or 0 when none does. */
function otherCardsCost(ctx: Ctx, team: PlayTeam, def: GambitDef): number {
  const hand = ctx.s.hands[team];
  const own = hand.findIndex((h) => h.cardId === def.id);
  let cost = Infinity;
  hand.forEach((h, i) => {
    if (i === own || h.cardId === null) return;
    const card = ctx.c.gambitById.get(h.cardId)!;
    if (card.piece && !teamPiece(ctx, team, card.piece)?.alive) return;
    if ((plan(ctx, team, card, true)?.score ?? 0) < 1) return;
    cost = Math.min(cost, cardCost(ctx, team, card));
  });
  return Number.isFinite(cost) ? cost : 0;
}

/** The AI's Clock plans (spec 2026-10-18 section 5): each fires on a Tempo or hand reading. */
function clockPlan(ctx: Ctx, team: PlayTeam, def: GambitDef, theirs: Unit[]): Plan | null {
  const s = ctx.s;
  const foe = other(team);
  switch (gambitEffect(def)) {
    case 'time_trouble': {
      // the enemy is about to buy: 45+ Tempo; more urgent while its pieces fight
      const held = s.tempo[foe];
      if (held < 45 || isActive(s.tempoSlow[foe], s.tick)) return null;
      const fight = theirs.some((e) => inFight(ctx, e)) ? 0.3 : 0;
      return { score: 1 + (held - 45) / 55 + fight, target: {} };
    }
    case 'zugzwang': {
      // the enemy holds a dear card and has nearly the Tempo to play it
      const slot = dearestSlot(ctx, foe, def);
      if (slot < 0) return null;
      const card = ctx.c.gambitById.get(s.hands[foe][slot].cardId!)!;
      const cost = cardCost(ctx, foe, card);
      if (s.tempo[foe] < cost - 10) return null;
      return { score: 0.8 + cost / 30, target: {} };
    }
    case 'increment': {
      // with Tempo for both and another card ready: ahead of it, so that card is refunded (it used
      // to want 60+ Tempo, which a player's pawn plan, spending everything above 55, never left)
      if (isActive(s.increment[team], s.tick)) return null;
      const next = otherCardsBest(ctx, team, def);
      if (next < 1 || s.tempo[team] < cardCost(ctx, team, def) + otherCardsCost(ctx, team, def))
        return null;
      return { score: next + 0.1, target: {} };
    }
    case 'opening_book': {
      // neither other card has fitted for 15 s (held that long, none fits now): dig
      if (s.tempo[team] < 50) return null;
      const hand = s.hands[team];
      const own = hand.findIndex((h) => h.cardId === def.id);
      const others = hand.filter((h, i) => i !== own && h.cardId !== null);
      if (others.length === 0) return null;
      if (others.some((h) => s.tick - dealtTick(ctx, h) < 15 * TPS)) return null;
      if (otherCardsBest(ctx, team, def) >= 1) return null;
      return { score: 1, target: {} };
    }
    default:
      return null;
  }
}

/**
 * The AI's card pick: the best-fitting affordable card in the hand and its cost, or null (with
 * `anyCost`, the best-fitting card whatever the Tempo). Also drives the balance tool's stand-in
 * player (`tools/simulate.ts`).
 */
export function aiCardPick(
  ctx: Ctx,
  team: PlayTeam,
  anyCost = false,
): { slot: number; plan: Plan; cost: number } | null {
  const s = ctx.s;
  const hand = s.hands[team];
  let best: { slot: number; plan: Plan; cost: number } | null = null;
  for (let i = 0; i < hand.length; i++) {
    const id = hand[i].cardId;
    if (id === null) continue;
    const def = ctx.c.gambitById.get(id)!;
    if (def.piece && !teamPiece(ctx, team, def.piece)?.alive) continue;
    const pl = plan(ctx, team, def);
    if (!pl || pl.score < 1) continue;
    const cost = cardCost(ctx, team, def);
    if (!anyCost && s.tempo[team] < cost) continue;
    if (!best || pl.score > best.plan.score) best = { slot: i, plan: pl, cost };
  }
  return best;
}

/**
 * The AI's cards: it plays its best-fitting card if it keeps `pawns.aiCardReserve` Tempo after
 * paying, except while its pawns are behind their share (`aiTempoTurn` in `pawnPlan.ts`). Its
 * pawns come from the standing pawn plan (the same counts and reserve as the player's).
 */
function aiGambits(ctx: Ctx, team: PlayTeam): void {
  if (aiTempoTurn(ctx, team) === 'pawns') return;
  const best = aiCardPick(ctx, team);
  if (!best) return;
  // a dearer card that fits clearly better is worth waiting for (cheap cards used to be played
  // whenever they fitted, so the piece cards at 23-30 Tempo almost never were)
  const want = aiCardPick(ctx, team, true);
  if (
    want &&
    want.slot !== best.slot &&
    want.plan.score >= best.plan.score + ctx.t.gambits.aiWaitMargin
  )
    return;
  if (ctx.s.tempo[team] - best.cost < ctx.t.pawns.aiCardReserve) return;
  playGambit(ctx, team, best.slot, best.plan.target);
}
