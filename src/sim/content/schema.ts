import { z } from 'zod';

export const STAT_KEYS = [
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

export const StatKeySchema = z.enum(STAT_KEYS);
export const DamageTypeSchema = z.enum(['blade', 'soul', 'true']);
export const RoleSchema = z.enum(['top', 'mid', 'bot']);
export const DispositionSchema = z.enum(['farmer', 'attacker', 'defender']);
export const LaneSchema = z.enum(['top', 'mid', 'bot']);
export const PostureSchema = z.enum(['push', 'farm', 'defend', 'default']);
export const CategorySchema = z.enum(['mind', 'body', 'soul']);

export const StatsSchema = z.object({
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

export const ModSchema = z.object({
  stat: StatKeySchema,
  kind: z.enum(['add', 'mul']),
  value: z.number(),
});

const amount = {
  base: z.number().default(0),
  bladeScale: z.number().default(0),
  soulScale: z.number().default(0),
};

export const EffectSchema = z.discriminatedUnion('type', [
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

export const AbilityTargetSchema = z.enum([
  'self',
  'enemy',
  'enemyArea',
  'enemyBurst',
  'allyArea',
  'lowestAlly',
]);

export const AbilitySchema = z.object({
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

export const TriggerSchema = z.object({
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

export const PersonalitySchema = z.enum(['reckless', 'cautious', 'opportunist', 'steadfast']);

export const PIECE_IDS = ['king', 'queen', 'rook', 'bishop', 'knight'] as const;
export const PieceIdSchema = z.enum(PIECE_IDS);
export const PATHS = ['offense', 'defense', 'utility'] as const;
export const PathSchema = z.enum(PATHS);

/**
 * One automatic improvement: an optional ability tweak (same shape as the old upgrade cards) plus
 * optional stat mods and triggers. Used for style rank bonuses (Ranks 2, 3, 5, 6, 7) and fork
 * options (Ranks 4 and 8).
 */
export const PerkSchema = z.object({
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

export const ForkOptionSchema = PerkSchema.extend({ id: z.string() });

const PathListsSchema = z.object({
  offense: z.array(z.string()),
  defense: z.array(z.string()),
  utility: z.array(z.string()),
});

export const StyleSchema = z.object({
  id: z.string(),
  name: z.string(),
  desc: z.string().default(''),
  /** Overrides the piece's attack kind (e.g. a melee style of a ranged piece). */
  attackKind: z.enum(['melee', 'ranged']).optional(),
  /** Overrides the piece's build lists for this style (any path left out uses the piece's). */
  paths: PathListsSchema.partial().optional(),
  /** The signature skill: becomes the piece's 4th ability. */
  ability: AbilitySchema,
  /** Stat tilt applied for the whole match. */
  mods: z.array(ModSchema).default([]),
  passives: z.array(TriggerSchema).default([]),
  ranks: z.object({
    '2': PerkSchema,
    '3': PerkSchema,
    '5': PerkSchema,
    '6': PerkSchema,
    '7': PerkSchema,
  }),
  forks: z.object({
    '4': z.array(ForkOptionSchema).length(2),
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
  /** Build path the AI prefers (and the setup board pre-fills); derived from disposition if absent. */
  defaultPath: PathSchema.optional(),
  /** Item build list per build path (item ids, in buy order). */
  paths: PathListsSchema,
});

export const GambitTargetSchema = z.enum(['lane', 'point', 'enemy', 'none']);

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
] as const;

export const GambitSchema = z.object({
  id: z.string(),
  name: z.string(),
  desc: z.string().default(''),
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

export const ItemSchema = z.object({
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

export const FlawSchema = z.object({
  id: z.string(),
  text: z.string(),
  mods: z.array(ModSchema).default([]),
  triggers: z.array(TriggerSchema).default([]),
});

export const CursedItemSchema = z.object({
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

export const HolyItemSchema = z.object({
  id: z.string(),
  name: z.string(),
  category: CategorySchema,
  mods: z.array(ModSchema).default([]),
  triggers: z.array(TriggerSchema).default([]),
  hint: z.string(),
  desc: z.string().default(''),
});

export const ItemFileSchema = z.object({
  items: z.array(ItemSchema).default([]),
  cursed: z.array(CursedItemSchema).default([]),
  holy: z.array(HolyItemSchema).default([]),
});

export const CampTypeSchema = z.object({
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

export const MapSchema = z.object({
  size: z.number(),
  lanes: z.object({ top: z.array(Pt), mid: z.array(Pt), bot: z.array(Pt) }),
  bases: z.object({ A: Pt, B: Pt }),
  guardianOffset: z.number(),
  towerFractions: z.object({ outer: z.number(), inner: z.number() }),
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

export const EventUnitSchema = z.object({
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

export const EventDefSchema = z.object({
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

export const TuningSchema = z.object({
  tickRate: z.number(),
  phaseSeconds: z.number(),
  startingGold: z.number(),
  passiveGoldPerSec: z.number(),
  maxPhases: z.number().int(),
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
  }),
  check: z.object({ kingRespawnMul: z.number(), damageMul: z.number() }),
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
    heroFocusSec: z.number(),
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
  movement: z.object({ arriveDist: z.number() }),
  ai: z.object({
    aggroRadius: z.number(),
    fightRadius: z.number(),
    allyRadius: z.number(),
    shopAtBaseGold: z.number(),
    recallBelowHp: z.number(),
    healBaseRadius: z.number(),
    baseHealPerSec: z.number(),
    wanderJitter: z.number(),
    pushWaveRadius: z.number(),
    defendRadius: z.number(),
    bidFraction: z.array(z.number()),
    bidGoldFraction: z.number(),
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
    joinFightRadius: z.number(),
    defendOffLaneRadius: z.number(),
    holdPatience: z.number(),
    guardianThreatRadius: z.number(),
    huntRadius: z.number(),
    huntScore: z.number(),
    suggestScore: z.number(),
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
      retreatHp: z.number(),
      engageRatio: z.number(),
      chase: z.number(),
      riskTaking: z.number(),
    }),
  ),
  posture: z.record(z.string(), z.record(z.string(), z.number())),
  curse: z.object({
    threshold: z.number(),
    maxPerPhase: z.number().int(),
    minPhase: z.number().int(),
  }),
  auction: z.object({ enabled: z.boolean(), pointRate: z.number(), loserRefund: z.number() }),
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

export const ContentSchema = z.object({
  pieces: z.array(PieceSchema).length(5),
  gambits: z.array(GambitSchema),
  items: z.array(ItemSchema),
  cursed: z.array(CursedItemSchema),
  holy: z.array(HolyItemSchema),
  biomes: z.array(BiomeSchema),
  pressure: PressureSchema,
  badges: BadgesSchema,
  map: MapSchema,
  tuning: TuningSchema,
});

export type StatKey = (typeof STAT_KEYS)[number];
export type DamageType = z.infer<typeof DamageTypeSchema>;
export type Role = z.infer<typeof RoleSchema>;
export type LaneId = z.infer<typeof LaneSchema>;
export type Posture = z.infer<typeof PostureSchema>;
export type Disposition = z.infer<typeof DispositionSchema>;
export type Category = z.infer<typeof CategorySchema>;
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
export type GambitEffect = (typeof GAMBIT_EFFECTS)[number];
export type ItemDef = z.infer<typeof ItemSchema>;
export type FlawDef = z.infer<typeof FlawSchema>;
export type CursedItemDef = z.infer<typeof CursedItemSchema>;
export type HolyItemDef = z.infer<typeof HolyItemSchema>;
export type CampTypeDef = z.infer<typeof CampTypeSchema>;
export type BiomeDef = z.infer<typeof BiomeSchema>;
export type MapDef = z.infer<typeof MapSchema>;
export type EventDef = z.infer<typeof EventDefSchema>;
export type EventUnitDef = z.infer<typeof EventUnitSchema>;
export type PressureDef = z.infer<typeof PressureSchema>['events'][number];
export type BadgeDef = z.infer<typeof BadgesSchema>['badges'][number];
export type Tuning = z.infer<typeof TuningSchema>;
export type RawContent = z.input<typeof ContentSchema>;
