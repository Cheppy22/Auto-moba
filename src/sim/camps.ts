import { TPS } from './combat';
import { pick, rand, weightedPick } from './core/rng';
import type { Ctx } from './ctx';
import type { CampTypeDef, BiomeDef, Stats } from './content/schema';
import { giveGold } from './shop';
import { addMod } from './stats';
import { healUnit } from './combat';
import { newUnit } from './units';
import type { SlotState, Unit } from './types';

function biomeOf(ctx: Ctx, slot: SlotState): BiomeDef | null {
  return slot.biomeId ? (ctx.c.biomeById.get(slot.biomeId) ?? null) : null;
}

function rollType(ctx: Ctx, biome: BiomeDef): string {
  const phase = ctx.s.phase.n;
  const row =
    biome.campTable.find((r) => phase >= r.phaseMin && phase <= r.phaseMax) ?? biome.campTable[0];
  return weightedPick(ctx.s.rng, 'mapgen', row.types, (t) => t.weight).id;
}

function campStats(ctx: Ctx, t: CampTypeDef): Stats {
  const g = 1 + ctx.t.waves.scalePerPhase * (ctx.s.phase.n - 1);
  return {
    maxHp: t.hp * g,
    hpRegen: 0,
    armor: t.armor,
    resist: t.resist,
    bladeDmg: t.damage * g,
    atkSpeed: t.atkSpeed,
    soulPower: t.damageType === 'soul' ? t.damage * g : 0,
    moveSpeed: 40,
    cdr: 0,
    range: t.range,
    respawnMult: 1,
    incomeMult: 1,
    damageTakenMult: 1,
  };
}

function spawnSpot(ctx: Ctx, slot: SlotState, spot: number): void {
  const biome = biomeOf(ctx, slot);
  if (!biome) return;
  const type = biome.campTypes.find((t) => t.id === slot.types[spot]);
  const pos = biome.camps[spot];
  const sdef = ctx.world.map.slots.find((s) => s.id === slot.id)!;
  if (!type || !pos) return;
  const sign = slot.mirrored ? -1 : 1;
  const hx = sdef.x + pos.dx * sign;
  const hy = sdef.y + pos.dy * sign;
  const ids: number[] = [];
  for (let i = 0; i < type.count; i++) {
    const ox = type.count > 1 ? (i - (type.count - 1) / 2) * 14 : 0;
    const u = newUnit(
      ctx,
      'camp',
      'neutral',
      type.id,
      hx + ox,
      hy,
      campStats(ctx, type),
      type.damageType,
    );
    u.camp = { slot: slot.id, spot, typeId: type.id, homeX: hx + ox, homeY: hy, biomeId: biome.id };
    ids.push(u.id);
  }
  slot.campIds[spot] = ids;
  slot.campRespawn[spot] = null;
  ctx.emit('campsRolled', { slot: slot.id, types: [type.id] });
}

function clearSpot(ctx: Ctx, slot: SlotState, spot: number): void {
  for (const id of slot.campIds[spot] ?? []) {
    const u = ctx.unit(id);
    if (u) {
      u.alive = false;
      u.pendingKill = null;
    }
  }
  slot.campIds[spot] = [];
}

export function openSlotsForPhase(ctx: Ctx): void {
  const phase = ctx.s.phase.n;
  const groups = new Map<number, SlotState[]>();
  for (const sl of ctx.s.slots) {
    const def = ctx.world.map.slots.find((s) => s.id === sl.id)!;
    if (sl.open || def.openPhase > phase) continue;
    const g = groups.get(def.openPhase) ?? [];
    g.push(sl);
    groups.set(def.openPhase, g);
  }
  for (const [, group] of groups) {
    const biome = pick(ctx.s.rng, 'mapgen', ctx.c.biomes);
    const spots = biome.camps.length;
    const types: string[] = [];
    for (let i = 0; i < spots; i++) types.push(rollType(ctx, biome));
    group.forEach((sl, gi) => {
      sl.open = true;
      sl.biomeId = biome.id;
      sl.mirrored = gi % 2 === 1;
      sl.types = types.slice();
      sl.campIds = types.map(() => []);
      sl.campRespawn = types.map(() => null);
      ctx.emit('biomeOpen', { slot: sl.id, biome: biome.id });
      for (let i = 0; i < spots; i++) spawnSpot(ctx, sl, i);
    });
  }
}

export function rerollJungle(ctx: Ctx, skipFresh: Set<string>): void {
  const groups = new Map<number, SlotState[]>();
  for (const sl of ctx.s.slots) {
    if (!sl.open || skipFresh.has(sl.id)) continue;
    const def = ctx.world.map.slots.find((s) => s.id === sl.id)!;
    const g = groups.get(def.openPhase) ?? [];
    g.push(sl);
    groups.set(def.openPhase, g);
  }
  for (const [, group] of groups) {
    const biome = biomeOf(ctx, group[0]);
    if (!biome) continue;
    const types: string[] = [];
    for (let i = 0; i < biome.camps.length; i++) types.push(rollType(ctx, biome));
    for (const sl of group) {
      for (let i = 0; i < sl.campIds.length; i++) clearSpot(ctx, sl, i);
      sl.types = types.slice();
      for (let i = 0; i < types.length; i++) spawnSpot(ctx, sl, i);
    }
  }
}

export function tickCampRespawns(ctx: Ctx): void {
  for (const sl of ctx.s.slots) {
    if (!sl.open) continue;
    for (let i = 0; i < sl.campRespawn.length; i++) {
      const at = sl.campRespawn[i];
      if (at !== null && ctx.s.tick >= at) spawnSpot(ctx, sl, i);
    }
  }
}

export function onCampUnitDeath(ctx: Ctx, u: Unit, killer: Unit | null): void {
  const c = u.camp!;
  const slot = ctx.s.slots.find((s) => s.id === c.slot);
  const biome = ctx.c.biomeById.get(c.biomeId);
  const type = biome?.campTypes.find((t) => t.id === c.typeId);
  if (!slot || !type) return;
  const hero = killer && killer.hero ? killer : null;
  if (hero) giveGold(ctx, hero, type.gold / type.count, 'camp');
  const alive = (slot.campIds[c.spot] ?? []).filter((id) => {
    const x = ctx.unit(id);
    return x && x.alive && x.id !== u.id;
  });
  slot.campIds[c.spot] = alive;
  if (alive.length > 0) return;
  slot.campRespawn[c.spot] = ctx.s.tick + Math.round(ctx.t.camps.respawnSec * TPS);
  if (hero && hero.team !== 'neutral') {
    if (type.points > 0) {
      ctx.s.teams[hero.team].points += type.points;
      ctx.emit('teamPoints', { team: hero.team, amount: type.points, source: `camp:${type.id}` });
    }
    if (type.heal > 0) healUnit(ctx, hero, hero, type.heal, `camp:${type.id}`);
    if (type.buff) {
      addMod(ctx, hero, {
        id: `camp:${type.id}`,
        stat: type.buff.stat,
        kind: type.buff.kind,
        value: type.buff.value,
        source: `camp:${type.id}`,
        tags: [],
        expiresTick: ctx.s.tick + Math.round(type.buff.durationSec * TPS),
      });
    }
  }
  ctx.emit('campCleared', {
    slot: slot.id,
    spot: c.spot,
    typeId: type.id,
    killer: killer ? killer.id : 0,
    gold: type.gold,
    points: type.points,
  });
}

export function randomChance(ctx: Ctx, p: number): boolean {
  return rand(ctx.s.rng, 'mapgen') < p;
}
