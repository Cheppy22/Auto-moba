import { TPS } from './combat';
import { dealDamage, healUnit, stunUnit } from './combat';
import { gambitEffect } from './content/loader';
import type { GambitDef, LaneId } from './content/schema';
import { dist } from './core/math';
import { weightedPick } from './core/rng';
import { hpPct, isTargetable, type Ctx } from './ctx';
import { enemyTowerTarget } from './ai/lanes';
import { fieldPawn, pawnCap, pawnsAlive } from './pawns';
import { teamPiece } from './pieces';
import { addMod } from './stats';
import { LANES, lanePoint } from './world/map';
import { confine, shapeDist, walkable, type WalkShape } from './world/terrain';
import type { CommandResult, GambitOrder, Modifier, PlayTeam, Unit, ZoneState } from './types';
import { other } from './types';

/** The mod that marks a Poisoned Pawn (a no-op multiplier; its presence is the mark). */
export const POISON_MOD = 'gambit:poisoned_pawn';

export interface GambitTarget {
  lane?: LaneId;
  x?: number;
  y?: number;
  targetId?: number;
}

const p = (def: GambitDef, key: string, fallback: number): number => def.params[key] ?? fallback;

export function addTempo(ctx: Ctx, team: PlayTeam, amount: number): void {
  if (amount <= 0) return;
  ctx.s.tempo[team] = Math.min(ctx.t.gambits.tempoMax, ctx.s.tempo[team] + amount);
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

function drawCard(ctx: Ctx, team: PlayTeam): string | null {
  const held = new Set(ctx.s.hands[team].map((h) => h.cardId).filter((x) => x !== null));
  const deck = ctx.c.gambits.filter((g) => {
    if (g.weight <= 0) return false;
    if (g.piece === null) return true;
    return !!teamPiece(ctx, team, g.piece)?.alive;
  });
  const fresh = deck.filter((g) => !held.has(g.id));
  const pool = fresh.length > 0 ? fresh : deck;
  if (pool.length === 0) return null;
  // The opening's two schools come up twice as often.
  const favoured = ctx.c.openingById.get(ctx.s.opening[team])?.schools ?? [];
  return weightedPick(
    ctx.s.rng,
    'gambit',
    pool,
    (g) => g.weight * (favoured.includes(g.school) ? 2 : 1),
  ).id;
}

function deal(ctx: Ctx, team: PlayTeam, slot: number): void {
  const h = ctx.s.hands[team][slot];
  h.cardId = drawCard(ctx, team);
  h.expireTick = ctx.s.tick + Math.round(ctx.t.gambits.expireSec * TPS);
  h.refillTick = h.cardId === null ? ctx.s.tick + TPS : null;
}

export function initHands(ctx: Ctx): void {
  for (const team of ['A', 'B'] as PlayTeam[]) {
    ctx.s.hands[team] = [];
    for (let i = 0; i < ctx.t.gambits.handSize; i++) {
      ctx.s.hands[team].push({ cardId: null, expireTick: 0, refillTick: null });
      deal(ctx, team, i);
    }
  }
}

/** Why a held card cannot be played right now ('' when it can). */
export function cardBlock(ctx: Ctx, team: PlayTeam, slot: number): string {
  const h = ctx.s.hands[team][slot];
  if (!h || h.cardId === null) return 'no card in that slot';
  const def = ctx.c.gambitById.get(h.cardId)!;
  if (def.piece) {
    const u = teamPiece(ctx, team, def.piece);
    if (!u?.alive) return `${ctx.c.pieceById.get(def.piece)!.name} is down`;
  }
  if (ctx.s.tempo[team] < def.cost) return 'not enough Tempo';
  const eff = gambitEffect(def);
  if (eff === 'castle' && !teamPiece(ctx, team, 'rook')?.alive) return 'Rook is down';
  if (eff === 'pawn_sacrifice' && pawnsAlive(ctx, team) === 0) return 'no pawn to sacrifice';
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
): void {
  addMod(ctx, u, {
    id,
    stat,
    kind: 'mul',
    value,
    source: id,
    tags: [],
    expiresTick: ctx.s.tick + Math.round(sec * TPS),
  });
}

function setOrder(ctx: Ctx, u: Unit, order: GambitOrder): void {
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
    if (sh.kind !== 'lane' && sh.kind !== 'port') continue;
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
      return { lane: t.lane };
    }
    case 'point': {
      const size = ctx.world.map.size;
      if (t.x === undefined || t.y === undefined || !Number.isFinite(t.x) || !Number.isFinite(t.y))
        return 'pick a point';
      if (t.x < 0 || t.y < 0 || t.x > size || t.y > size) return 'point is off the map';
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
      return { targetId: u.id };
    }
    case 'none':
      return {};
  }
}

function applyCard(ctx: Ctx, team: PlayTeam, def: GambitDef, t: GambitTarget): void {
  const s = ctx.s;
  const dur = def.durationSec;
  const until = s.tick + Math.round(dur * TPS);
  const tag = `gambit:${def.id}`;
  switch (gambitEffect(def)) {
    case 'advance': {
      const lane = t.lane!;
      for (const u of laneUnits(ctx, team, lane, true)) {
        setOrder(ctx, u, { kind: 'push', lane, x: u.x, y: u.y, targetId: null, untilTick: until });
        timedMod(ctx, u, tag, 'moveSpeed', p(def, 'moveSpeedMul', 1.1), dur);
      }
      for (const u of laneUnits(ctx, team, lane, false))
        timedMod(ctx, u, tag, 'moveSpeed', p(def, 'moveSpeedMul', 1.1), dur);
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
  }
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
  const t = validTarget(ctx, team, def, target);
  if (typeof t === 'string') return { ok: false, reason: t };
  ctx.s.tempo[team] -= def.cost;
  applyCard(ctx, team, def, t);
  h.cardId = null;
  h.refillTick = ctx.s.tick + Math.round(ctx.t.gambits.refillSec * TPS);
  ctx.emit('gambit', { team, cardId: def.id, ...t });
  return { ok: true };
}

// ---------------------------------------------------------------- tick

export function tickGambits(ctx: Ctx): void {
  const s = ctx.s;
  if (s.tick % TPS === 0) {
    addTempo(ctx, 'A', ctx.t.gambits.tempoPerSec);
    addTempo(ctx, 'B', ctx.t.gambits.tempoPerSec);
  }
  for (const team of ['A', 'B'] as PlayTeam[]) {
    const hand = s.hands[team];
    for (let i = 0; i < hand.length; i++) {
      const h = hand[i];
      if (h.cardId === null) {
        if (h.refillTick !== null && s.tick >= h.refillTick) deal(ctx, team, i);
      } else if (s.tick >= h.expireTick) deal(ctx, team, i);
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
  for (const team of ['A', 'B'] as PlayTeam[]) {
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
): void {
  const have = u.mods.find((m) => m.id === id);
  if (have && have.expiresTick !== null && have.expiresTick - ctx.s.tick > 6) return;
  addMod(ctx, u, {
    id,
    stat,
    kind,
    value,
    source: id,
    tags: [],
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
        healUnit(
          ctx,
          null,
          u,
          (u.stats.maxHp * p(def, 'healPctPerSec', 0.04)) / TPS,
          `gambit:${z.cardId}`,
          false,
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
        holdMod(ctx, u, z, `gambit:${z.cardId}`, 'moveSpeed', 'mul', p(def, 'moveSpeedMul', 1.25));
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
  ctx.s.tempo[team] = Math.max(0, ctx.s.tempo[team] - p(def, 'tempoLoss', 10));
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

// ---------------------------------------------------------------- AI

interface Plan {
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

function plan(ctx: Ctx, team: PlayTeam, def: GambitDef): Plan | null {
  const foe = other(team);
  const mine = alivePieces(ctx, team);
  const theirs = alivePieces(ctx, foe);
  const deadFoes = 5 - theirs.length;
  switch (gambitEffect(def)) {
    case 'advance': {
      let best: Plan | null = null;
      for (const lane of LANES) {
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
      for (const lane of LANES) {
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
        for (const lane of LANES) {
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
      for (const lane of LANES) {
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
      if (hpPct(k) > 0.35 || hpPct(r) < 0.5) return null;
      if (countNear(ctx, foe, k.x, k.y, 320, isPiece) === 0) return null;
      if (countNear(ctx, foe, r.x, r.y, 380, isPiece) > 0) return null;
      return { score: 2, target: {} };
    }
    case 'queens_gambit': {
      const q = teamPiece(ctx, team, 'queen');
      if (!q?.alive || hpPct(q) < 0.4) return null;
      const e = countNear(ctx, foe, q.x, q.y, 320, isPiece);
      if (e === 0) return null;
      return { score: 0.8 + 0.25 * e, target: {} };
    }
    case 'siege': {
      const r = teamPiece(ctx, team, 'rook');
      if (!r?.alive || hpPct(r) < 0.45) return null;
      let best: Plan | null = null;
      for (const lane of LANES) {
        const st = frontStructure(ctx, team, lane);
        if (!st || !isTargetable(ctx, st)) continue;
        const d = dist(r.x, r.y, st.x, st.y);
        if (d > 650 * ctx.world.k) continue;
        const allies = countNear(ctx, team, st.x, st.y, 500 * ctx.world.k, isPiece);
        const score = 0.7 + 0.2 * allies + (st.kind === 'guardian' ? 0.4 : 0) - d / 2000;
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
        const score = 0.3 + hurt;
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
        const score = 0.5 + (1 - hpPct(e)) * 0.9 + 0.2 * allies - 0.2 * Math.max(0, guards - 1);
        if (!best || score > best.score) best = { score, target: { targetId: e.id } };
      }
      return best;
    }
    case 'pawn_sacrifice': {
      let best: Plan | null = null;
      for (const lane of LANES) {
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
      for (const lane of LANES) {
        const pawn = frontPawn(ctx, team, lane);
        if (!pawn) continue;
        const e = countNear(ctx, foe, pawn.x, pawn.y, 400 * ctx.world.k, isPiece);
        if (e === 0) continue;
        const score = 0.45 + 0.35 * e + (1 - hpPct(pawn)) * 0.5;
        if (!best || score > best.score) best = { score, target: { lane } };
      }
      return best;
    }
    case 'barricade': {
      const k = ctx.world.k;
      let best: Plan | null = null;
      for (const lane of LANES) {
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
      for (const lane of LANES) {
        if (!enemyTowerTarget(ctx, team, lane) && !ctx.guardians[foe]?.alive) continue;
        let n = 0;
        for (const u of ctx.s.units) {
          if (!u.alive || u.team !== team || u.ev) continue;
          if ((u.hero ? u.hero.lane : u.kind === 'minion' ? u.lane : null) === lane) n++;
        }
        const score = 0.1 * n;
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
  }
}

/** Lane to field a pawn in: fewest of our pawns there, then the lane we are losing most. */
function pawnLane(ctx: Ctx, team: PlayTeam): LaneId {
  let best: LaneId = 'mid';
  let bestScore = Infinity;
  for (const lane of LANES) {
    let n = 0;
    for (const u of ctx.s.units) if (u.alive && u.pawn && u.team === team && u.lane === lane) n++;
    const score = n * 10 + ctx.front[team][lane] - (lane === 'mid' ? 0 : 0.5);
    if (score < bestScore) {
      bestScore = score;
      best = lane;
    }
  }
  return best;
}

/** The Tempo heuristic: play the best-fitting card, otherwise field pawns from the surplus. */
export function aiGambits(ctx: Ctx, team: PlayTeam): void {
  const s = ctx.s;
  const hand = s.hands[team];
  let best: { slot: number; plan: Plan } | null = null;
  let wanted = 0;
  for (let i = 0; i < hand.length; i++) {
    const id = hand[i].cardId;
    if (id === null) continue;
    const def = ctx.c.gambitById.get(id)!;
    if (def.piece && !teamPiece(ctx, team, def.piece)?.alive) continue;
    const pl = plan(ctx, team, def);
    if (!pl || pl.score < 1) continue;
    if (s.tempo[team] < def.cost) {
      wanted = Math.max(wanted, def.cost);
      continue;
    }
    if (!best || pl.score > best.plan.score) best = { slot: i, plan: pl };
  }
  if (best && playGambit(ctx, team, best.slot, best.plan.target).ok) return;
  const cost = ctx.t.pawns.cost;
  const reserve = wanted > 0 ? wanted : 20;
  if (pawnsAlive(ctx, team) >= pawnCap(ctx)) return;
  if (s.tempo[team] >= cost + reserve || s.tempo[team] >= ctx.t.gambits.tempoMax - 10)
    fieldPawn(ctx, team, pawnLane(ctx, team));
}
