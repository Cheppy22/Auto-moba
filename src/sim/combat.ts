import { dist, clamp } from './core/math';
import { rand } from './core/rng';
import { hpPct, isEnemy, isTargetable, type Ctx } from './ctx';
import type { AbilityDef, DamageType, EffectDef, TriggerDef } from './content/schema';
import { addMod, recompute, triggersOf } from './stats';
import type { Unit } from './types';

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
): number {
  if (!tgt.alive || tgt.pendingKill || raw <= 0) return 0;
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
    fireTriggers(ctx, tgt, 'damaged', { attacker: src ?? undefined, damage: applied });
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
  caster.x = clamp(caster.x + (dx / d) * move * sign, 0, size);
  caster.y = clamp(caster.y + (dy / d) * move * sign, 0, size);
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
    case 'statMod':
      addMod(ctx, target, {
        id: `${ec.origin}:${e.stat}`,
        stat: e.stat,
        kind: e.kind,
        value: e.value,
        source: ec.origin,
        tags: e.tags,
        expiresTick: ctx.s.tick + Math.round(e.durationSec * TPS),
      });
      break;
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

export interface AbilityMods {
  cooldownMul: number;
  powerMul: number;
  rangeMul: number;
  radiusMul: number;
}

export function abilityMods(ctx: Ctx, hero: Unit, idx: number): AbilityMods {
  const m: AbilityMods = { cooldownMul: 1, powerMul: 1, rangeMul: 1, radiusMul: 1 };
  if (!hero.hero) return m;
  for (const id of hero.hero.upgrades) {
    const u = ctx.c.upgradeById.get(id);
    if (u && u.ability === idx) {
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
  const def = ctx.c.heroById.get(h.defId)?.abilities[idx];
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
  for (let i = 3; i >= 0; i--) {
    if (u.hero.cd[i] <= 0) tryCast(ctx, u, i);
  }
}

export interface TriggerEvent {
  victim?: Unit;
  attacker?: Unit;
  damage?: number;
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
  if (def.chance < 1 && rand(ctx.s.rng, 'combat') > def.chance) return;
  if (def.custom) {
    runCustom(ctx, u, def);
  } else {
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

type Custom = (ctx: Ctx, u: Unit, def: TriggerDef) => void;

export const CUSTOM_BEHAVIORS: Record<string, Custom> = {
  outOfCombatDrain: (ctx, u, def) => {
    const quiet =
      ctx.s.tick - u.lastDamagedTick > 80 && ctx.s.tick - (u.hero?.lastDealtTick ?? 0) > 80;
    if (!quiet) return;
    const loss = u.stats.maxHp * (def.param ?? 0.03);
    u.hp = Math.max(1, u.hp - loss);
  },
  reviveOnce: () => {
    // handled by tryRevive() when the holder would die
  },
};

function runCustom(ctx: Ctx, u: Unit, def: TriggerDef): void {
  const fn = def.custom ? CUSTOM_BEHAVIORS[def.custom] : undefined;
  if (fn) fn(ctx, u, def);
}

export function tryRevive(ctx: Ctx, u: Unit): boolean {
  const h = u.hero;
  if (!h || h.revived) return false;
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
  if (a.hero) dmg += (ctx.c.heroById.get(a.defId)?.autoSoulScale ?? 0) * a.stats.soulPower;
  if (a.kind === 'minion' && (t.kind === 'tower' || t.kind === 'guardian'))
    dmg *= ctx.t.minions.structureMul + ctx.t.minions.structureMulPerPhase * (ctx.s.phase.n - 1);
  const origin = a.kind === 'tower' || a.kind === 'guardian' ? a.kind : 'attack';
  dealDamage(ctx, a, t, dmg, a.atkType, origin);
  if (a.hero) fireTriggers(ctx, a, 'hit', { victim: t, damage: dmg });
}

export { HERO_ASSIST_WINDOW };
