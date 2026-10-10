import { TPS, performAttack, tauntTarget } from './combat';
import { dist } from './core/math';
import { touchesFixedBody } from './collision';
import { hpPct, isEnemy, isTargetable, type Ctx } from './ctx';
import { matchupAt } from './ai/power';
import { retreatLanePath } from './ai/strategic';
import { isWary } from './ai/swap';
import { findPath, LANES } from './world/map';
import { clearLine, confine, walkable } from './world/terrain';
import { pieceDef } from './pieces';
import { tickRecall } from './recall';
import type { PlayTeam, Unit } from './types';

/** How long a cached detour waypoint is followed before the route is planned again. */
const DETOUR_TICKS = 10;

/** True when the unit can take its first step toward (x, y) and then walk straight there. */
function stepClear(ctx: Ctx, u: Unit, x: number, y: number): boolean {
  const terrain = ctx.world.terrain;
  const d = dist(u.x, u.y, x, y);
  const f = Math.min(1, (u.stats.moveSpeed * ctx.t.movement.speedMul) / TPS / (d || 1));
  return (
    walkable(terrain, ctx.open, u.x + (x - u.x) * f, u.y + (y - u.y) * f) &&
    clearLine(terrain, ctx.open, u.x, u.y, x, y)
  );
}

/**
 * Plans a way around solid terrain: the furthest point of the nav-graph route that the unit can
 * walk to in a straight line. Null when no such point exists.
 */
function planDetour(ctx: Ctx, u: Unit, tx: number, ty: number): void {
  const terrain = ctx.world.terrain;
  const route = findPath(ctx.world, { x: u.x, y: u.y }, { x: tx, y: ty }, ctx.open, {
    from: (nx, ny) => stepClear(ctx, u, nx, ny),
    to: (nx, ny) => clearLine(terrain, ctx.open, tx, ty, nx, ny),
  });
  let best = -1;
  for (let i = 0; i < route.length - 1; i++) {
    const wp = route[i];
    if (dist(u.x, u.y, wp[0], wp[1]) < 3) continue;
    if (stepClear(ctx, u, wp[0], wp[1])) best = i;
    else if (best >= 0) break;
  }
  if (best < 0) {
    u.detour = null;
    return;
  }
  const wp = route[best];
  u.detour = { x: wp[0], y: wp[1], untilTick: ctx.s.tick + DETOUR_TICKS };
}

function detourActive(ctx: Ctx, u: Unit): boolean {
  const dt = u.detour;
  if (!dt) return false;
  if (ctx.s.tick >= dt.untilTick || dist(u.x, u.y, dt.x, dt.y) <= 2) {
    u.detour = null;
    return false;
  }
  return true;
}

/**
 * One step toward (tx, ty) that never leaves walkable space. When a straight step would leave it,
 * or (with `routed`) the straight line to the target is blocked, the unit walks a cached detour
 * waypoint from the nav graph instead of hugging the wall.
 */
export function stepToward(
  ctx: Ctx,
  u: Unit,
  tx: number,
  ty: number,
  speedMul = 1,
  routed = false,
): number {
  const terrain = ctx.world.terrain;
  if (!detourActive(ctx, u) && routed && !clearLine(terrain, ctx.open, u.x, u.y, tx, ty))
    planDetour(ctx, u, tx, ty);
  let dt: Unit['detour'] = u.detour;
  let gx = dt ? dt.x : tx;
  let gy = dt ? dt.y : ty;
  let dx = gx - u.x;
  let dy = gy - u.y;
  let d = Math.sqrt(dx * dx + dy * dy);
  if (d < 0.001) return 0;
  const reach = (u.stats.moveSpeed * speedMul * ctx.t.movement.speedMul) / TPS;
  let step = Math.min(d, reach);
  let nx = u.x + (dx / d) * step;
  let ny = u.y + (dy / d) * step;
  if (!walkable(terrain, ctx.open, nx, ny)) {
    if (!dt) {
      planDetour(ctx, u, tx, ty);
      dt = u.detour;
      if (dt) {
        gx = dt.x;
        gy = dt.y;
        dx = gx - u.x;
        dy = gy - u.y;
        d = Math.sqrt(dx * dx + dy * dy) || 1;
        step = Math.min(d, reach);
        nx = u.x + (dx / d) * step;
        ny = u.y + (dy / d) * step;
      }
    }
    if (!walkable(terrain, ctx.open, nx, ny)) {
      const p = confine(terrain, ctx.open, nx, ny);
      nx = p.x;
      ny = p.y;
    }
  }
  const moved = dist(u.x, u.y, nx, ny);
  u.x = nx;
  u.y = ny;
  return moved;
}

function followPath(ctx: Ctx, u: Unit): boolean {
  if (u.pathI >= u.path.length) return false;
  const wp = u.path[u.pathI];
  const d = dist(u.x, u.y, wp[0], wp[1]);
  // A path that ends inside a Bastion, Throne or obelisk is done once the unit touches it.
  if (u.pathI === u.path.length - 1 && d <= 60 && touchesFixedBody(ctx, u)) {
    u.pathI = u.path.length;
    return true;
  }
  if (d <= ctx.t.movement.arriveDist && u.pathI < u.path.length - 1) {
    u.pathI++;
    return true;
  }
  const moved = stepToward(ctx, u, wp[0], wp[1]);
  if (u.hero) u.hero.distance += moved;
  if (dist(u.x, u.y, wp[0], wp[1]) <= 1 && u.pathI < u.path.length - 1) u.pathI++;
  return true;
}

function underEnemyTower(ctx: Ctx, team: PlayTeam, x: number, y: number): boolean {
  const foe: PlayTeam = team === 'A' ? 'B' : 'A';
  for (const lane of LANES) {
    for (const t of ctx.towers[foe][lane]) {
      if (t?.alive && dist(x, y, t.x, t.y) <= t.stats.range + 12) return true;
    }
  }
  const g = ctx.guardians[foe];
  return !!g && g.alive && dist(x, y, g.x, g.y) <= g.stats.range + 12;
}

function inAttackRange(u: Unit, t: Unit): boolean {
  const pad = t.kind === 'tower' || t.kind === 'guardian' ? 16 : 4;
  return dist(u.x, u.y, t.x, t.y) <= u.stats.range + pad;
}

function tryAttack(ctx: Ctx, u: Unit, t: Unit): void {
  if (u.atkCd > 0) return;
  performAttack(ctx, u, t);
  u.atkCd = Math.max(1, Math.round(TPS / Math.max(0.2, u.stats.atkSpeed)));
}

function validTarget(ctx: Ctx, u: Unit): Unit | null {
  if (u.targetId === null) return null;
  const t = ctx.unit(u.targetId);
  if (!t || !t.alive || t.pendingKill || !isEnemy(u, t) || !isTargetable(ctx, t)) {
    u.targetId = null;
    return null;
  }
  return t;
}

function nearestEnemy(
  ctx: Ctx,
  u: Unit,
  radius: number,
  prefer?: (e: Unit) => number,
): Unit | null {
  let best: Unit | null = null;
  let bestScore = Infinity;
  for (const e of ctx.grid.query(u.x, u.y, radius)) {
    if (!e.alive || e.pendingKill || !isEnemy(u, e) || !isTargetable(ctx, e)) continue;
    if (e.ev?.ghost && !u.hero) continue;
    const s = dist(u.x, u.y, e.x, e.y) + (prefer ? prefer(e) : 0);
    if (s < bestScore) {
      bestScore = s;
      best = e;
    }
  }
  return best;
}

function updateEngage(ctx: Ctx, u: Unit): void {
  const h = u.hero!;
  h.engageTick = ctx.s.tick;
  const pers = ctx.t.personalities[pieceDef(ctx.c, h).personality];
  const m = matchupAt(ctx, u.team as PlayTeam, u.x, u.y, u);
  const prev = h.engage;
  if (m.enemyHeroes === 0) h.engage = 'fight';
  else {
    const hpFactor = Math.min(1, 0.35 + (u.hp / u.stats.maxHp) * 1.3);
    const wary = isWary(ctx, h) ? 0.8 : 1;
    const patience = Math.min(ctx.t.ai.holdBraveCap, 1 + h.holdTicks / ctx.t.ai.holdPatience);
    const committed = h.goal?.kind === 'joinFight' ? ctx.t.ai.commitBonus : 1;
    const eff = m.ratio * pers.riskTaking * patience * hpFactor * wary * committed;
    if (eff >= pers.engageRatio) h.engage = 'fight';
    else if (eff >= pers.engageRatio * 0.5) h.engage = 'hold';
    else h.engage = 'flee';
  }
  h.holdTicks = h.engage === 'hold' ? h.holdTicks + 10 : 0;
  if (h.engage === 'flee' && prev !== 'flee') {
    const b = ctx.world.basePos[u.team as PlayTeam];
    u.path =
      retreatLanePath(ctx, u, b.x, b.y) ?? findPath(ctx.world, { x: u.x, y: u.y }, b, ctx.open);
    u.pathI = 0;
  }
}

function heroBehavior(ctx: Ctx, u: Unit): void {
  const h = u.hero!;
  if (tickRecall(ctx, u)) return;
  const team = u.team as PlayTeam;
  if (ctx.s.tick - h.engageTick >= 10) updateEngage(ctx, u);

  if (h.engage === 'flee') {
    const t = validTarget(ctx, u);
    if (t && inAttackRange(u, t) && u.atkCd <= 0 && t.kind === 'hero') tryAttack(ctx, u, t);
    followPath(ctx, u);
    return;
  }

  let t = validTarget(ctx, u);
  if (!t || (ctx.s.tick + u.id) % 6 === 0) {
    const goalPush = h.goal?.kind === 'pushTower' || h.goal?.kind === 'defendTower';
    const inDanger = underEnemyTower(ctx, team, u.x, u.y);
    const radius = Math.max(ctx.t.ai.aggroRadius, u.stats.range + 20);
    let best: Unit | null = null;
    let bestScore = Infinity;
    for (const e of ctx.grid.query(u.x, u.y, radius)) {
      if (!e.alive || e.pendingKill || !isEnemy(u, e) || !isTargetable(ctx, e)) continue;
      const d = dist(u.x, u.y, e.x, e.y);
      const inRange = d <= u.stats.range + 4;
      if (e.kind === 'hero' && h.engage === 'hold' && !inRange) continue;
      if (!inRange && !goalPush && !inDanger && underEnemyTower(ctx, team, e.x, e.y)) continue;
      let score = d * 0.5;
      if (h.goal?.kind === 'pushTower' && h.goal.targetId === e.id && h.engage === 'fight')
        score -= 130;
      if (e.kind === 'hero') score += hpPct(e) * 60 - 50;
      else if (e.kind === 'minion') score += 20;
      else if (e.kind === 'camp') score += 15;
      else score += 100;
      if (score < bestScore) {
        bestScore = score;
        best = e;
      }
    }
    u.targetId = best ? best.id : null;
    t = best;
  }

  if (t) {
    if (inAttackRange(u, t)) {
      tryAttack(ctx, u, t);
      return;
    }
    const pers = ctx.t.personalities[pieceDef(ctx.c, h).personality];
    const leash = ctx.t.ai.aggroRadius * pers.chase + u.stats.range;
    const allowChase = h.engage === 'fight' && dist(u.x, u.y, t.x, t.y) <= leash;
    if (allowChase) {
      const moved = stepToward(ctx, u, t.x, t.y, 1, true);
      h.distance += moved;
      return;
    }
  }
  if (h.engage === 'hold') return;
  followPath(ctx, u);
}

function minionBehavior(ctx: Ctx, u: Unit): void {
  let t = validTarget(ctx, u);
  if (!t || (ctx.s.tick + u.id) % 6 === 0) {
    t = nearestEnemy(ctx, u, Math.max(90, u.stats.range + 20), (e) =>
      e.kind === 'minion' ? 0 : e.kind === 'hero' ? 25 : 40,
    );
    u.targetId = t ? t.id : null;
  }
  if (t) {
    if (inAttackRange(u, t)) tryAttack(ctx, u, t);
    else stepToward(ctx, u, t.x, t.y, 1, true);
    return;
  }
  followPath(ctx, u);
}

/** Procession bearers, parade demons and the oni. */
function eventUnitBehavior(ctx: Ctx, u: Unit): void {
  const ev = u.ev!;
  if (ev.mode === 'march') {
    minionBehavior(ctx, u);
    return;
  }
  let t = validTarget(ctx, u);
  if (ev.mode === 'passive') {
    // Does not fight unless struck in the last few seconds.
    if (ctx.s.tick - u.lastDamagedTick > 80) {
      u.targetId = null;
      t = null;
    } else if (!t || (ctx.s.tick + u.id) % 6 === 0) {
      t = nearestEnemy(ctx, u, u.stats.range + 40);
      u.targetId = t ? t.id : null;
    }
    if (t && inAttackRange(u, t)) {
      tryAttack(ctx, u, t);
      return;
    }
    followPath(ctx, u);
    return;
  }
  // boss: guards its spot like a camp
  const away = dist(u.x, u.y, ev.homeX, ev.homeY);
  const def = ctx.c.eventById.get(ctx.s.events.find((e) => e.id === ev.eventId)?.defId ?? '');
  const leash = def?.leash ?? 507;
  if (t && away > leash) {
    u.targetId = null;
    t = null;
  }
  if (!t && (ctx.s.tick + u.id) % 6 === 0) {
    t = nearestEnemy(ctx, u, def?.aggro ?? 150);
    u.targetId = t ? t.id : null;
  }
  if (t) {
    if (inAttackRange(u, t)) tryAttack(ctx, u, t);
    else stepToward(ctx, u, t.x, t.y, 1, true);
    return;
  }
  if (away > 6) stepToward(ctx, u, ev.homeX, ev.homeY, 1.4, true);
}

function campBehavior(ctx: Ctx, u: Unit): void {
  const c = u.camp!;
  let t = validTarget(ctx, u);
  const away = dist(u.x, u.y, c.homeX, c.homeY);
  if (t && away > ctx.t.camps.leash) {
    u.targetId = null;
    t = null;
  }
  if (!t && (ctx.s.tick + u.id) % 6 === 0) {
    t = nearestEnemy(ctx, u, ctx.t.camps.aggro);
    u.targetId = t ? t.id : null;
  }
  if (t) {
    if (inAttackRange(u, t)) tryAttack(ctx, u, t);
    else stepToward(ctx, u, t.x, t.y, 1, true);
    return;
  }
  if (away > 6) {
    stepToward(ctx, u, c.homeX, c.homeY, 1.4, true);
    u.hp = Math.min(u.stats.maxHp, u.hp + (u.stats.maxHp * 0.1) / TPS);
  }
}

function staticBehavior(ctx: Ctx, u: Unit): void {
  let t = validTarget(ctx, u);
  if (t && dist(u.x, u.y, t.x, t.y) > u.stats.range + 24) {
    u.targetId = null;
    t = null;
  }
  if (!t || (ctx.s.tick + u.id) % 6 === 0) {
    t = nearestEnemy(ctx, u, u.stats.range + 16, (e) =>
      e.kind === 'minion' ? 0 : e.kind === 'hero' ? 30 : 15,
    );
    u.targetId = t ? t.id : null;
  }
  if (t && inAttackRange(u, t)) tryAttack(ctx, u, t);
}

function guardianBehavior(ctx: Ctx, u: Unit): void {
  const thresholds = ctx.t.guardian.rageThresholds;
  const stage = u.rageStage ?? 0;
  if (stage < thresholds.length && hpPct(u) < thresholds[stage]) {
    u.rageStage = stage + 1;
    u.mods.push({
      id: `rage:${stage}`,
      stat: 'bladeDmg',
      kind: 'mul',
      value: ctx.t.guardian.rageDamageMul,
      source: 'rage',
      tags: [],
      expiresTick: null,
    });
    u.dirty = true;
  }
  staticBehavior(ctx, u);
}

export function stepUnits(ctx: Ctx): void {
  const units = ctx.s.units;
  const n = units.length;
  const start = n > 0 ? ctx.s.tick % n : 0;
  for (let k = 0; k < n; k++) {
    const u = units[(start + k) % n];
    if (!u.alive) continue;
    if (u.atkCd > 0) u.atkCd--;
    if (u.stunUntil !== undefined && u.stunUntil > ctx.s.tick) continue;
    if (u.taunt && u.kind !== 'tower' && u.kind !== 'guardian') {
      const by = tauntTarget(ctx, u);
      if (by) {
        if (u.hero) u.hero.recall = null;
        u.targetId = by.id;
        if (inAttackRange(u, by)) tryAttack(ctx, u, by);
        else stepToward(ctx, u, by.x, by.y, 1, true);
        continue;
      }
    }
    switch (u.kind) {
      case 'hero':
        heroBehavior(ctx, u);
        break;
      case 'minion':
        if (u.ev) eventUnitBehavior(ctx, u);
        else minionBehavior(ctx, u);
        break;
      case 'camp':
        campBehavior(ctx, u);
        break;
      case 'tower':
        staticBehavior(ctx, u);
        break;
      case 'guardian':
        guardianBehavior(ctx, u);
        break;
      default:
        break;
    }
  }
}
