import { dist, clamp } from './core/math';
import { rand } from './core/rng';
import { hpPct, isEnemy, isTargetable, type Ctx } from './ctx';
import type { AbilityDef, DamageType, EffectDef, TriggerDef } from './content/schema';
import { kitOf, perksOf, pieceDef } from './pieces';
import { addMod, recompute, triggersOf } from './stats';
import type { Unit } from './types';
import { confine, walkable } from './world/terrain';

const HERO_ASSIST_WINDOW = 160;
export const TPS = 20;

export function amountOf(
  e: { base: number; bladeScale: number; soulScale: number },
  caster: Unit | null,
  powerMul: number,
): number {
  const b = caster ? caster.stats.bladeDmg : 0;
  const s = caster ? caster.stats.soulPower : 0;
  return (e.base + e.bladeScale * b + e.soulScale * s) * powerMul;
}

export function mitigate(target: Unit, raw: number, dtype: DamageType): number {
  let out = raw;
  if (dtype === 'blade') out = (raw * 100) / (100 + Math.max(-50, target.stats.armor));
  else if (dtype === 'soul') out = (raw * 100) / (100 + Math.max(-50, target.stats.resist));
  return out * target.stats.damageTakenMult;
}

function recordDamage(
  ctx: Ctx,
  src: Unit | null,
  tgt: Unit,
  amount: number,
  dtype: DamageType,
  origin: string,
  lethal: boolean,
): void {
  const heroInvolved = tgt.kind === 'hero' || (src !== null && src.kind === 'hero');
  if (heroInvolved) {
    ctx.emit('damage', {
      src: src ? src.id : 0,
      tgt: tgt.id,
      srcKind: src ? src.kind : 'none',
      tgtKind: tgt.kind,
      srcTeam: src ? src.team : 'none',
      tgtTeam: tgt.team,
      amount: Math.round(amount * 10) / 10,
      dtype,
      origin,
      lethal,
    });
    return;
  }
  const key = `${src ? src.team : 'none'}|${tgt.kind}`;
  const b = ctx.buckets.get(key);
  if (b) {
    b.amount += amount;
    b.count += 1;
  } else {
    ctx.buckets.set(key, {
      srcTeam: src ? src.team : 'none',
      tgtKind: tgt.kind,
      amount,
      count: 1,
    });
  }
}

export function dealDamage(
  ctx: Ctx,
  src: Unit | null,
  tgt: Unit,
  raw: number,
  dtype: DamageType,
  origin: string,
  /** Pawn Sacrifice: the hit is not held to the structure's per-second damage cap. */
  ignoreCap = false,
): number {
  if (!tgt.alive || tgt.pendingKill || raw <= 0) return 0;
  const structure = tgt.kind === 'tower' || tgt.kind === 'guardian';
  if (src?.kind === 'hero' && structure) {
    raw *= ctx.t.tower.heroDamageMul;
    const sm = src.hero!.structMul;
    if (sm && sm.untilTick > ctx.s.tick) raw *= sm.value;
  }
  if (tgt.kind === 'guardian') raw *= ctx.s.tagMult.throneDamage ?? 1;
  if (src && src.team !== 'neutral' && ctx.s.check[src.team]) raw *= ctx.t.check.damageMul;
  if (src && src.team !== 'neutral') {
    const td = ctx.s.teamDamage[src.team];
    if (td && td.untilTick > ctx.s.tick) raw *= td.value;
  }
  let dmg = Math.max(1, mitigate(tgt, raw, dtype));
  let absorbed = 0;
  if (tgt.shields.length) {
    for (const sh of tgt.shields) {
      if (dmg <= 0) break;
      const take = Math.min(sh.amount, dmg);
      sh.amount -= take;
      dmg -= take;
      absorbed += take;
    }
    tgt.shields = tgt.shields.filter((sh) => sh.amount > 0);
  }
  if (!ignoreCap && (tgt.kind === 'tower' || tgt.kind === 'guardian')) {
    const w = tgt.structWindow ?? (tgt.structWindow = { tick: ctx.s.tick, taken: 0 });
    if (ctx.s.tick - w.tick >= TPS) {
      w.tick = ctx.s.tick;
      w.taken = 0;
    }
    const room = Math.max(0, tgt.stats.maxHp * ctx.t.tower.maxHpPerSec - w.taken);
    dmg = Math.min(dmg, room);
    w.taken += dmg;
    if (dmg <= 0) return 0;
  }
  const applied = dmg;
  if (applied > 0) tgt.hp -= applied;
  tgt.lastDamagedTick = ctx.s.tick;
  if (tgt.hero) {
    tgt.hero.lastDamagedTick = ctx.s.tick;
    if (src && src.kind === 'hero') {
      const list = tgt.hero.attackers;
      const e = list.find((a) => a.id === src.id);
      if (e) e.tick = ctx.s.tick;
      else list.push({ id: src.id, tick: ctx.s.tick });
    }
  }
  if (src && src.hero) src.hero.lastDealtTick = ctx.s.tick;
  const lethal = tgt.hp <= 0;
  recordDamage(ctx, src, tgt, applied + absorbed, dtype, origin, lethal);
  if (lethal) tgt.pendingKill = { killerId: src ? src.id : 0 };
  if (tgt.hero && !lethal)
    fireTriggers(ctx, tgt, 'damaged', {
      attacker: src ?? undefined,
      damage: applied,
      dtype,
    });
  return applied + absorbed;
}

export function healUnit(
  ctx: Ctx,
  src: Unit | null,
  tgt: Unit,
  amount: number,
  origin: string,
  log = true,
): number {
  if (!tgt.alive || amount <= 0) return 0;
  const mult = ctx.s.tagMult.heal ?? 1;
  const want = amount * mult;
  const before = tgt.hp;
  tgt.hp = Math.min(tgt.stats.maxHp, tgt.hp + want);
  const done = tgt.hp - before;
  if (done > 0.5 && log && (tgt.kind === 'hero' || (src && src.kind === 'hero'))) {
    ctx.emit('heal', {
      src: src ? src.id : 0,
      tgt: tgt.id,
      amount: Math.round(done * 10) / 10,
      origin,
    });
  }
  return done;
}

interface EffectCtx {
  caster: Unit;
  target: Unit;
  powerMul: number;
  origin: string;
  damage?: number;
}

function moveDash(
  ctx: Ctx,
  caster: Unit,
  target: Unit,
  e: Extract<EffectDef, { type: 'dash' }>,
): void {
  const dx = target.x - caster.x;
  const dy = target.y - caster.y;
  const d = Math.sqrt(dx * dx + dy * dy) || 1;
  let move = e.distance;
  if (e.toward === 'target')
    move = Math.max(0, Math.min(e.distance, d - Math.max(8, caster.atkRange * 0.6)));
  const sign = e.toward === 'target' ? 1 : -1;
  const size = ctx.world.map.size;
  const ex = clamp(caster.x + (dx / d) * move * sign, 0, size);
  const ey = clamp(caster.y + (dy / d) * move * sign, 0, size);
  const terrain = ctx.world.terrain;
  const sx = caster.x;
  const sy = caster.y;
  const n = Math.max(1, Math.ceil(move / 4));
  if (e.leap || caster.hero?.defId === 'knight') {
    // A leap clears solid terrain and lands on the walkable point nearest the end of its arc.
    for (let i = n; i >= 1; i--) {
      const px = sx + ((ex - sx) * i) / n;
      const py = sy + ((ey - sy) * i) / n;
      if (walkable(terrain, ctx.open, px, py)) {
        caster.x = px;
        caster.y = py;
        break;
      }
    }
    caster.path = [];
    caster.detour = null;
    return;
  }
  // A dash stops at the last walkable point of its line: no running through solid terrain.
  for (let i = 1; i <= n; i++) {
    const px = sx + ((ex - sx) * i) / n;
    const py = sy + ((ey - sy) * i) / n;
    if (!walkable(terrain, ctx.open, px, py)) break;
    caster.x = px;
    caster.y = py;
  }
  if (!walkable(terrain, ctx.open, caster.x, caster.y)) {
    const p = confine(terrain, ctx.open, caster.x, caster.y);
    caster.x = p.x;
    caster.y = p.y;
  }
  caster.path = [];
}

export function applyEffect(ctx: Ctx, e: EffectDef, ec: EffectCtx): void {
  const { caster, target } = ec;
  switch (e.type) {
    case 'damage':
      dealDamage(ctx, caster, target, amountOf(e, caster, ec.powerMul), e.dmgType, ec.origin);
      break;
    case 'heal': {
      let amt = amountOf(e, caster, ec.powerMul) + e.maxHpPct * target.stats.maxHp;
      if (e.fractionOfDamage && ec.damage) amt += e.fractionOfDamage * ec.damage;
      healUnit(ctx, caster, target, amt, ec.origin);
      break;
    }
    case 'shield':
      target.shields.push({
        amount: amountOf(e, caster, ec.powerMul),
        expiresTick: ctx.s.tick + Math.round(e.durationSec * TPS),
      });
      break;
    case 'statMod': {
      const id = `${ec.origin}:${e.stat}`;
      let value = e.value;
      if (e.maxStacks) {
        const prev = target.mods.find((m) => m.id === id);
        if (prev) {
          const base = e.kind === 'mul' ? 1 : 0;
          const step = e.value - base;
          value = base + Math.min(prev.value - base + step, step * e.maxStacks);
        }
      }
      addMod(ctx, target, {
        id,
        stat: e.stat,
        kind: e.kind,
        value,
        source: ec.origin,
        tags: e.tags,
        expiresTick: ctx.s.tick + Math.round(e.durationSec * TPS),
      });
      break;
    }
    case 'dot': {
      const dps = amountOf(e, caster, ec.powerMul);
      const existing = target.dots.find((d) => d.sourceId === caster.id && d.origin === ec.origin);
      const endTick = ctx.s.tick + Math.round(e.durationSec * TPS);
      if (existing) {
        existing.dps = dps;
        existing.endTick = endTick;
      } else
        target.dots.push({
          dtype: e.dmgType,
          dps,
          endTick,
          sourceId: caster.id,
          origin: ec.origin,
        });
      break;
    }
    case 'dash':
      moveDash(ctx, caster, target, e);
      break;
    case 'stun':
      stunUnit(ctx, target, e.durationSec);
      break;
    case 'taunt':
      if (target.team !== caster.team) {
        const until = ctx.s.tick + Math.round(e.durationSec * TPS);
        target.taunt = { by: caster.id, untilTick: until };
        target.targetId = caster.id;
      }
      break;
    case 'aura': {
      const near = ctx.grid.query(caster.x, caster.y, e.radius);
      for (const u of near) {
        if (!u.alive) continue;
        const same = u.team === caster.team;
        if ((e.target === 'ally') !== same) continue;
        addMod(ctx, u, {
          id: `aura:${caster.id}:${e.stat}`,
          stat: e.stat,
          kind: e.kind,
          value: e.value,
          source: ec.origin,
          tags: [],
          expiresTick: ctx.s.tick + TPS * 2,
        });
      }
      break;
    }
  }
}

/** No moving, attacking or casting until the stun ends (a longer stun wins). */
export function stunUnit(ctx: Ctx, u: Unit, sec: number): void {
  if (u.kind === 'tower' || u.kind === 'guardian') return;
  const until = ctx.s.tick + Math.round(sec * TPS);
  u.stunUntil = Math.max(u.stunUntil ?? 0, until);
  if (u.hero?.recall) u.hero.recall = null;
}

/** The unit a taunted unit must attack, or null when no taunt holds. */
export function tauntTarget(ctx: Ctx, u: Unit): Unit | null {
  const t = u.taunt;
  if (!t) return null;
  const by = ctx.unit(t.by);
  if (t.untilTick <= ctx.s.tick || !by || !by.alive) {
    u.taunt = undefined;
    return null;
  }
  return by;
}

export interface AbilityMods {
  cooldownMul: number;
  powerMul: number;
  rangeMul: number;
  radiusMul: number;
}

export function abilityMods(ctx: Ctx, hero: Unit, idx: number): AbilityMods {
  const m: AbilityMods = { cooldownMul: 1, powerMul: 1, rangeMul: 1, radiusMul: 1 };
  if (!hero.hero) return m;
  for (const u of perksOf(ctx.c, hero.hero)) {
    if (u.ability === idx) {
      m.cooldownMul *= u.cooldownMul;
      m.powerMul *= u.powerMul;
      m.rangeMul *= u.rangeMul;
      m.radiusMul *= u.radiusMul;
    }
  }
  return m;
}

const ENEMY_KINDS = new Set(['hero', 'minion', 'camp']);

function enemiesNear(ctx: Ctx, from: Unit, radius: number, cx = from.x, cy = from.y): Unit[] {
  const out: Unit[] = [];
  for (const u of ctx.grid.query(cx, cy, radius)) {
    if (u.alive && isEnemy(from, u) && ENEMY_KINDS.has(u.kind) && isTargetable(ctx, u)) out.push(u);
  }
  return out;
}

function pickEnemy(list: Unit[], from: Unit, heroOnly: boolean): Unit | null {
  let best: Unit | null = null;
  let bestScore = Infinity;
  for (const u of list) {
    if (heroOnly && u.kind !== 'hero') continue;
    const d = dist(from.x, from.y, u.x, u.y);
    const score = d + (u.kind === 'hero' ? -40 : u.kind === 'camp' ? 5 : 0) + hpPct(u) * 20;
    if (score < bestScore) {
      bestScore = score;
      best = u;
    }
  }
  return best;
}

export function tryCast(ctx: Ctx, u: Unit, idx: number): boolean {
  const h = u.hero;
  if (!h) return false;
  const def = kitOf(ctx.c, h)[idx];
  if (!def || h.cd[idx] > 0) return false;
  const mods = abilityMods(ctx, u, idx);
  const range = def.range * mods.rangeMul;
  const radius = def.radius * mods.radiusMul;
  const cond = def.condition;
  let targets: Unit[] = [];
  let enemiesCount = 0;
  let enemyHeroes = 0;
  switch (def.target) {
    case 'self': {
      targets = [u];
      const near = enemiesNear(ctx, u, radius > 0 ? radius : range > 0 ? range : 120);
      enemiesCount = near.length;
      enemyHeroes = near.filter((e) => e.kind === 'hero').length;
      break;
    }
    case 'enemy': {
      const t = pickEnemy(enemiesNear(ctx, u, range), u, cond.heroTargetOnly === true);
      if (!t) return false;
      targets = [t];
      enemiesCount = 1;
      enemyHeroes = t.kind === 'hero' ? 1 : 0;
      break;
    }
    case 'enemyArea': {
      targets = enemiesNear(ctx, u, radius);
      enemiesCount = targets.length;
      enemyHeroes = targets.filter((e) => e.kind === 'hero').length;
      break;
    }
    case 'enemyBurst': {
      const near = enemiesNear(ctx, u, range);
      const centre = pickEnemy(near, u, cond.heroTargetOnly === true);
      if (!centre) return false;
      targets = enemiesNear(ctx, u, radius, centre.x, centre.y);
      enemiesCount = targets.length;
      enemyHeroes = targets.filter((e) => e.kind === 'hero').length;
      break;
    }
    case 'allyArea': {
      for (const a of ctx.grid.query(u.x, u.y, radius)) {
        if (a.alive && a.team === u.team && a.kind === 'hero') targets.push(a);
      }
      break;
    }
    case 'lowestAlly': {
      let best: Unit | null = null;
      for (const a of ctx.grid.query(u.x, u.y, range)) {
        if (a.alive && a.team === u.team && a.kind === 'hero' && (!best || hpPct(a) < hpPct(best)))
          best = a;
      }
      if (best) targets = [best];
      break;
    }
  }
  if (def.target === 'allyArea' || def.target === 'lowestAlly') {
    // Ally skills still check the enemies around the caster (minEnemies / minEnemyHeroes).
    const near = enemiesNear(ctx, u, Math.max(radius, range, 120));
    enemiesCount = near.length;
    enemyHeroes = near.filter((e) => e.kind === 'hero').length;
  }
  if (targets.length === 0) return false;
  if (cond.minEnemies !== undefined && enemiesCount < cond.minEnemies) return false;
  if (cond.minEnemyHeroes !== undefined && enemyHeroes < cond.minEnemyHeroes) return false;
  if (cond.selfHpBelow !== undefined && hpPct(u) >= cond.selfHpBelow) return false;
  if (cond.allyHpBelow !== undefined && !targets.some((t) => hpPct(t) < cond.allyHpBelow!))
    return false;
  castOn(ctx, u, def, targets, mods);
  const cdTicks = Math.round(def.cooldownSec * mods.cooldownMul * (1 - u.stats.cdr) * TPS);
  h.cd[idx] = Math.max(10, cdTicks);
  return true;
}

function castOn(ctx: Ctx, u: Unit, def: AbilityDef, targets: Unit[], mods: AbilityMods): void {
  const origin = `ability:${def.id}`;
  const primary = targets[0];
  for (const eff of def.effects) {
    if (eff.type === 'dash') {
      applyEffect(ctx, eff, { caster: u, target: primary, powerMul: mods.powerMul, origin });
      continue;
    }
    for (const t of targets) {
      if (!t.alive) continue;
      applyEffect(ctx, eff, { caster: u, target: t, powerMul: mods.powerMul, origin });
    }
  }
}

export function castAbilities(ctx: Ctx, u: Unit): void {
  if (!u.hero || !u.alive || u.hero.recall) return;
  if (u.stunUntil !== undefined && u.stunUntil > ctx.s.tick) return;
  for (let i = 3; i >= 0; i--) {
    if (u.hero.cd[i] <= 0) tryCast(ctx, u, i);
  }
}

export interface TriggerEvent {
  victim?: Unit;
  attacker?: Unit;
  damage?: number;
  dtype?: DamageType;
}

function resolveTrigTargets(ctx: Ctx, u: Unit, def: TriggerDef, ev: TriggerEvent): Unit[] {
  switch (def.target) {
    case 'self':
      return [u];
    case 'victim':
      return ev.victim ? [ev.victim] : [];
    case 'attacker':
      return ev.attacker ? [ev.attacker] : [];
    case 'enemyArea':
      return enemiesNear(ctx, u, def.radius);
    case 'nearestEnemyHero': {
      let best: Unit | null = null;
      let bestD = Infinity;
      for (const e of enemiesNear(ctx, u, def.radius || 400)) {
        if (e.kind !== 'hero') continue;
        const d = dist(u.x, u.y, e.x, e.y);
        if (d < bestD) {
          bestD = d;
          best = e;
        }
      }
      return best ? [best] : [];
    }
    case 'allyArea': {
      const out: Unit[] = [];
      for (const a of ctx.grid.query(u.x, u.y, def.radius)) {
        if (a.alive && a.team === u.team && a.kind === 'hero') out.push(a);
      }
      return out;
    }
  }
}

export function runTrigger(
  ctx: Ctx,
  u: Unit,
  src: string,
  idx: number,
  def: TriggerDef,
  ev: TriggerEvent,
): void {
  const h = u.hero;
  if (!h) return;
  const key = `${src}#${idx}`;
  if (def.on !== 'periodic' && def.cooldownSec > 0) {
    if ((h.trigCd[key] ?? 0) > ctx.s.tick) return;
  }
  if (def.vs) {
    const other = def.on === 'damaged' ? ev.attacker : ev.victim;
    if (!other || (def.vs === 'hero') !== (other.kind === 'hero')) return;
  }
  if (def.ofType && ev.dtype !== def.ofType) return;
  if (def.on !== 'lowHp' && def.hpBelow !== undefined && hpPct(u) >= def.hpBelow) return;
  if (def.everyNth) {
    const nKey = `${key}:n`;
    const n = (h.trigCd[nKey] ?? 0) + 1;
    h.trigCd[nKey] = n >= def.everyNth ? 0 : n;
    if (n < def.everyNth) return;
  }
  if (def.chance < 1 && rand(ctx.s.rng, 'combat') > def.chance) return;
  const proceed = def.custom ? runCustom(ctx, u, def, ev) : true;
  if (proceed) {
    const targets = resolveTrigTargets(ctx, u, def, ev);
    for (const t of targets) {
      if (!t.alive) continue;
      for (const eff of def.effects) {
        applyEffect(ctx, eff, {
          caster: u,
          target: t,
          powerMul: 1,
          origin: `item:${src}`,
          damage: ev.damage,
        });
      }
    }
  }
  if (def.cooldownSec > 0 && def.on !== 'periodic')
    h.trigCd[key] = ctx.s.tick + Math.round(def.cooldownSec * TPS);
}

export function fireTriggers(ctx: Ctx, u: Unit, on: TriggerDef['on'], ev: TriggerEvent): void {
  if (!u.hero) return;
  for (const t of triggersOf(u)) {
    if (t.def.on === on) runTrigger(ctx, u, t.src, t.idx, t.def, ev);
  }
}

export function tickPeriodicTriggers(ctx: Ctx, u: Unit): void {
  const h = u.hero;
  if (!h || !u.alive) return;
  for (const t of triggersOf(u)) {
    const d = t.def;
    if (d.on === 'periodic') {
      const key = `${t.src}#${t.idx}`;
      const next = h.trigCd[key];
      if (next === undefined) {
        h.trigCd[key] = ctx.s.tick + Math.round((d.everySec ?? 1) * TPS);
      } else if (ctx.s.tick >= next) {
        h.trigCd[key] = ctx.s.tick + Math.round((d.everySec ?? 1) * TPS);
        runTrigger(ctx, u, t.src, t.idx, d, {});
      }
    } else if (d.on === 'lowHp' && d.hpBelow !== undefined && !d.custom) {
      if (hpPct(u) < d.hpBelow) runTrigger(ctx, u, t.src, t.idx, d, {});
    }
  }
}

/** Returns true when the trigger's own effects should run afterwards. */
type Custom = (ctx: Ctx, u: Unit, def: TriggerDef, ev: TriggerEvent) => boolean | void;

function quietFor(ctx: Ctx, u: Unit, sec: number): boolean {
  const ticks = sec * TPS;
  return (
    ctx.s.tick - u.lastDamagedTick > ticks && ctx.s.tick - (u.hero?.lastDealtTick ?? 0) > ticks
  );
}

export const CUSTOM_BEHAVIORS: Record<string, Custom> = {
  outOfCombatDrain: (ctx, u, def) => {
    if (!quietFor(ctx, u, 4)) return;
    const loss = u.stats.maxHp * (def.param ?? 0.03);
    u.hp = Math.max(1, u.hp - loss);
  },
  reviveOnce: () => {
    // handled by tryRevive() when the holder would die
  },
  lastStand: () => {
    // handled by tryRevive() when the holder would die
  },
  outOfCombat: (ctx, u, def) => quietFor(ctx, u, def.param ?? 3),
  inCombat: (ctx, u, def) => !quietFor(ctx, u, def.param ?? 4),
  execute: (ctx, u, def, ev) => {
    const v = ev.victim;
    if (!v || v.kind !== 'hero' || !v.alive || hpPct(v) >= (def.param ?? 0.15)) return;
    const shield = v.shields.reduce((a, s) => a + s.amount, 0);
    dealDamage(ctx, u, v, v.hp + shield, 'true', 'item:execute');
  },
  cooldownTick: (ctx, u, def) => {
    const h = u.hero;
    if (h) h.cd = h.cd.map((c) => Math.max(0, c - (def.param ?? 1) * TPS));
    return true;
  },
  payHp: (_ctx, u, def) => {
    u.hp = Math.max(1, u.hp - (def.param ?? 10));
  },
  payPct: (_ctx, u, def) => {
    u.hp = Math.max(1, u.hp - u.stats.maxHp * (def.param ?? 0.02));
  },
};

function runCustom(ctx: Ctx, u: Unit, def: TriggerDef, ev: TriggerEvent): boolean {
  const fn = def.custom ? CUSTOM_BEHAVIORS[def.custom] : undefined;
  return fn ? fn(ctx, u, def, ev) === true : false;
}

export function tryRevive(ctx: Ctx, u: Unit): boolean {
  const h = u.hero;
  if (!h) return false;
  const stand = triggersOf(u).find((x) => x.def.custom === 'lastStand');
  if (stand && !h.lastStandUsed) {
    h.lastStandUsed = true;
    u.pendingKill = null;
    u.hp = 1;
    for (const eff of stand.def.effects)
      applyEffect(ctx, eff, { caster: u, target: u, powerMul: 1, origin: `item:${stand.src}` });
    ctx.emit('heal', { src: u.id, tgt: u.id, amount: 1, origin: 'lastStand' });
    return true;
  }
  if (h.revived) return false;
  const t = triggersOf(u).find((x) => x.def.custom === 'reviveOnce');
  if (!t) return false;
  h.revived = true;
  u.pendingKill = null;
  u.hp = u.stats.maxHp * (t.def.param ?? 0.4);
  u.shields = [];
  ctx.emit('heal', { src: u.id, tgt: u.id, amount: Math.round(u.hp), origin: 'revive' });
  return true;
}

export function tickDots(ctx: Ctx, u: Unit): void {
  if (u.dots.length === 0) return;
  for (const d of u.dots) {
    const src = ctx.unit(d.sourceId) ?? null;
    dealDamage(ctx, src, u, d.dps / TPS, d.dtype, d.origin);
  }
  u.dots = u.dots.filter((d) => d.endTick > ctx.s.tick);
}

export function cleanExpired(ctx: Ctx, u: Unit): void {
  if (u.mods.length) {
    const before = u.mods.length;
    u.mods = u.mods.filter((m) => m.expiresTick === null || m.expiresTick > ctx.s.tick);
    if (u.mods.length !== before) u.dirty = true;
  }
  if (u.shields.length)
    u.shields = u.shields.filter((s) => s.expiresTick > ctx.s.tick && s.amount > 0);
  if (u.dirty) recompute(ctx, u);
}

export function performAttack(ctx: Ctx, a: Unit, t: Unit): void {
  let dmg = a.atkType === 'soul' ? a.stats.soulPower || a.stats.bladeDmg : a.stats.bladeDmg;
  if (a.hero) dmg += pieceDef(ctx.c, a.hero).autoSoulScale * a.stats.soulPower;
  if (a.kind === 'minion' && (t.kind === 'tower' || t.kind === 'guardian'))
    dmg *= a.pawn
      ? ctx.t.pawns.structureMul
      : ctx.t.minions.structureMul + ctx.t.minions.structureMulPerPhase * (ctx.s.phase.n - 1);
  const origin = a.kind === 'tower' || a.kind === 'guardian' ? a.kind : 'attack';
  dealDamage(ctx, a, t, dmg, a.atkType, origin);
  if (a.hero) fireTriggers(ctx, a, 'hit', { victim: t, damage: dmg });
}

export { HERO_ASSIST_WINDOW };
