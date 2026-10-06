import type { Ctx } from './ctx';
import type { ModDef, Stats, StatKey, TriggerDef } from './content/schema';
import type { Modifier, Unit } from './types';

export interface TrigInst {
  src: string;
  idx: number;
  def: TriggerDef;
}

const trigCache = new WeakMap<Unit, TrigInst[]>();

export function triggersOf(u: Unit): TrigInst[] {
  return trigCache.get(u) ?? [];
}

export const STAT_FLOORS: Partial<Record<StatKey, number>> = {
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
  const mods: TaggedMod[] = [];
  const trigs: TrigInst[] = [];
  const h = u.hero;
  if (!h) return { mods, trigs };
  const hd = ctx.c.heroById.get(h.defId);
  if (hd) hd.passives.forEach((def, idx) => trigs.push({ src: `hero:${hd.id}`, idx, def }));
  for (const id of h.items) {
    const item = ctx.c.itemById.get(id);
    if (item) {
      for (const m of item.mods) mods.push({ ...m, tags: [] });
      item.triggers.forEach((def, idx) => trigs.push({ src: id, idx, def }));
      continue;
    }
    const cursed = ctx.c.cursedById.get(id);
    if (cursed) {
      for (const m of cursed.boons) mods.push({ ...m, tags: ['curse'] });
      cursed.triggers.forEach((def, idx) => trigs.push({ src: id, idx, def }));
      const flaw = cursed.flaws.find((f) => f.id === h.flaws[id]);
      if (flaw) {
        for (const m of flaw.mods) mods.push({ ...m, tags: ['curse'] });
        flaw.triggers.forEach((def, idx) => trigs.push({ src: `${id}:${flaw.id}`, idx, def }));
      }
      continue;
    }
    const holy = ctx.c.holyById.get(id);
    if (holy) {
      for (const m of holy.mods) mods.push({ ...m, tags: ['holy'] });
      holy.triggers.forEach((def, idx) => trigs.push({ src: id, idx, def }));
    }
  }
  const owned: Record<string, number> = {};
  for (const id of h.items) {
    const cat =
      ctx.c.itemById.get(id)?.category ??
      ctx.c.cursedById.get(id)?.category ??
      ctx.c.holyById.get(id)?.category;
    if (cat && !ctx.c.holyById.has(id)) owned[cat] = (owned[cat] ?? 0) + 1;
  }
  for (const [cat, n] of Object.entries(owned)) {
    const tiers = ctx.t.attunement[cat as keyof typeof ctx.t.attunement];
    let best: (typeof tiers)[number] | undefined;
    for (const tier of tiers)
      if (n >= tier.count && (!best || tier.count > best.count)) best = tier;
    if (best) for (const m of best.mods) mods.push({ ...m, tags: [] });
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

export function recompute(ctx: Ctx, u: Unit): void {
  const out: Stats = { ...u.base };
  const growth = u.kind === 'hero' ? 1 + ctx.t.phaseStatGrowth * (ctx.s.phase.n - 1) : 1;
  if (growth !== 1) {
    out.maxHp *= growth;
    out.bladeDmg *= growth;
    out.soulPower *= growth;
  }
  const add: Partial<Record<StatKey, number>> = {};
  const mul: Partial<Record<StatKey, number>> = {};
  const apply = (stat: StatKey, kind: 'add' | 'mul', value: number, tags: string[]): void => {
    const f = tags.length ? tagFactor(ctx, tags) : 1;
    if (kind === 'add') add[stat] = (add[stat] ?? 0) + value * f;
    else mul[stat] = (mul[stat] ?? 1) * ((value - 1) * f + 1);
  };
  const eq = equipment(ctx, u);
  for (const m of eq.mods) apply(m.stat, m.kind, m.value, m.tags);
  for (const m of u.mods) apply(m.stat, m.kind, m.value, m.tags);
  for (const k of Object.keys(out) as StatKey[]) {
    let v = (out[k] + (add[k] ?? 0)) * (mul[k] ?? 1);
    const floor = STAT_FLOORS[k];
    if (floor !== undefined && v < floor) v = floor;
    out[k] = v;
  }
  out.cdr = Math.max(-0.5, Math.min(0.5, out.cdr));
  const oldMax = u.stats.maxHp;
  u.stats = out;
  if (u.alive && oldMax > 0 && oldMax !== out.maxHp) {
    u.hp = Math.min(out.maxHp, (u.hp * out.maxHp) / oldMax);
  }
  if (u.hero) trigCache.set(u, eq.trigs);
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
