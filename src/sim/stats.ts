import type { Ctx } from './ctx';
import type { ModDef, Stats, StatKey, TriggerDef } from './content/schema';
import { perksOf, pieceDef, styleDef } from './pieces';
import { LANE_SPEED_TAG, relicMods } from './relics';
import { TECH_SRC } from './buildTally';
import { gradeMult, gradedTechnique } from './techniques';
import type { Modifier, Unit } from './types';

interface TrigInst {
  src: string;
  idx: number;
  def: TriggerDef;
}

const trigCache = new WeakMap<Unit, TrigInst[]>();

export function triggersOf(u: Unit): TrigInst[] {
  return trigCache.get(u) ?? [];
}

const STAT_FLOORS: Partial<Record<StatKey, number>> = {
  maxHp: 50,
  atkSpeed: 0.2,
  moveSpeed: 12,
  armor: -50,
  resist: -50,
  respawnMult: 0.2,
  incomeMult: 0.1,
  damageTakenMult: 0.2,
};

interface TaggedMod extends ModDef {
  tags: string[];
}

function equipment(ctx: Ctx, u: Unit): { mods: TaggedMod[]; trigs: TrigInst[] } {
  const mods: TaggedMod[] = relicMods(ctx, u);
  const trigs: TrigInst[] = [];
  const h = u.hero;
  if (!h) return { mods, trigs };
  const pd = pieceDef(ctx.c, h);
  pd.passives.forEach((def, idx) => trigs.push({ src: `piece:${pd.id}`, idx, def }));
  const st = styleDef(ctx.c, h);
  if (st) {
    for (const m of st.mods) mods.push({ ...m, tags: [] });
    st.passives.forEach((def, idx) => trigs.push({ src: `style:${pd.id}/${st.id}`, idx, def }));
  }
  perksOf(ctx.c, h).forEach((perk, n) => {
    for (const m of perk.mods) mods.push({ ...m, tags: [] });
    perk.triggers.forEach((def, idx) => trigs.push({ src: `perk:${pd.id}/${n}`, idx, def }));
  });
  for (const held of h.techniques) {
    const def = ctx.c.techniqueById.get(held.id);
    if (!def) continue;
    const g = gradedTechnique(def, gradeMult(ctx.t, held.grade));
    const src = `${TECH_SRC}${def.id}`;
    for (const m of g.mods) mods.push({ ...m, tags: [] });
    g.triggers.forEach((d, idx) => trigs.push({ src, idx, def: d }));
    if (def.dubious) {
      for (const m of def.dubious.mods) mods.push({ ...m, tags: [] });
      def.dubious.triggers.forEach((d, idx) => trigs.push({ src: `${src}:price`, idx, def: d }));
    }
  }
  return { mods, trigs };
}

function tagFactor(ctx: Ctx, tags: string[]): number {
  let f = 1;
  for (const t of tags) {
    const m = ctx.s.tagMult[t];
    if (m !== undefined) f *= m;
  }
  return f;
}

/**
 * A unit's stats from its base, Rank growth, Techniques, perks, relics and live modifiers. Pure: it reads
 * the unit and the match and changes neither (`recompute` stores the result; the fork preview
 * calls it on a copy of the hero).
 */
export function computeStats(ctx: Ctx, u: Unit): { stats: Stats; trigs: TrigInst[] } {
  const out: Stats = { ...u.base };
  if (u.hero && u.hero.rank > 1) {
    // health and the damage stat the piece is built on grow fast, the other damage stat slowly
    // (`ranks.growth`, measured in BALANCE-TECHNIQUES-2026-10-18)
    const steps = u.hero.rank - 1;
    const g = ctx.t.ranks.growth;
    const soulMain = out.soulPower > out.bladeDmg;
    out.maxHp *= 1 + g.health * steps;
    out.bladeDmg *= 1 + (soulMain ? g.other : g.main) * steps;
    out.soulPower *= 1 + (soulMain ? g.main : g.other) * steps;
  }
  const add: Partial<Record<StatKey, number>> = {};
  const mul: Partial<Record<StatKey, number>> = {};
  let laneSpeed = 1;
  const apply = (stat: StatKey, kind: 'add' | 'mul', value: number, tags: string[]): void => {
    if (stat === 'moveSpeed' && kind === 'mul' && tags.includes(LANE_SPEED_TAG)) {
      laneSpeed *= value;
      return;
    }
    const f = tags.length ? tagFactor(ctx, tags) : 1;
    if (kind === 'add') add[stat] = (add[stat] ?? 0) + value * f;
    else mul[stat] = (mul[stat] ?? 1) * ((value - 1) * f + 1);
  };
  const eq = equipment(ctx, u);
  for (const m of eq.mods) apply(m.stat, m.kind, m.value, m.tags);
  for (const m of u.mods) apply(m.stat, m.kind, m.value, m.tags);
  if (laneSpeed !== 1)
    mul.moveSpeed = (mul.moveSpeed ?? 1) * Math.min(1 + ctx.t.relics.laneSpeedCap, laneSpeed);
  for (const k of Object.keys(out) as StatKey[]) {
    let v = (out[k] + (add[k] ?? 0)) * (mul[k] ?? 1);
    const floor = STAT_FLOORS[k];
    if (floor !== undefined && v < floor) v = floor;
    out[k] = v;
  }
  out.cdr = Math.max(-0.5, Math.min(0.5, out.cdr));
  return { stats: out, trigs: eq.trigs };
}

export function recompute(ctx: Ctx, u: Unit): void {
  const { stats: out, trigs } = computeStats(ctx, u);
  const oldMax = u.stats.maxHp;
  u.stats = out;
  if (u.alive && oldMax > 0 && oldMax !== out.maxHp) {
    u.hp = Math.min(out.maxHp, (u.hp * out.maxHp) / oldMax);
  }
  if (u.hero) trigCache.set(u, trigs);
  u.dirty = false;
}

export function addMod(_ctx: Ctx, u: Unit, mod: Modifier): void {
  const i = u.mods.findIndex((m) => m.id === mod.id);
  if (i >= 0) u.mods[i] = mod;
  else u.mods.push(mod);
  u.dirty = true;
}

export function dirtyAll(ctx: Ctx): void {
  for (const u of ctx.s.units) u.dirty = true;
}
