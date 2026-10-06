import { TPS, performAttack } from './combat';
import { dist } from './core/math';
import { hpPct, isEnemy, isTargetable, type Ctx } from './ctx';
import { matchupAt } from './ai/power';
import { retreatLanePath } from './ai/strategic';
import { findPath, LANES } from './world/map';
import { tickRecall } from './recall';
import type { PlayTeam, Unit } from './types';

function openSet(ctx: Ctx): Set<string> {
  const out = new Set<string>();
  for (const s of ctx.s.slots) if (s.open) out.add(s.id);
  return out;
}

export function stepToward(_ctx: Ctx, u: Unit, tx: number, ty: number, speedMul = 1): number {
  const dx = tx - u.x;
  const dy = ty - u.y;
  const d = Math.sqrt(dx * dx + dy * dy);
  if (d < 0.001) return 0;
  const step = Math.min(d, (u.stats.moveSpeed * speedMul) / TPS);
  u.x += (dx / d) * step;
  u.y += (dy / d) * step;
  return step;
}

function followPath(ctx: Ctx, u: Unit): boolean {
  if (u.pathI >= u.path.length) return false;
  const wp = u.path[u.pathI];
  const d = dist(u.x, u.y, wp[0], wp[1]);
  if (d <= ctx.t.movement.arriveDist && u.pathI < u.path.length - 1) {
    u.pathI++;
    return true;
  }
  const moved = stepToward(ctx, u, wp[0], wp[1]);
  if (u.hero) u.hero.distance += moved;
  if (d - moved <= 1 && u.pathI < u.path.length - 1) u.pathI++;
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
  const def = ctx.c.heroById.get(h.defId)!;
  const pers = ctx.t.personalities[def.personality];
  const m = matchupAt(ctx, u.team as PlayTeam, u.x, u.y, u);
  const prev = h.engage;
  if (m.enemyHeroes === 0) h.engage = 'fight';
  else {
    const eff = m.ratio * pers.riskTaking * (1 + h.holdTicks / ctx.t.ai.holdPatience);
    if (eff >= pers.engageRatio) h.engage = 'fight';
    else if (eff >= pers.engageRatio * 0.5) h.engage = 'hold';
    else h.engage = 'flee';
  }
  h.holdTicks = h.engage === 'hold' ? h.holdTicks + 10 : 0;
  if (h.engage === 'flee' && prev !== 'flee') {
    const b = ctx.world.basePos[u.team as PlayTeam];
    u.path =
      retreatLanePath(ctx, u, b.x, b.y) ?? findPath(ctx.world, { x: u.x, y: u.y }, b, openSet(ctx));
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
    const def = ctx.c.heroById.get(h.defId)!;
    const pers = ctx.t.personalities[def.personality];
    const leash = ctx.t.ai.aggroRadius * pers.chase + u.stats.range;
    const allowChase = h.engage === 'fight' && dist(u.x, u.y, t.x, t.y) <= leash;
    if (allowChase) {
      const moved = stepToward(ctx, u, t.x, t.y);
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
    else stepToward(ctx, u, t.x, t.y);
    return;
  }
  followPath(ctx, u);
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
    else stepToward(ctx, u, t.x, t.y);
    return;
  }
  if (away > 6) {
    stepToward(ctx, u, c.homeX, c.homeY, 1.4);
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
  if (!u.roaming) {
    staticBehavior(ctx, u);
    return;
  }
  let t = validTarget(ctx, u);
  if (!t || (ctx.s.tick + u.id) % 6 === 0) {
    t = nearestEnemy(ctx, u, u.stats.range + 30, (e) =>
      e.kind === 'minion' ? 0 : e.kind === 'hero' ? 30 : 10,
    );
    u.targetId = t ? t.id : null;
  }
  if (t) {
    if (inAttackRange(u, t)) tryAttack(ctx, u, t);
    else stepToward(ctx, u, t.x, t.y);
    return;
  }
  followPath(ctx, u);
}

export function stepUnits(ctx: Ctx): void {
  const units = ctx.s.units;
  const n = units.length;
  const start = n > 0 ? ctx.s.tick % n : 0;
  for (let k = 0; k < n; k++) {
    const u = units[(start + k) % n];
    if (!u.alive) continue;
    if (u.atkCd > 0) u.atkCd--;
    switch (u.kind) {
      case 'hero':
        heroBehavior(ctx, u);
        break;
      case 'minion':
        minionBehavior(ctx, u);
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
