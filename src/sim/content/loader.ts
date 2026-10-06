import { hashContent } from '../core/rng';
import {
  BadgesSchema,
  BiomeSchema,
  HeroSchema,
  ItemFileSchema,
  MapSchema,
  PressureSchema,
  TuningSchema,
  UpgradeFileSchema,
  type BadgeDef,
  type BiomeDef,
  type CursedItemDef,
  type HeroDef,
  type HolyItemDef,
  type ItemDef,
  type MapDef,
  type PressureDef,
  type Tuning,
  type UpgradeDef,
} from './schema';

export interface RawContentFiles {
  heroes: unknown[];
  items: unknown[];
  upgrades: unknown[];
  biomes: unknown[];
  pressure: unknown;
  badges: unknown;
  map: unknown;
  tuning: unknown;
}

export interface Content {
  hash: string;
  heroes: HeroDef[];
  heroById: Map<string, HeroDef>;
  items: ItemDef[];
  itemById: Map<string, ItemDef>;
  cursed: CursedItemDef[];
  cursedById: Map<string, CursedItemDef>;
  holy: HolyItemDef[];
  holyById: Map<string, HolyItemDef>;
  upgrades: UpgradeDef[];
  upgradeById: Map<string, UpgradeDef>;
  upgradesByHero: Map<string, UpgradeDef[]>;
  biomes: BiomeDef[];
  biomeById: Map<string, BiomeDef>;
  pressure: PressureDef[];
  badges: BadgeDef[];
  map: MapDef;
  tuning: Tuning;
}

function byId<T extends { id: string }>(list: T[], label: string): Map<string, T> {
  const m = new Map<string, T>();
  for (const it of list) {
    if (m.has(it.id)) throw new Error(`Duplicate ${label} id: ${it.id}`);
    m.set(it.id, it);
  }
  return m;
}

export function validateRefs(c: Content): string[] {
  const errs: string[] = [];
  const allItemIds = new Set<string>([
    ...c.itemById.keys(),
    ...c.cursedById.keys(),
    ...c.holyById.keys(),
  ]);
  for (const it of c.items) {
    for (const f of it.from) {
      const comp = c.itemById.get(f);
      if (!comp) errs.push(`item ${it.id}: unknown component ${f}`);
      else if (comp.tier >= it.tier) errs.push(`item ${it.id}: component ${f} is not a lower tier`);
    }
    if (it.tier > 1 && it.from.length === 0)
      errs.push(`item ${it.id}: tier ${it.tier} has no recipe`);
  }
  for (const h of c.heroes) {
    for (const id of h.buildList) {
      if (!c.itemById.has(id)) errs.push(`hero ${h.id}: build item ${id} unknown`);
    }
    if (!c.upgradesByHero.get(h.id) || c.upgradesByHero.get(h.id)!.length < 3) {
      errs.push(`hero ${h.id}: needs at least 3 upgrades`);
    }
    if (h.buildList.length > c.tuning.shop.slots)
      errs.push(`hero ${h.id}: build list exceeds slots`);
  }
  for (const u of c.upgrades) {
    if (!c.heroById.has(u.hero)) errs.push(`upgrade ${u.id}: unknown hero ${u.hero}`);
  }
  for (const b of c.biomes) {
    const ids = new Set(b.campTypes.map((t) => t.id));
    for (const row of b.campTable) {
      for (const t of row.types)
        if (!ids.has(t.id)) errs.push(`biome ${b.id}: unknown camp type ${t.id}`);
    }
  }
  const slotIds = new Set(c.map.slots.map((s) => s.id));
  for (const n of c.map.obeliskNodes) {
    if (n.slot && !slotIds.has(n.slot)) errs.push(`obelisk node ${n.id}: unknown slot ${n.slot}`);
  }
  const pressureIds = new Set(c.pressure.map((p) => p.id));
  if (pressureIds.size !== c.pressure.length) errs.push('pressure ids not unique');
  for (const h of c.heroes) {
    if (!c.tuning.personalities[h.personality])
      errs.push(`hero ${h.id}: personality ${h.personality} missing`);
  }
  for (const p of ['push', 'farm', 'defend', 'default']) {
    if (!c.tuning.posture[p]) errs.push(`posture table ${p} missing`);
  }
  if (allItemIds.size !== c.items.length + c.cursed.length + c.holy.length)
    errs.push('item ids collide across kinds');
  if (c.cursed.length === 0 || c.holy.length === 0) errs.push('needs cursed and holy items');
  return errs;
}

export function loadContent(raw: RawContentFiles): Content {
  const heroes = raw.heroes.map((h) => HeroSchema.parse(h));
  const itemFiles = raw.items.map((f) => ItemFileSchema.parse(f));
  const items = itemFiles.flatMap((f) => f.items);
  const cursed = itemFiles.flatMap((f) => f.cursed);
  const holy = itemFiles.flatMap((f) => f.holy);
  const upgrades = raw.upgrades.flatMap((f) => UpgradeFileSchema.parse(f).upgrades);
  const biomes = raw.biomes.map((b) => BiomeSchema.parse(b));
  const pressure = PressureSchema.parse(raw.pressure).events;
  const badges = BadgesSchema.parse(raw.badges).badges;
  const map = MapSchema.parse(raw.map);
  const tuning = TuningSchema.parse(raw.tuning);

  const upgradesByHero = new Map<string, UpgradeDef[]>();
  for (const u of upgrades) {
    const list = upgradesByHero.get(u.hero) ?? [];
    list.push(u);
    upgradesByHero.set(u.hero, list);
  }
  const content: Content = {
    hash: hashContent(raw),
    heroes,
    heroById: byId(heroes, 'hero'),
    items,
    itemById: byId(items, 'item'),
    cursed,
    cursedById: byId(cursed, 'cursed item'),
    holy,
    holyById: byId(holy, 'holy item'),
    upgrades,
    upgradeById: byId(upgrades, 'upgrade'),
    upgradesByHero,
    biomes,
    biomeById: byId(biomes, 'biome'),
    pressure,
    badges,
    map,
    tuning,
  };
  const errs = validateRefs(content);
  if (errs.length) throw new Error(`Content invalid:\n${errs.join('\n')}`);
  return content;
}
