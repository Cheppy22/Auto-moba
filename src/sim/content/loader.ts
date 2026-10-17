import { hashContent } from '../core/rng';
import {
  BadgesSchema,
  BiomeSchema,
  EventFileSchema,
  GAMBIT_EFFECTS,
  GambitFileSchema,
  ItemFileSchema,
  MapSchema,
  OpeningFileSchema,
  PressureSchema,
  PieceSchema,
  RelicFileSchema,
  RELIC_EFFECTS,
  TournamentSchema,
  TuningSchema,
  type BadgeDef,
  type BiomeDef,
  type CursedItemDef,
  type EventDef,
  type AbilityDef,
  type GambitDef,
  type GambitEffect,
  type PieceDef,
  type PieceId,
  type StyleDef,
  type ItemDef,
  type MapDef,
  type OpeningDef,
  type PressureDef,
  type RelicDef,
  type TournamentDef,
  type RelicEffect,
  type Tuning,
} from './schema';

export interface RawContentFiles {
  pieces: unknown[];
  gambits: unknown;
  openings: unknown;
  relics: unknown;
  items: unknown[];
  biomes: unknown[];
  events: unknown[];
  pressure: unknown;
  badges: unknown;
  map: unknown;
  /** The Long Board (`content/map-long.json`): a map plus a `tuning` patch it plays with. */
  mapLong?: unknown;
  /** The Tournament run's round table and court names (`content/tournament.json`). */
  tournament?: unknown;
  tuning: unknown;
}

/** A map and the tuning it is played with. */
export interface MapVariant {
  map: MapDef;
  tuning: Tuning;
}

export interface Content {
  hash: string;
  pieces: PieceDef[];
  pieceById: Map<PieceId, PieceDef>;
  /** Key `${piece}/${style}`. */
  styleByKey: Map<string, StyleDef>;
  /** The four abilities of a piece in a style (3 base + the style's signature). Key `${piece}/${style}`. */
  kitByKey: Map<string, AbilityDef[]>;
  gambits: GambitDef[];
  gambitById: Map<string, GambitDef>;
  openings: OpeningDef[];
  openingById: Map<string, OpeningDef>;
  relics: RelicDef[];
  relicById: Map<string, RelicDef>;
  items: ItemDef[];
  itemById: Map<string, ItemDef>;
  cursed: CursedItemDef[];
  cursedById: Map<string, CursedItemDef>;
  biomes: BiomeDef[];
  biomeById: Map<string, BiomeDef>;
  events: EventDef[];
  eventById: Map<string, EventDef>;
  pressure: PressureDef[];
  badges: BadgeDef[];
  map: MapDef;
  tuning: Tuning;
  /** The Long Board, played with `MatchConfig.map: 'long'`; null when its file is missing. */
  longBoard: MapVariant | null;
  /** The Tournament run's table (`src/sim/run`); null when its file is missing. */
  tournament: TournamentDef | null;
}

/** Deep-merges a JSON patch into a copy of `base` (objects merge, everything else is replaced). */
export function deepMerge(base: unknown, patch: unknown): unknown {
  if (typeof base !== 'object' || base === null || typeof patch !== 'object' || patch === null)
    return patch;
  const out: Record<string, unknown> = { ...(base as Record<string, unknown>) };
  for (const [k, v] of Object.entries(patch as Record<string, unknown>))
    out[k] = deepMerge(out[k], v);
  return out;
}

/** The content a match plays with: the default map, or the Long Board with its tuning. */
export function contentFor(
  c: Content,
  map: 'default' | 'long' | undefined,
  pace: MatchPace = 'classical',
): Content {
  let out = c;
  if (map === 'long') {
    if (!c.longBoard) throw new Error('The Long Board map is not loaded');
    out = { ...c, map: c.longBoard.map, tuning: c.longBoard.tuning };
  }
  return pace === 'blitz' ? blitzContent(out) : out;
}

/** A match's pace: Classical is the full match, Blitz the short one (`tuning.blitz`). */
export type MatchPace = 'classical' | 'blitz';

/** Blitz: at most `blitz.maxActs` Acts, the Endgame rule from `blitz.endgameAct`, `blitz.throneHp` Thrones. */
function blitzContent(c: Content): Content {
  const b = c.tuning.blitz;
  return {
    ...c,
    tuning: {
      ...c.tuning,
      maxPhases: b.maxActs,
      guardian: { ...c.tuning.guardian, hp: b.throneHp },
    },
    pressure: c.pressure.map((ev) =>
      ev.rules.includes('endgame') ? { ...ev, fromPhase: b.endgameAct } : ev,
    ),
  };
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
  const allItemIds = new Set<string>([...c.itemById.keys(), ...c.cursedById.keys()]);
  for (const it of c.items) {
    for (const f of it.from) {
      const comp = c.itemById.get(f);
      if (!comp) errs.push(`item ${it.id}: unknown component ${f}`);
      else if (comp.tier >= it.tier) errs.push(`item ${it.id}: component ${f} is not a lower tier`);
    }
    if (it.tier > 1 && it.from.length === 0)
      errs.push(`item ${it.id}: tier ${it.tier} has no recipe`);
  }
  for (const p of c.pieces) {
    for (const path of ['offense', 'defense', 'utility'] as const) {
      const list = p.paths[path];
      for (const id of list)
        if (!c.itemById.has(id)) errs.push(`piece ${p.id}: ${path} item ${id} unknown`);
      if (list.length > c.tuning.shop.slots)
        errs.push(`piece ${p.id}: ${path} build list exceeds slots`);
    }
    const styleIds = new Set<string>();
    for (const st of p.styles) {
      for (const path of ['offense', 'defense', 'utility'] as const) {
        const list = st.paths?.[path];
        if (!list) continue;
        for (const id of list)
          if (!c.itemById.has(id)) errs.push(`style ${p.id}/${st.id}: ${path} item ${id} unknown`);
        if (list.length > c.tuning.shop.slots)
          errs.push(`style ${p.id}/${st.id}: ${path} build list exceeds slots`);
      }
      if (styleIds.has(st.id)) errs.push(`piece ${p.id}: duplicate style ${st.id}`);
      styleIds.add(st.id);
      const forkIds = st.forks['8'].map((f) => f.id);
      if (new Set(forkIds).size !== forkIds.length)
        errs.push(`piece ${p.id}/${st.id}: fork option ids must be unique`);
    }
    if (!c.tuning.personalities[p.personality])
      errs.push(`piece ${p.id}: personality ${p.personality} missing`);
  }
  if (c.pieceById.size !== 5) errs.push('needs exactly one file per piece (5)');
  for (const g of c.gambits) {
    const eff = g.effect ?? g.id;
    if (!(GAMBIT_EFFECTS as readonly string[]).includes(eff))
      errs.push(`gambit ${g.id}: unknown effect ${eff}`);
  }
  for (const r of c.relics) {
    const eff = r.effect ?? r.id;
    if (!(RELIC_EFFECTS as readonly string[]).includes(eff))
      errs.push(`relic ${r.id}: unknown effect ${eff}`);
    for (const card of r.cards)
      if (!c.gambitById.has(card)) errs.push(`relic ${r.id}: unknown card ${card}`);
    if (r.bind === 'laneCard' && r.cards.length === 0) errs.push(`relic ${r.id}: needs cards`);
    for (const cards of Object.values(r.triggerCards))
      for (const card of cards)
        if (!c.gambitById.has(card)) errs.push(`relic ${r.id}: unknown trigger card ${card}`);
  }
  if (!c.openingById.has('italian')) errs.push('openings: needs the balanced "italian" opening');
  if (!c.gambits.some((g) => g.piece === null && g.weight > 0))
    errs.push('gambits: needs at least one universal card');
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
  for (const e of c.events) {
    if (e.kind === 'parade' && e.lanes.length === 0) errs.push(`event ${e.id}: parade needs lanes`);
    if (e.kind !== 'well' && e.units.length === 0) errs.push(`event ${e.id}: needs units`);
    if (e.kind === 'well' && (e.holdSec <= 0 || e.buffs.length === 0))
      errs.push(`event ${e.id}: well needs holdSec and buffs`);
    if (e.kind === 'oni' && !e.telegraph) errs.push(`event ${e.id}: oni needs telegraph`);
  }
  const pressureIds = new Set(c.pressure.map((p) => p.id));
  if (pressureIds.size !== c.pressure.length) errs.push('pressure ids not unique');
  for (const p of ['push', 'farm', 'defend', 'default']) {
    if (!c.tuning.posture[p]) errs.push(`posture table ${p} missing`);
  }
  if (allItemIds.size !== c.items.length + c.cursed.length)
    errs.push('item ids collide across kinds');
  if (c.cursed.length === 0) errs.push('needs cursed items');
  return errs;
}

export function loadContent(raw: RawContentFiles): Content {
  const pieces = raw.pieces.map((p) => PieceSchema.parse(p));
  const gambits = GambitFileSchema.parse(raw.gambits).gambits;
  const openings = OpeningFileSchema.parse(raw.openings);
  const relics = RelicFileSchema.parse(raw.relics).relics;
  const itemFiles = raw.items.map((f) => ItemFileSchema.parse(f));
  const items = itemFiles.flatMap((f) => f.items);
  const cursed = itemFiles.flatMap((f) => f.cursed);
  const biomes = raw.biomes.map((b) => BiomeSchema.parse(b));
  const events = raw.events.flatMap((f) => EventFileSchema.parse(f).events);
  const pressure = PressureSchema.parse(raw.pressure).events;
  const badges = BadgesSchema.parse(raw.badges).badges;
  const map = MapSchema.parse(raw.map);
  const tuning = TuningSchema.parse(raw.tuning);
  const longRaw = raw.mapLong as { tuning?: unknown } | undefined;
  const longBoard: MapVariant | null = longRaw
    ? {
        map: MapSchema.parse(longRaw),
        tuning: TuningSchema.parse(deepMerge(raw.tuning, longRaw.tuning ?? {})),
      }
    : null;

  const styleByKey = new Map<string, StyleDef>();
  const kitByKey = new Map<string, AbilityDef[]>();
  for (const p of pieces) {
    for (const st of p.styles) {
      styleByKey.set(`${p.id}/${st.id}`, st);
      kitByKey.set(`${p.id}/${st.id}`, [...p.abilities, st.ability]);
    }
  }
  const content: Content = {
    hash: hashContent(raw),
    pieces,
    pieceById: byId(pieces, 'piece') as Map<PieceId, PieceDef>,
    styleByKey,
    kitByKey,
    gambits,
    gambitById: byId(gambits, 'gambit'),
    openings,
    openingById: byId(openings, 'opening'),
    relics,
    relicById: byId(relics, 'relic'),
    items,
    itemById: byId(items, 'item'),
    cursed,
    cursedById: byId(cursed, 'cursed item'),
    biomes,
    biomeById: byId(biomes, 'biome'),
    events,
    eventById: byId(events, 'event'),
    pressure,
    badges,
    map,
    tuning,
    longBoard,
    tournament: raw.tournament === undefined ? null : TournamentSchema.parse(raw.tournament),
  };
  const errs = validateRefs(content);
  if (longBoard) {
    const ids = new Set(longBoard.map.slots.map((s) => s.id));
    for (const n of longBoard.map.obeliskNodes)
      if (n.slot && !ids.has(n.slot)) errs.push(`long board node ${n.id}: unknown slot ${n.slot}`);
  }
  if (errs.length) throw new Error(`Content invalid:\n${errs.join('\n')}`);
  return content;
}

export const gambitEffect = (g: GambitDef): GambitEffect => (g.effect ?? g.id) as GambitEffect;

export const relicEffect = (r: RelicDef): RelicEffect => (r.effect ?? r.id) as RelicEffect;
