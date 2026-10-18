import { z } from 'zod';

const STAT_KEYS = [
  'maxHp',
  'hpRegen',
  'armor',
  'resist',
  'bladeDmg',
  'atkSpeed',
  'soulPower',
  'moveSpeed',
  'cdr',
  'range',
  'respawnMult',
  'incomeMult',
  'damageTakenMult',
] as const;

const StatKeySchema = z.enum(STAT_KEYS);
const DamageTypeSchema = z.enum(['blade', 'soul', 'true']);
export const RoleSchema = z.enum(['top', 'mid', 'bot']);
const DispositionSchema = z.enum(['farmer', 'attacker', 'defender']);
const LaneSchema = z.enum(['top', 'mid', 'bot']);
export const PostureSchema = z.enum(['push', 'farm', 'defend', 'default']);
const CategorySchema = z.enum(['mind', 'body', 'soul']);

const StatsSchema = z.object({
  maxHp: z.number(),
  hpRegen: z.number(),
  armor: z.number(),
  resist: z.number(),
  bladeDmg: z.number(),
  atkSpeed: z.number(),
  soulPower: z.number(),
  moveSpeed: z.number(),
  cdr: z.number(),
  range: z.number(),
  respawnMult: z.number().default(1),
  incomeMult: z.number().default(1),
  damageTakenMult: z.number().default(1),
});

const ModSchema = z.object({
  stat: StatKeySchema,
  kind: z.enum(['add', 'mul']),
  value: z.number(),
});

const amount = {
  base: z.number().default(0),
  bladeScale: z.number().default(0),
  soulScale: z.number().default(0),
};

const EffectSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('damage'), dmgType: DamageTypeSchema, ...amount }),
  z.object({
    type: z.literal('heal'),
    ...amount,
    maxHpPct: z.number().default(0),
    fractionOfDamage: z.number().default(0),
  }),
  z.object({ type: z.literal('shield'), ...amount, durationSec: z.number() }),
  z.object({
    type: z.literal('statMod'),
    stat: StatKeySchema,
    kind: z.enum(['add', 'mul']),
    value: z.number(),
    durationSec: z.number(),
    tags: z.array(z.string()).default([]),
    maxStacks: z.number().int().optional(),
  }),
  z.object({
    type: z.literal('dot'),
    dmgType: DamageTypeSchema,
    ...amount,
    durationSec: z.number(),
  }),
  z.object({
    type: z.literal('dash'),
    distance: z.number(),
    toward: z.enum(['target', 'away']),
    /** Leaps over solid terrain and lands on the nearest walkable ground (Knights always leap). */
    leap: z.boolean().default(false),
  }),
  /** No moving, attacking or casting for the duration. */
  z.object({ type: z.literal('stun'), durationSec: z.number() }),
  /** The target must attack the caster for the duration (while the caster lives). */
  z.object({ type: z.literal('taunt'), durationSec: z.number() }),
  z.object({
    type: z.literal('aura'),
    radius: z.number(),
    target: z.enum(['ally', 'enemy']),
    stat: StatKeySchema,
    kind: z.enum(['add', 'mul']),
    value: z.number(),
  }),
]);

const AbilityTargetSchema = z.enum([
  'self',
  'enemy',
  'enemyArea',
  'enemyBurst',
  'allyArea',
  'lowestAlly',
]);

const AbilitySchema = z.object({
  id: z.string(),
  name: z.string(),
  cooldownSec: z.number(),
  range: z.number().default(0),
  radius: z.number().default(0),
  target: AbilityTargetSchema,
  effects: z.array(EffectSchema),
  condition: z
    .object({
      minEnemies: z.number().optional(),
      minEnemyHeroes: z.number().optional(),
      selfHpBelow: z.number().optional(),
      allyHpBelow: z.number().optional(),
      heroTargetOnly: z.boolean().optional(),
    })
    .default({}),
  desc: z.string().default(''),
});

const TriggerSchema = z.object({
  on: z.enum(['hit', 'kill', 'damaged', 'periodic', 'lowHp']),
  everySec: z.number().optional(),
  hpBelow: z.number().optional(),
  cooldownSec: z.number().default(0),
  chance: z.number().default(1),
  target: z
    .enum(['self', 'victim', 'attacker', 'enemyArea', 'allyArea', 'nearestEnemyHero'])
    .default('self'),
  radius: z.number().default(0),
  vs: z.enum(['hero', 'other']).optional(),
  ofType: DamageTypeSchema.optional(),
  everyNth: z.number().int().optional(),
  effects: z.array(EffectSchema).default([]),
  custom: z.string().optional(),
  param: z.number().optional(),
  desc: z.string().optional(),
});

const PersonalitySchema = z.enum(['reckless', 'cautious', 'opportunist', 'steadfast']);

export const PIECE_IDS = ['king', 'queen', 'rook', 'bishop', 'knight'] as const;
const PieceIdSchema = z.enum(PIECE_IDS);
export const PATHS = ['offense', 'defense', 'utility'] as const;
const PathSchema = z.enum(PATHS);

/**
 * One automatic improvement: an optional ability tweak (same shape as the old upgrade cards) plus
 * optional stat mods and triggers. Used for style rank bonuses (Ranks 2, 3, 5, 6, 7) and fork
 * options (Ranks 4 and 8).
 */
const PerkSchema = z.object({
  name: z.string(),
  desc: z.string().default(''),
  /** 0-2 = the piece's base abilities, 3 = the style's signature ability. */
  ability: z.number().int().min(0).max(3).optional(),
  cooldownMul: z.number().default(1),
  powerMul: z.number().default(1),
  rangeMul: z.number().default(1),
  radiusMul: z.number().default(1),
  mods: z.array(ModSchema).default([]),
  triggers: z.array(TriggerSchema).default([]),
});

const ForkOptionSchema = PerkSchema.extend({
  id: z.string(),
  /** One plain line on how the piece plays with this option (the fork sheet). */
  playsLike: z.string().default(''),
});

const PathListsSchema = z.object({
  offense: z.array(z.string()),
  defense: z.array(z.string()),
  utility: z.array(z.string()),
});

/** The two generic rank bonuses a piece earns before it chooses its archetype (Ranks 2 and 3). */
const GenericRanksSchema = z.object({ '2': PerkSchema, '3': PerkSchema });

const StyleSchema = z.object({
  id: z.string(),
  name: z.string(),
  desc: z.string().default(''),
  /** One plain line on how the piece plays in this style (the Rank 4 fork sheet). */
  playsLike: z.string().default(''),
  /** Overrides the piece's attack kind (e.g. a melee style of a ranged piece). */
  attackKind: z.enum(['melee', 'ranged']).optional(),
  /** Overrides the piece's build lists for this style (any path left out uses the piece's). */
  paths: PathListsSchema.partial().optional(),
  /** The signature skill: becomes the piece's 4th ability. */
  ability: AbilitySchema,
  /** Stat tilt applied for the whole match. */
  mods: z.array(ModSchema).default([]),
  passives: z.array(TriggerSchema).default([]),
  /** Style rank bonuses (Ranks 5-7; Ranks 2 and 3 are the piece's generic bonuses). */
  ranks: z.object({
    '5': PerkSchema,
    '6': PerkSchema,
    '7': PerkSchema,
  }),
  /** Rank 4 is the archetype choice itself (the piece's three styles); this is the Rank 8 fork. */
  forks: z.object({
    '8': z.array(ForkOptionSchema).length(2),
  }),
});

export const PieceSchema = z.object({
  id: PieceIdSchema,
  name: z.string(),
  title: z.string(),
  attackKind: z.enum(['melee', 'ranged']),
  disposition: DispositionSchema,
  personality: PersonalitySchema,
  playstyle: z.string().default(''),
  stats: StatsSchema,
  abilities: z.array(AbilitySchema).length(3),
  passives: z.array(TriggerSchema).default([]),
  /** Auto attacks add this fraction of Soul power. */
  autoSoulScale: z.number().default(0),
  styles: z.array(StyleSchema).length(3),
  /** Rank 2 and 3 bonuses while the piece is still generic (before the Rank 4 archetype). */
  generic: GenericRanksSchema,
  /** Build path the AI prefers (and the setup board pre-fills); derived from disposition if absent. */
  defaultPath: PathSchema.optional(),
  /** Item build list per build path (item ids, in buy order). */
  paths: PathListsSchema,
});

/** `ally` targets one of the team's own pieces. */
const GambitTargetSchema = z.enum(['lane', 'point', 'enemy', 'ally', 'none']);

const SCHOOLS = ['march', 'initiative', 'fortress', 'sacrifice', 'position', 'clock'] as const;
const SchoolSchema = z.enum(SCHOOLS);

/** Effect families the sim implements; a card's `effect` defaults to its id. */
export const GAMBIT_EFFECTS = [
  'advance',
  'hold_the_file',
  'regroup',
  'pawn_storm',
  'check',
  'castle',
  'queens_gambit',
  'siege',
  'sanctuary',
  'fork',
  'pawn_sacrifice',
  'exchange',
  'poisoned_pawn',
  'barricade',
  'open_file',
  'outpost',
  // wave 3
  'breakthrough',
  'pin',
  'desperado',
  'fortify',
  // Clock school (spec 2026-10-18, phase A)
  'zugzwang',
  'time_trouble',
  'opening_book',
  'increment',
] as const;

const GambitSchema = z.object({
  id: z.string(),
  name: z.string(),
  desc: z.string().default(''),
  school: SchoolSchema,
  cost: z.number().min(0),
  target: GambitTargetSchema,
  /** Signature card of this piece (only usable while it lives), or null for universal cards. */
  piece: PieceIdSchema.nullable().default(null),
  weight: z.number().min(0).default(1),
  durationSec: z.number().min(0).default(0),
  effect: z.enum(GAMBIT_EFFECTS).optional(),
  params: z.record(z.string(), z.number()).default({}),
});

export const GambitFileSchema = z.object({ gambits: z.array(GambitSchema).min(1) });

/** An opening: the schools whose cards the hand draws twice as often. */
const OpeningSchema = z.object({
  id: z.string(),
  name: z.string(),
  desc: z.string().default(''),
  schools: z.array(SchoolSchema),
});

export const OpeningFileSchema = z.array(OpeningSchema).min(1);

/** `content/tournament.json`: the Tournament run's round table and the stand-in court names. */
export const TournamentSchema = z.object({
  /** Relics a side may hold in a run match. */
  relicMax: z.number().int().min(1),
  /** Heirlooms are tier-1 or tier-2 items up to this price. */
  heirloomMaxPrice: z.number(),
  /** Let the AI choose: a book move counts as this much gold against the heirloom's item price. */
  aiBookGold: z.number(),
  rounds: z
    .array(
      z.object({
        round: z.number().int().min(1).max(4),
        name: z.string(),
        /** Relics the opponent starts with. */
        relics: z.number().int().min(0),
        /** Extra Tempo the opponent starts with. */
        tempoBonus: z.number().min(0),
        /** Relics the opponent may hold in that match (its drafts stop there); default `relicMax`. */
        relicMax: z.number().int().min(0).optional(),
        /** The opponent's AI Tempo split in that match (`pawns.aiPawnShare`); default the tuning's. */
        aiPawnShare: z.number().min(0).max(1).optional(),
        /** The opponent's Opening does well against yours. */
        counterOpening: z.boolean(),
      }),
    )
    .length(4),
  /** The Final's court, always. */
  finalName: z.string(),
  /** Invented club names for rounds 1-3 (never real clubs). */
  names: z.array(z.string()).min(3),
});

/** Heraldic emblems a court's seal can carry (drawn in code by `src/ui/run/seals.tsx`). */
export const COURT_EMBLEMS = [
  'bell',
  'lantern',
  'oak',
  'rose',
  'flame',
  'compass',
  'gear',
  'tower',
  'crown',
  'mirror',
] as const;
/** How a seal's field is divided between its two colours. */
export const SEAL_DIVISIONS = ['plain', 'pale', 'fess', 'bend', 'chief', 'quarterly'] as const;
/** Where a portrait's figure is turned: toward the viewer, or away to one side. */
export const PORTRAIT_POSES = ['front', 'left', 'right', 'profile-left', 'profile-right'] as const;

const HexSchema = z.string().regex(/^#[0-9a-fA-F]{6}$/);

/**
 * `content/courts.json` (3B): the hand-authored Black courts of a Tournament run. A run draws one
 * court per round from the courts of that round (`round` 1 Club .. 4 Final), seeded. A court owns
 * identity (name, motto, seal, portrait, fixed Opening, lanes, archetypes, one signature relic);
 * how hard its round is stays in `content/tournament.json`.
 */
export const CourtSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/),
  round: z.number().int().min(1).max(4),
  name: z.string().min(3),
  /** The line printed under the name. */
  motto: z.string().min(3),
  /** One sentence on how the court plays (shown on the Draw). */
  manner: z.string().min(3),
  seal: z.object({
    /** The two field colours and the colour the emblem is drawn in. */
    field: z.tuple([HexSchema, HexSchema]),
    charge: HexSchema,
    division: z.enum(SEAL_DIVISIONS),
    emblem: z.enum(COURT_EMBLEMS),
  }),
  portrait: z.object({
    piece: z.enum(PIECE_IDS),
    /** The archetype the figure wears (cloth colour and emblem); must be the court's own for that piece. */
    style: z.string(),
    pose: z.enum(PORTRAIT_POSES),
  }),
  opening: z.string(),
  /** The five pieces: build path and lane each (2 Left, 2 Right, 1 Mid). */
  pieces: z
    .array(
      z.object({
        piece: z.enum(PIECE_IDS),
        path: z.enum(['offense', 'defense', 'utility']),
        lane: z.enum(['top', 'mid', 'bot']),
      }),
    )
    .length(5),
  /** The archetype each piece takes at Rank 4. */
  styles: z.object({
    king: z.string(),
    queen: z.string(),
    rook: z.string(),
    bishop: z.string(),
    knight: z.string(),
  }),
  /** The relic the court always starts with; `lane` / `piece` aim it when its default aim is not the court's idea. */
  signature: z.object({
    relic: z.string(),
    lane: z.enum(['top', 'mid', 'bot']).optional(),
    piece: z.enum(PIECE_IDS).optional(),
  }),
});

export const CourtFileSchema = z.object({ courts: z.array(CourtSchema).min(1) });

export const RELIC_FAMILIES = ['lane', 'carry', 'pawns', 'siege', 'orders'] as const;
const RelicFamilySchema = z.enum(RELIC_FAMILIES);

/** Effect families the sim implements; a relic's `effect` defaults to its id. */
export const RELIC_EFFECTS = [
  'half_open_file',
  'closed_position',
  'crown_jewel',
  'development',
  'pawn_majority',
  'pawn_lever',
  'opening_theory',
  'standing_order',
  'sealed_move',
  'pawn_structure',
  'wing_gambit',
  'strong_square',
  'guarded_piece',
  'knights_tour',
  'kings_ransom',
  'pawn_chain',
  'spare_tempo',
  'compensation',
  'curtain_wall',
  'royal_keep',
  'quiet_move',
  'battery',
  'sortie',
] as const;

/** What can set off a Sealed Move: the Act clock, a Bastion under half, a kill, a piece in danger, a stack. */
export const SEALED_TRIGGERS = ['bastion', 'kill', 'guarded', 'lane3', 'clock'] as const;
export const SealedTriggerSchema = z.enum(SEALED_TRIGGERS);

/**
 * A relic: kept for the rest of the match, up to three. `bind` is what the player aims when taking
 * it (a lane, a piece, or a lane and a lane card). `aim` is how the AI aims it: offence at the
 * best lane or defence at the worst one; the carry or the most beaten piece.
 */
const RelicSchema = z.object({
  id: z.string(),
  name: z.string(),
  family: RelicFamilySchema,
  effect: z.enum(RELIC_EFFECTS).optional(),
  bind: z.enum(['none', 'lane', 'piece', 'laneCard', 'sealed', 'quota']),
  aim: z.enum(['offense', 'defense', 'carry', 'protect']).default('offense'),
  /** Comeback relics: their effect is off while the side is not behind. */
  rally: z.boolean().default(false),
  desc: z.string(),
  /**
   * The relic's plan in one line, with its real numbers (the draft card's headline). `{lane}` and
   * `{piece}` read as the aimed lane or piece ("Your Left lane", "Your Queen").
   */
  headline: z.string(),
  rewards: z.string(),
  counter: z.string(),
  /** What the AI looks for: schools, styles, `pawn-heavy`, `gambit-heavy`, `opening`. */
  tags: z.array(z.string()).default([]),
  /** Lane cards a Standing Order may bind. */
  cards: z.array(z.string()).default([]),
  /** Sealed Move: the cards the AI pairs with each trigger, best first. */
  triggerCards: z.record(z.string(), z.array(z.string())).default({}),
  params: z.record(z.string(), z.number()).default({}),
});

export const RelicFileSchema = z.object({ relics: z.array(RelicSchema).min(1) });

const ItemSchema = z.object({
  id: z.string(),
  name: z.string(),
  category: CategorySchema,
  tier: z.number().int().min(1).max(3),
  cost: z.number(),
  from: z.array(z.string()).default([]),
  mods: z.array(ModSchema).default([]),
  triggers: z.array(TriggerSchema).default([]),
  desc: z.string().default(''),
});

const FlawSchema = z.object({
  id: z.string(),
  text: z.string(),
  mods: z.array(ModSchema).default([]),
  triggers: z.array(TriggerSchema).default([]),
});

const CursedItemSchema = z.object({
  id: z.string(),
  name: z.string(),
  category: CategorySchema,
  boons: z.array(ModSchema).default([]),
  triggers: z.array(TriggerSchema).default([]),
  flawType: z.string(),
  flaws: z.array(FlawSchema).min(1),
  desc: z.string().default(''),
  boonText: z.string(),
});

export const ItemFileSchema = z.object({
  items: z.array(ItemSchema).default([]),
  cursed: z.array(CursedItemSchema).default([]),
});

const CampTypeSchema = z.object({
  id: z.string(),
  name: z.string(),
  hp: z.number(),
  damage: z.number(),
  damageType: DamageTypeSchema.default('blade'),
  armor: z.number().default(0),
  resist: z.number().default(0),
  range: z.number().default(20),
  atkSpeed: z.number().default(0.8),
  count: z.number().int().default(1),
  gold: z.number(),
  points: z.number().default(0),
  heal: z.number().default(0),
  buff: z
    .object({
      stat: StatKeySchema,
      kind: z.enum(['add', 'mul']),
      value: z.number(),
      durationSec: z.number(),
    })
    .optional(),
});

export const BiomeSchema = z.object({
  id: z.string(),
  name: z.string(),
  era: z.string(),
  palette: z.object({ ground: z.string(), accent: z.string(), glow: z.string() }),
  camps: z.array(z.object({ dx: z.number(), dy: z.number() })),
  campTypes: z.array(CampTypeSchema),
  campTable: z.array(
    z.object({
      phaseMin: z.number().int(),
      phaseMax: z.number().int(),
      types: z.array(z.object({ id: z.string(), weight: z.number() })),
    }),
  ),
  blurb: z.string().default(''),
});

const Pt = z.tuple([z.number(), z.number()]);

const LanePair = z.tuple([Pt, Pt]);
const BastionSide = z.object({ top: LanePair, mid: LanePair, bot: LanePair });

/** A walkable area of the Long Board: a capsule chain, or a flat-ended box when `box` is set. */
const AreaSchema = z.object({
  id: z.string(),
  kind: z.enum(['grove', 'pit', 'square', 'verge', 'road', 'sally']),
  pts: z.array(Pt).min(1),
  r: z.number(),
  box: z.boolean().default(false),
});

export const MapSchema = z.object({
  /** Board width (x). Also its length (y) unless `length` is set. */
  size: z.number(),
  length: z.number().optional(),
  /** Map scale over 1000 that the AI's hard-coded distances use; default `size` / 1000. */
  unitScale: z.number().optional(),
  /** Fairness: `mirror` across y = x (the square map) or a 180° `rotate` about the centre. */
  symmetry: z.enum(['mirror', 'rotate']).default('mirror'),
  lanes: z.object({ top: z.array(Pt), mid: z.array(Pt), bot: z.array(Pt) }),
  bases: z.object({ A: Pt, B: Pt }),
  guardianOffset: z.number(),
  towerFractions: z.object({ outer: z.number(), inner: z.number() }),
  /** Explicit Bastion positions per team and lane, [outer, inner]; overrides `towerFractions`. */
  bastions: z.object({ A: BastionSide, B: BastionSide }).optional(),
  /**
   * Heights (the Long Board): low river, terrace, high home terrace, by distance from the river
   * line y = length / 2. Lanes narrow to `rampHalf` on the ramps between them.
   */
  terraces: z
    .object({ river: z.number(), rampLen: z.number(), home: z.number(), rampHalf: z.number() })
    .optional(),
  /** Extra walkable areas (groves, the Pit, Squares, verges, the River Road, Sally Paths). */
  areas: z.array(AreaSchema).default([]),
  /** Jungle clearings and their gates are walkable all match (not only once the slot opens). */
  openJungle: z.boolean().default(false),
  /** The site of `siteMode: neutral` events, when no slot sits on the mirror axis. */
  neutralSite: z.object({ id: z.string(), x: z.number(), y: z.number() }).optional(),
  shops: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      x: z.number(),
      y: z.number(),
      radius: z.number(),
      ports: z.array(z.object({ lane: LaneSchema, t: z.number() })),
    }),
  ),
  slots: z.array(
    z.object({
      id: z.string(),
      x: z.number(),
      y: z.number(),
      radius: z.number(),
      openPhase: z.number().int(),
      ports: z.array(z.object({ lane: LaneSchema, t: z.number() })),
    }),
  ),
  obeliskNodes: z.array(
    z.object({ id: z.string(), x: z.number(), y: z.number(), slot: z.string().optional() }),
  ),
  keeperSpots: z.array(z.object({ id: z.string(), x: z.number(), y: z.number() })),
  /** Walkable space: everything outside these shapes is solid terrain. */
  walk: z
    .object({
      lane: z.number(),
      base: z.number(),
      port: z.number(),
      slotPad: z.number(),
      shopPad: z.number(),
      spot: z.number(),
    })
    .default({ lane: 40, base: 105, port: 26, slotPad: 14, shopPad: 14, spot: 34 }),
});

export const PressureSchema = z.object({
  events: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      fromPhase: z.number().int(),
      desc: z.string(),
      tagMult: z.record(z.string(), z.number()).default({}),
      rules: z.array(z.string()).default([]),
    }),
  ),
});

const EventUnitSchema = z.object({
  id: z.string(),
  name: z.string(),
  count: z.number().int().min(1),
  hp: z.number(),
  damage: z.number(),
  damageType: DamageTypeSchema.default('soul'),
  armor: z.number().default(0),
  resist: z.number().default(0),
  range: z.number().default(30),
  atkSpeed: z.number().default(1),
  moveSpeed: z.number(),
  gold: z.number().default(0),
  points: z.number().default(0),
});

const EventDefSchema = z.object({
  id: z.string(),
  kind: z.enum(['procession', 'parade', 'well', 'oni']),
  name: z.string(),
  desc: z.string().default(''),
  weight: z.number(),
  fromPhase: z.number().int().default(1),
  toPhase: z.number().int().default(99),
  warnSec: z.number(),
  durationSec: z.number(),
  /** neutral: only slots on the symmetry axis (equidistant from both bases); any: every open slot. */
  siteMode: z.enum(['neutral', 'any']).default('any'),
  radius: z.number(),
  lanes: z.array(LaneSchema).default([]),
  units: z.array(EventUnitSchema).default([]),
  scalePerPhase: z.number().default(0),
  aggro: z.number().default(150),
  leash: z.number().default(260),
  holdSec: z.number().default(0),
  buffs: z.array(ModSchema).default([]),
  buffSec: z.number().default(0),
  rewardPoints: z.number().default(0),
  rewardGoldTeam: z.number().default(0),
  rewardGoldKiller: z.number().default(0),
  minKills: z.number().int().default(1),
  telegraph: z
    .object({
      cooldownSec: z.number(),
      windupSec: z.number(),
      radius: z.number(),
      damage: z.number(),
      damageType: DamageTypeSchema.default('true'),
    })
    .optional(),
  aiWeight: z.number().default(0.8),
  aiRadius: z.number().default(500),
  aiMax: z.number().int().default(2),
});

export const EventFileSchema = z.object({ events: z.array(EventDefSchema) });

export const BadgesSchema = z.object({
  badges: z.array(
    z.object({
      id: z.string(),
      metric: z.string(),
      rank: z.enum(['max', 'min']),
      label: z.string(),
    }),
  ),
});

const MinionSchema = z.object({
  hp: z.number(),
  damage: z.number(),
  damageType: DamageTypeSchema.default('blade'),
  armor: z.number(),
  resist: z.number(),
  range: z.number(),
  atkSpeed: z.number(),
  moveSpeed: z.number(),
  gold: z.number(),
});

export const TECHNIQUE_SLOTS = [
  'attack',
  'skill1',
  'skill2',
  'skill3',
  'signature',
  'trait',
] as const;
const TechniqueSlotSchema = z.enum(TECHNIQUE_SLOTS);
export const GRADES = ['plain', 'sharp', 'brilliant'] as const;
export const TECHNIQUE_POOLS = ['common', 'piece', 'archetype', 'combination'] as const;
/** What a card's "last Act" line counts (the piece's own tally from the Act before the break). */
export const ESTIMATE_COUNTS = ['hits', 'pieceHits', 'casts', 'damageTaken'] as const;

/**
 * A Technique (SPEC-PIECE-BUILDS 4.3): a card that changes one part of a piece. The ability tweak
 * fields work as a fork option's do; for a skill or Signature slot they act on that slot's skill.
 * Grades scale the bonus (`builds.grades`); a Dubious price never scales.
 */
const TechniqueSchema = z.object({
  id: z.string(),
  name: z.string(),
  school: SchoolSchema,
  slot: TechniqueSlotSchema,
  /** common: any piece (Attack or Trait); piece: one piece type; archetype: one Rank 4 style; combination: two parents. */
  pool: z.enum(TECHNIQUE_POOLS),
  piece: PieceIdSchema.optional(),
  /** Style id for the archetype pool (with `piece`). */
  archetype: z.string().optional(),
  /** Combination: parent 1 (upgraded into this, in its slot) and parent 2 (stays). */
  parents: z.tuple([z.string(), z.string()]).optional(),
  weight: z.number().min(0).default(1),
  /** The skill the tweak acts on (0-2 base skills, 3 the Signature); defaults to the slot's skill. */
  ability: z.number().int().min(0).max(3).optional(),
  cooldownMul: z.number().default(1),
  powerMul: z.number().default(1),
  rangeMul: z.number().default(1),
  radiusMul: z.number().default(1),
  mods: z.array(ModSchema).default([]),
  triggers: z.array(TriggerSchema).default([]),
  /** Grades also scale the triggers' custom `param` (e.g. seconds of cooldown ticked). */
  scaleParam: z.boolean().default(false),
  /** Dubious (?!): the stated price, the same at every grade. */
  dubious: z
    .object({
      mods: z.array(ModSchema).default([]),
      triggers: z.array(TriggerSchema).default([]),
      text: z.string(),
    })
    .optional(),
  /** The card's "last Act" line: `count` from the piece's last Act, divided by `per`, then `label`. */
  estimate: z
    .object({
      count: z.enum(ESTIMATE_COUNTS),
      per: z.number().positive().default(1),
      label: z.string(),
    })
    .optional(),
  /** One plain line on how the piece plays with it. */
  playsLike: z.string(),
  /**
   * The rule, with every number as a `{path|format}` placeholder into this Technique's own (graded)
   * data, e.g. `{triggers.0.effects.0.bladeScale|pct}`. Formats: pct (x100), mul ((x-1)x100),
   * less ((1-x)x100), num.
   */
  desc: z.string(),
});

export const TechniqueFileSchema = z.object({ techniques: z.array(TechniqueSchema).min(1) });

const BuildsTuningSchema = z.object({
  /** Bonus multiplier per grade (Plain, Sharp, Brilliant). */
  grades: z.object({ plain: z.number(), sharp: z.number(), brilliant: z.number() }),
  /** Odds of [Plain, Sharp, Brilliant] at Setup, break 1, break 2, break 3 and later. */
  gradeOdds: z.array(z.tuple([z.number(), z.number(), z.number()])).min(2),
  reroll: z.object({ base: z.number(), step: z.number() }),
  /** Gold to upgrade Plain to Sharp, and Sharp to Brilliant. */
  upgrade: z.tuple([z.number(), z.number()]),
  passGold: z.number(),
  /** Draw weights: the Opening's schools, schools the piece holds, the cap, Dubious for the trailing side. */
  weights: z.object({
    opening: z.number(),
    held: z.number(),
    max: z.number(),
    dubiousBehind: z.number(),
  }),
  /** The AI's card score (spec 4.6). */
  ai: z.object({
    grade: z.tuple([z.number(), z.number(), z.number()]),
    fills: z.number(),
    replaces: z.number(),
    replacesGrade: z.number(),
    replacesCombination: z.number(),
    fit: z.number(),
    school: z.number(),
    combination: z.number(),
    parent: z.number(),
    parentReady: z.number(),
    jitter: z.number(),
    rerollBelow: z.number(),
    maxRerolls: z.number().int(),
  }),
  /** "Pick for me": how the 1-2 picks that matter most are chosen. */
  advice: z.object({
    gradeStakes: z.tuple([z.number(), z.number(), z.number()]),
    combination: z.number(),
    carry: z.number(),
    secondShare: z.number(),
  }),
  /**
   * The Rank growth that replaces item stats once items retire (spec 4.8, measured in
   * BALANCE-TECHNIQUES-2026-10-18): per Rank above 1, + this fraction of health and of the piece's
   * main damage stat (Blade or Soul, whichever its base is higher in), in place of `ranks.growth`,
   * in a match with `items: false`. The other damage stat keeps `ranks.growth`.
   */
  rankGrowth: z.object({ health: z.number(), damage: z.number() }),
});

export const TuningSchema = z.object({
  tickRate: z.number(),
  phaseSeconds: z.number(),
  startingGold: z.number(),
  passiveGoldPerSec: z.number(),
  maxPhases: z.number().int(),
  /**
   * Blitz pace (`MatchConfig.pace: 'blitz'`, review 4.2 item 2B): the same 240 s Acts, but at most
   * `maxActs` of them, the Endgame rule from `endgameAct` and Thrones at `throneHp`. A match with
   * no Checkmate when the last Act ends is adjudicated. Classical ignores this block.
   */
  blitz: z.object({
    maxActs: z.number().int(),
    endgameAct: z.number().int(),
    throneHp: z.number(),
  }),
  /** The Act break: countdown alerts, the grey wait for calm, the tolls and the slow halt. */
  bell: z.object({
    /** Seconds before the bell at which the clock flashes an alert. */
    alertsSec: z.array(z.number()),
    /** In the last N seconds the clock pulses on every second, each bigger than the last. */
    pulseLastSec: z.number().int(),
    /** Seconds with none of the ten pieces in combat that count as calm. */
    calmSec: z.number(),
    /** The longest the bell waits for calm before it tolls anyway. */
    capSec: z.number(),
    tolls: z.number().int(),
    tollSec: z.number(),
    /** Sim ticks of the slow halt; the app slows its step rate from 1 to 0 across them. */
    haltTicks: z.number().int(),
    /** Board saturation while the bell is pending (1 is full colour). */
    pendingSaturation: z.number(),
    /** The next pawnling wave spawns this many seconds after the Act resumes. */
    resumeWaveSec: z.number(),
    /** The AI moves one piece with at least `minDeaths` deaths in the Act, with this chance. */
    replan: z.object({ minDeaths: z.number().int(), chance: z.number() }),
  }),
  /**
   * Piece builds with Techniques (SPEC-PIECE-BUILDS-2026-10-18): grades, offer odds, gold costs and
   * the AI's pick weights. Read only when a match plays with `MatchConfig.techniques`.
   */
  builds: BuildsTuningSchema,
  /** Ranks 1-8 from lifetime gold earned. */
  ranks: z.object({
    goldThresholds: z.array(z.number()).length(8),
    /** Per rank above 1: +growth fraction of health, Blade damage and Soul power. */
    growth: z.number(),
    /** Seconds White's fork waits for the player before the AI picks. */
    forkSec: z.number(),
  }),
  /** Elite pawns fielded with Tempo (pawnlings are the minion waves below). */
  pawns: z.object({
    cost: z.number(),
    capBase: z.number().int(),
    capFromAct: z.number().int(),
    capPerAct: z.number().int(),
    hp: z.number(),
    damage: z.number(),
    damageType: DamageTypeSchema.default('blade'),
    armor: z.number(),
    resist: z.number(),
    range: z.number(),
    atkSpeed: z.number(),
    moveSpeed: z.number(),
    scalePerAct: z.number(),
    structureMul: z.number(),
    /** Gold to the killing piece and to each piece of the killing team. */
    bounty: z.number(),
    teamBounty: z.number(),
    /** Tempo the standing pawn plan keeps back for gambits (Pawn Structure lets you choose). */
    planReserve: z.number(),
    /** Pawns per lane of the AI's standing plan (the same counts a browser match starts with). */
    planQuota: z.object({ top: z.number(), mid: z.number(), bot: z.number() }),
    /** Tempo the AI keeps after paying for a card, to refill its plan when a pawn falls. */
    aiCardReserve: z.number(),
    /** Share of the AI's Tempo spending that goes to pawns; cards get the rest (`aiTempoTurn`). */
    aiPawnShare: z.number().min(0).max(1),
  }),
  /** The relic draft at each Act break. */
  relics: z.object({
    /** Relics held at most. */
    max: z.number().int(),
    /** Relics offered per break. */
    offers: z.number().int(),
    /** A lane move-speed bonus from relics and cards together stops at this fraction. */
    laneSpeedCap: z.number(),
    /** Relic pawn-cap bonuses never add more than this. */
    pawnCapMax: z.number().int(),
    /** Pawn Structure: the Tempo reserves a player may keep back. */
    reserves: z.array(z.number()),
    /** Behind: this much less Tempo earned in the Act (or fewer Bastions, or a fallen Throne). */
    behindTempo: z.number(),
    ai: z.object({
      base: z.number(),
      /** Added to the tailored offer when the worst bad callout is at least `tailoredSeverity`. */
      tailored: z.number(),
      tailoredSeverity: z.number(),
      /** Per tag the AI's side matches. */
      tag: z.number(),
      jitter: z.number(),
    }),
  }),
  gambits: z.object({
    tempoStart: z.number(),
    tempoMax: z.number(),
    tempoPerSec: z.number(),
    tempoPieceKill: z.number(),
    tempoBastion: z.number(),
    tempoPawnKill: z.number(),
    tempoPawnlingKill: z.number(),
    handSize: z.number().int(),
    refillSec: z.number(),
    expireSec: z.number(),
    /** Relic discounts never bring a card below this many Tempo. */
    minCost: z.number(),
  }),
  check: z.object({ kingRespawnMul: z.number(), damageMul: z.number() }),
  /** Combat feedback (information only): why a piece fell, fight verdicts, lane momentum, gambit impact. */
  feedback: z.object({
    death: z.object({
      /** Damage taken in this many seconds before a death is read for its cause. */
      windowSec: z.number(),
      /** Burst: this fraction of max health inside `burstSec`. */
      burstFrac: z.number(),
      burstSec: z.number(),
      /** Focus: this many distinct enemy pieces hit it within `windowSec`. */
      focusAttackers: z.number().int(),
      /** "Nearby" for the outnumbered count. */
      nearRadius: z.number(),
      /** Out of position: no allied piece or structure within this radius at death. */
      isolatedRadius: z.number(),
      /** Out of position: farther than this from its assigned lane with no ally piece nearby. */
      laneOffMax: z.number(),
    }),
    fight: z.object({
      /** Pieces in combat within this distance of each other (or of the fight) are one fight. */
      radius: z.number(),
      /** The fight ends this long after no cluster of both sides is in combat (the 1.5 s combat timer runs first). */
      endSec: z.number(),
      /** Within this distance of a lane's centre line the fight is "on" that lane. */
      laneRadius: z.number(),
      /** Within this distance of a Throne the fight is at that base. */
      baseRadius: z.number(),
    }),
    momentum: z.object({
      /** Piece kills in a lane count for this many seconds. */
      killWindowSec: z.number(),
      /** Net piece kills over `killWindowSec` that fill the kill term. */
      killsFull: z.number(),
      /** How far the clash point moves from the lane centre to fill the front term (fraction of the lane). */
      frontSpan: z.number(),
      weights: z.object({ front: z.number(), structures: z.number(), kills: z.number() }),
    }),
    impact: z.object({
      /** Instant cards (Castle, Fork, Pawn Sacrifice) are watched this long for their swing. */
      graceSec: z.number(),
      /** Barricade: enemy units this close to the wall count as having met it. */
      barricadeNear: z.number(),
    }),
  }),
  waves: z.object({
    firstSec: z.number(),
    intervalSec: z.number(),
    melee: z.number().int(),
    ranged: z.number().int(),
    extraMeleePerPhaseAfter: z.number().int(),
    extraMeleeFromPhase: z.number().int(),
    scalePerPhase: z.number(),
    midLeadUnits: z.number(),
  }),
  minions: z.object({
    melee: MinionSchema,
    ranged: MinionSchema,
    structureMul: z.number(),
    structureMulPerPhase: z.number(),
  }),
  tower: z.object({
    hp: z.number(),
    damage: z.number(),
    range: z.number(),
    atkSpeed: z.number(),
    armor: z.number(),
    resist: z.number(),
    gold: z.number(),
    teamGold: z.number(),
    heroDamageMul: z.number(),
    innerHpMul: z.number(),
    maxHpPerSec: z.number(),
  }),
  guardian: z.object({
    hp: z.number(),
    damage: z.number(),
    range: z.number(),
    atkSpeed: z.number(),
    armor: z.number(),
    resist: z.number(),
    hpRegen: z.number(),
    rageThresholds: z.array(z.number()),
    rageDamageMul: z.number(),
  }),
  gold: z.object({
    heroKill: z.number(),
    assist: z.number(),
    shareRadius: z.number(),
    minionShare: z.number(),
    killBountyPerStreak: z.number(),
    comebackBounty: z.number(),
  }),
  respawn: z.object({
    baseSec: z.number(),
    basePerPhase: z.number(),
    growthPerSec: z.number(),
    maxSec: z.number(),
  }),
  attunement: z.record(
    CategorySchema,
    z.array(
      z.object({
        count: z.number().int(),
        title: z.string(),
        text: z.string(),
        mods: z.array(ModSchema),
      }),
    ),
  ),
  shop: z.object({
    slots: z.number().int(),
    sellRefund: z.number(),
    baseRadius: z.number(),
    keeperRadius: z.number(),
    jungleRadius: z.number(),
    keeperStock: z.number().int(),
    unlockDiscount: z.number(),
  }),
  recall: z.object({ baseSec: z.number() }),
  movement: z.object({
    arriveDist: z.number(),
    /** One multiplier on every unit's walking speed; keeps the pace when the map grows. */
    speedMul: z.number(),
  }),
  /** Soft body collision: units shove each other apart so pieces and pawns never stack. */
  collision: z.object({
    /** Body radius by kind of unit. Neutrals (camps, event units) grow with their health. */
    radius: z.object({
      piece: z.number(),
      pawn: z.number(),
      pawnling: z.number(),
      tower: z.number(),
      guardian: z.number(),
      obelisk: z.number(),
      keeper: z.number(),
      neutralBase: z.number(),
      neutralPerHp: z.number(),
      neutralMax: z.number(),
    }),
    /** Who gives way: the lighter body moves further. Structures never move. */
    mass: z.object({
      piece: z.number(),
      pawn: z.number(),
      pawnling: z.number(),
      neutral: z.number(),
    }),
    /** Overlap left alone (no jitter), the share of the rest removed per pass, passes per tick. */
    tolerance: z.number(),
    stiffness: z.number(),
    iterations: z.number().int(),
    /** Most a unit is shoved in one tick. */
    maxPush: z.number(),
    /** Sideways step, as a share of the shove, for a unit blocked head-on while walking. */
    slide: z.number(),
    /** Gap and sideways stagger between the pawnlings of a wave on spawn. */
    spawnGap: z.number(),
    spawnStagger: z.number(),
  }),
  /**
   * Engagement spacing: attackers take distinct slots on a ring around their target (melee just
   * inside reach, ranged at a standoff), fanned toward their own side, and keep personal space from
   * teammates while fighting. Heavy hits nudge the victim back a little.
   */
  spacing: z.object({
    /** Attackers with at most this reach take melee slots; longer reach takes a standoff slot. */
    meleeMaxRange: z.number(),
    /** The melee ring sits this far inside attack reach. */
    meleeInset: z.number(),
    /** Gap between neighbouring slots (melee, ranged). */
    meleeGap: z.number(),
    rangedGap: z.number(),
    /** Ranged standoff distance as a share of attack reach. */
    rangedFrac: z.number(),
    /** Pull of the fan toward the attackers' own base (two lines instead of one blob). */
    sideBias: z.number(),
    /** Beyond the slot ring plus this, an attacker walks straight at its target. */
    approach: z.number(),
    /** Speed share while easing into the slot between blows, and the least distance worth it. */
    driftSpeed: z.number(),
    driftMin: z.number(),
    /** Extra body margin between teammates while either is in a fight. */
    combatSpace: z.object({ piece: z.number(), pawn: z.number(), pawnling: z.number() }),
    /** Heavy hits: at least `minFrac` of max health nudges the victim `perFrac` x share, at most `max`. */
    knockback: z.object({ minFrac: z.number(), perFrac: z.number(), max: z.number() }),
  }),
  /** Piece judgement: odds, tower dives and retreating at low health. */
  judgement: z.object({
    /** Local power ratio (pawns and structures counted) below which a piece never fights. */
    badOdds: z.number(),
    /** A kill counts as near-certain when the target falls to the local damage within this time. */
    finishSec: z.number(),
    /** Health share at which each piece breaks off and retreats (by role). */
    retreatHp: z.record(z.string(), z.number()),
    /** Health share above the retreat line needed before a fleeing piece turns back. */
    retreatExitHp: z.number(),
    /** A fleeing piece turns back only once its odds clear the hold line by this factor... */
    fleeExit: z.number(),
    /** ...and not before this many seconds of fleeing. */
    fleeMinSec: z.number(),
    /** Below this health share a piece never follows a target into enemy Bastion or Throne range. */
    diveHp: z.number(),
    /** Extra distance around a structure's reach that counts as its range for a dive. */
    diveMargin: z.number(),
    /** Share of an enemy Bastion's or Throne's power counted while it shoots pawns, not pieces. */
    busyStructure: z.number(),
    /** Chase leash multiplier against an enemy piece below `chaseHurtHp` health. */
    chaseHurtHp: z.number(),
    chaseHurt: z.number(),
  }),
  /** High-ground rules (maps with `terraces` only). */
  height: z.object({
    /** Attack range multiplier when the attacker stands on a higher tier than its target. */
    reachMul: z.number(),
    /** Reach applies only to attackers with at least this base range (not structures). */
    reachMinRange: z.number(),
    /** Target scan radius multiplier when looking down. */
    sightMul: z.number(),
    /** Looking up, a unit only picks targets within its attack range plus this. */
    sightUpPad: z.number(),
    /** Fight odds: units above the fight centre's tier count this much more power. */
    oddsBonus: z.number(),
    /** A hit from a tier above its target deals 1 + this much, from a tier below 1 − this. */
    slopeDmg: z.number(),
    /** A defending piece holds this far above the nearest ramp top of its lane... */
    holdOffset: z.number(),
    /** ...when its farm point lies at most this far down the lane below that ramp top. */
    holdWindow: z.number(),
  }),
  ai: z.object({
    aggroRadius: z.number(),
    fightRadius: z.number(),
    allyRadius: z.number(),
    shopAtBaseGold: z.number(),
    healBaseRadius: z.number(),
    baseHealPerSec: z.number(),
    pushWaveRadius: z.number(),
    defendRadius: z.number(),
    curseAcceptBase: z.number(),
    siegeStartHp: z.number(),
    siegeKeepHp: z.number(),
    siegeAfterTick: z.number(),
    siegeGather: z.number(),
    siegeScore: z.number(),
    siegeWaitTicks: z.number(),
    siegeAssignedBonus: z.number(),
    siegeMidPenalty: z.number(),
    siegeLaneStick: z.number(),
    laneHugRadius: z.number(),
    defendOffLaneRadius: z.number(),
    holdPatience: z.number(),
    guardianThreatRadius: z.number(),
    huntRadius: z.number(),
    huntScore: z.number(),
    shopTripGold: z.number(),
    shopTripRadius: z.number(),
    shopTripScore: z.number(),
    tier3TripRadius: z.number(),
    swapAfterDeaths: z.number().int(),
    dominatedGap: z.number().int(),
    lossWindowTicks: z.number(),
    cautiousDeaths: z.number().int(),
    cautiousTicks: z.number(),
    healSafeHp: z.number(),
    rescueRadius: z.number(),
    rescueScore: z.number(),
    rescueRatio: z.number(),
    commitBonus: z.number(),
    easyKillHp: z.number(),
    holdBraveCap: z.number(),
    tier3TripScore: z.number(),
  }),
  personalities: z.record(
    z.string(),
    z.object({
      engageRatio: z.number(),
      chase: z.number(),
      riskTaking: z.number(),
    }),
  ),
  posture: z.record(z.string(), z.record(z.string(), z.number())),
  curse: z.object({
    threshold: z.number(),
    minPhase: z.number().int(),
  }),
  obelisk: z.object({
    spawnSec: z.array(z.number()),
    claimSec: z.number(),
    radius: z.number(),
    points: z.number(),
    expireSec: z.number(),
    rewards: z.array(
      z.object({
        kind: z.enum(['points', 'gold', 'buff', 'unlock']),
        weight: z.number(),
        value: z.number().default(0),
        stat: StatKeySchema.optional(),
        mod: z.enum(['add', 'mul']).optional(),
      }),
    ),
  }),
  camps: z.object({ respawnSec: z.number(), leash: z.number(), aggro: z.number() }),
  fight: z.object({ clusterGapSec: z.number(), clusterRadius: z.number() }),
  events: z.object({
    firstSec: z.number(),
    gapSec: z.number(),
    jitterSec: z.number(),
    perPhase: z.array(z.number().int()),
    endMarginSec: z.number(),
  }),
});

export type StatKey = (typeof STAT_KEYS)[number];
export type DamageType = z.infer<typeof DamageTypeSchema>;
export type Role = z.infer<typeof RoleSchema>;
export type LaneId = z.infer<typeof LaneSchema>;
export type Posture = z.infer<typeof PostureSchema>;
export type Disposition = z.infer<typeof DispositionSchema>;
export type Stats = z.infer<typeof StatsSchema>;
export type ModDef = z.infer<typeof ModSchema>;
export type EffectDef = z.infer<typeof EffectSchema>;
export type AbilityDef = z.infer<typeof AbilitySchema>;
export type TriggerDef = z.infer<typeof TriggerSchema>;
export type PieceId = z.infer<typeof PieceIdSchema>;
export type Path = z.infer<typeof PathSchema>;
export type PieceDef = z.infer<typeof PieceSchema>;
export type StyleDef = z.infer<typeof StyleSchema>;
export type PerkDef = z.infer<typeof PerkSchema>;
export type ForkOptionDef = z.infer<typeof ForkOptionSchema>;
export type GambitDef = z.infer<typeof GambitSchema>;
export type GambitTarget = z.infer<typeof GambitTargetSchema>;
export type School = z.infer<typeof SchoolSchema>;
export type OpeningDef = z.infer<typeof OpeningSchema>;
export type TournamentDef = z.infer<typeof TournamentSchema>;
export type CourtDef = z.infer<typeof CourtSchema>;
export type CourtEmblem = (typeof COURT_EMBLEMS)[number];
export type RelicDef = z.infer<typeof RelicSchema>;
export type RelicFamily = z.infer<typeof RelicFamilySchema>;
export type RelicEffect = (typeof RELIC_EFFECTS)[number];
export type SealedTrigger = z.infer<typeof SealedTriggerSchema>;
export type GambitEffect = (typeof GAMBIT_EFFECTS)[number];
export type ItemDef = z.infer<typeof ItemSchema>;
export type CursedItemDef = z.infer<typeof CursedItemSchema>;
export type CampTypeDef = z.infer<typeof CampTypeSchema>;
export type BiomeDef = z.infer<typeof BiomeSchema>;
export type MapDef = z.infer<typeof MapSchema>;
export type EventDef = z.infer<typeof EventDefSchema>;
export type EventUnitDef = z.infer<typeof EventUnitSchema>;
export type PressureDef = z.infer<typeof PressureSchema>['events'][number];
export type BadgeDef = z.infer<typeof BadgesSchema>['badges'][number];
export type Tuning = z.infer<typeof TuningSchema>;
export type TechniqueDef = z.infer<typeof TechniqueSchema>;
export type TechniqueSlot = z.infer<typeof TechniqueSlotSchema>;
export type Grade = (typeof GRADES)[number];
export type EstimateCount = (typeof ESTIMATE_COUNTS)[number];
