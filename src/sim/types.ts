import type { RngState } from './core/rng';
import type {
  DamageType,
  Disposition,
  GambitTarget,
  LaneId,
  Path,
  PieceId,
  Posture,
  Role,
  School,
  SealedTrigger,
  StatKey,
  Stats,
} from './content/schema';

export type {
  DamageType,
  Disposition,
  GambitTarget,
  LaneId,
  Path,
  PieceId,
  Posture,
  Role,
  School,
  SealedTrigger,
  StatKey,
  Stats,
};

export type TeamId = 'A' | 'B' | 'neutral';
export type PlayTeam = 'A' | 'B';
export type UnitKind = 'hero' | 'minion' | 'tower' | 'guardian' | 'camp' | 'obelisk' | 'keeper';
/** setup (White picks styles, paths and lanes) -> live (Acts run back to back) -> end (checkmate). */
type PhaseKind = 'setup' | 'live' | 'end';

export const other = (t: PlayTeam): PlayTeam => (t === 'A' ? 'B' : 'A');

export interface Modifier {
  id: string;
  stat: StatKey;
  kind: 'add' | 'mul';
  value: number;
  source: string;
  tags: string[];
  expiresTick: number | null;
}

interface ShieldInst {
  amount: number;
  expiresTick: number;
}

interface DotInst {
  dtype: DamageType;
  dps: number;
  endTick: number;
  sourceId: number;
  origin: string;
}

export type GoalKind =
  | 'farmLane'
  | 'pushTower'
  | 'defendTower'
  | 'clearCamp'
  | 'joinFight'
  | 'takeObelisk'
  | 'contestEvent'
  | 'visitShop'
  | 'retreat'
  | 'recall'
  | 'base'
  | 'regroup';

export interface Goal {
  kind: GoalKind;
  x: number;
  y: number;
  targetId: number | null;
  key: string;
}

interface RecallState {
  startTick: number;
  endTick: number;
  dest: 'base';
  auto: boolean;
}

/** A rank bonus (optionId null) or a fork choice applied to a piece. */
export interface PerkRef {
  rank: number;
  optionId: string | null;
}

/** A standing order from a gambit: strongly preferred goal until it runs out. */
export interface GambitOrder {
  kind: 'push' | 'defend' | 'gather';
  lane: LaneId | null;
  x: number;
  y: number;
  targetId: number | null;
  untilTick: number;
}

export interface HeroState {
  /** Piece id (also the unit's defId). */
  defId: PieceId;
  /** The archetype chosen at Rank 4; null while the piece is still generic (Ranks 1-3). */
  style: string | null;
  path: Path;
  rank: number;
  perks: PerkRef[];
  order: GambitOrder | null;
  /** Siege gambit: multiplier on damage dealt to Bastions and Thrones. */
  structMul: { value: number; untilTick: number } | null;
  slot: number;
  role: Role;
  lane: LaneId | null;
  posture: Posture;
  disposition: Disposition;
  jungler: boolean;
  items: string[];
  /**
   * The piece's armory plan: six item ids it buys in order (set at an Act break), or null to
   * follow its build path's list (its archetype's list from Rank 4).
   */
  plan: string[] | null;
  flaws: Record<string, string>;
  gold: number;
  goldEarned: number;
  kills: number;
  deaths: number;
  assists: number;
  streak: number;
  respawnAt: number | null;
  cd: number[];
  recall: RecallState | null;
  goal: Goal | null;
  goalSetTick: number;
  lastDamagedTick: number;
  lastDealtTick: number;
  trigCd: Record<string, number>;
  revived: boolean;
  attackers: { id: number; tick: number }[];
  distance: number;
  engage: 'fight' | 'hold' | 'flee';
  engageTick: number;
  holdTicks: number;
  /** Tick the current flee began (for the minimum flee time). */
  fleeSince: number;
  lastRecallTick: number;
  lossStreak: number;
  lastDeathTick: number;
  lastStandUsed: boolean;
  /** Damage taken lately, merged per attacker and fifth of a second (feeds the death cause). */
  hits: DamageHit[];
  /** Why this piece last fell (kept while it waits to respawn). */
  fall: Fall | null;
}

/** Why a piece fell: burst, focus (3+ attackers), outnumbered nearby, caught alone, or an even trade. */
export type DeathCause = 'burst' | 'focus' | 'outOfPosition' | 'outnumbered' | 'traded';

/** A lane, the jungle, or a Throne's grounds: where a fight happened. */
export type FightZone = LaneId | 'jungle' | 'baseA' | 'baseB';

/** Where a piece is for the HUD's lane tag: a lane, the jungle, or at or on its way to base. */
export type LaneNow = LaneId | 'jungle' | 'base';

interface DamageHit {
  tick: number;
  src: number;
  kind: UnitKind;
  amount: number;
}

export interface Fall {
  cause: DeathCause;
  /** The killing blow's piece, if a piece landed it. */
  killer: PieceId | null;
  killerKind: UnitKind | 'none';
  /** Enemy pieces that hurt it lately, most damage first (at most three). */
  by: PieceId[];
  tick: number;
}

interface CampState {
  slot: string;
  spot: number;
  typeId: string;
  homeX: number;
  homeY: number;
  biomeId: string;
}

interface ObeliskState {
  nodeId: string;
  claim: Record<PlayTeam, number>;
  expireTick: number;
}

interface EventUnitState {
  eventId: number;
  unitDef: string;
  mode: 'passive' | 'march' | 'boss';
  /** Ignored by lane minions and towers (only heroes fight it). */
  ghost: boolean;
  homeX: number;
  homeY: number;
}

export interface EventInst {
  id: number;
  defId: string;
  kind: 'procession' | 'parade' | 'well' | 'oni';
  slot: string;
  x: number;
  y: number;
  radius: number;
  phase: 'warning' | 'active';
  warnEndTick: number;
  endTick: number;
  unitIds: number[];
  total: number;
  progress: number;
  holder: PlayTeam | null;
  claim: Record<PlayTeam, number>;
  kills: Record<PlayTeam, number>;
  route: [number, number][];
  lane: LaneId | null;
  target: PlayTeam | null;
  slamNext: number;
  tele: { x: number; y: number; endTick: number } | null;
}

interface EventScheduleEntry {
  tick: number;
  defId: string;
}

interface TowerState {
  lane: LaneId;
  index: 0 | 1;
}

export interface Unit {
  id: number;
  kind: UnitKind;
  team: TeamId;
  defId: string;
  x: number;
  y: number;
  px: number;
  py: number;
  hp: number;
  alive: boolean;
  base: Stats;
  stats: Stats;
  mods: Modifier[];
  shields: ShieldInst[];
  dots: DotInst[];
  dirty: boolean;
  atkCd: number;
  targetId: number | null;
  atkType: DamageType;
  atkRange: number;
  path: [number, number][];
  pathI: number;
  lane: LaneId | null;
  structWindow?: { tick: number; taken: number };
  pendingKill: { killerId: number } | null;
  bounty: number;
  hero?: HeroState;
  tower?: TowerState;
  camp?: CampState;
  obelisk?: ObeliskState;
  ev?: EventUnitState;
  rageStage?: number;
  /** An elite pawn fielded with Tempo (pawnlings are plain minions). */
  pawn?: boolean;
  /** Stunned (no moving, attacking or casting) until this tick. */
  stunUntil?: number;
  /** Taunted: must attack unit `by` until the tick. */
  taunt?: { by: number; untilTick: number };
  lastDamagedTick: number;
  /** Knockback queued by heavy hits this tick, applied with the body collisions. */
  knock?: { x: number; y: number };
  /** Waypoint around solid terrain while the unit walks a detour; null when it walks straight. */
  detour: { x: number; y: number; untilTick: number } | null;
}

interface TeamState {
  points: number;
  unlocks: string[];
  heroIds: number[];
  kills: number;
  towersDown: number;
  guardianId: number;
  curseOffers: number;
}

export interface SlotState {
  id: string;
  open: boolean;
  biomeId: string | null;
  campRespawn: (number | null)[];
  campIds: number[][];
  types: string[];
  mirrored: boolean;
}

export interface CurseOffer {
  heroId: number;
  itemId: string;
  phase: number;
  resolved: boolean;
  accepted: boolean;
}

interface KeeperState {
  unitId: number;
  spot: string;
  stock: string[];
}

interface PhaseState {
  kind: PhaseKind;
  n: number;
  startTick: number;
}

/** none: the Act runs. pending: the clock hit 0:00, waiting for calm. tolling: the three tolls. halt: the slow stop. break: frozen on the sheet. */
export type BellStage = 'none' | 'pending' | 'tolling' | 'halt' | 'break';

/** A fight in progress: pieces from both sides in combat in the same area. */
export interface OpenFight {
  id: number;
  startTick: number;
  lastTick: number;
  x: number;
  y: number;
  sx: number;
  sy: number;
  n: number;
  pieces: Record<PlayTeam, number[]>;
  /** Pieces each side lost in it. */
  lost: Record<PlayTeam, number>;
  pawnlings: Record<PlayTeam, number>;
  pawns: Record<PlayTeam, number>;
  /** Damage each side's Bastions and Throne took. */
  bastion: Record<PlayTeam, number>;
}

/** What a played gambit did while it was active (everything the sim can attribute, nothing more). */
export interface CardMetrics {
  /** Damage dealt by the units the card covers. */
  dealt: number;
  /** Part of `dealt` that hit Bastions or Thrones. */
  structure: number;
  /** Damage the covered units took. */
  taken: number;
  /** Extra damage the card itself caused (its multiplier's share), net of any backlash. */
  bonus: number;
  /** Damage an armor or resist bonus turned away. */
  prevented: number;
  healed: number;
  /** Piece kills and losses next to the card's effect. */
  kills: number;
  deaths: number;
  /** Barricade: enemy units that came up to the wall. */
  met: number;
  /** Enemy Tempo drained. */
  drained: number;
}

export interface CardRun extends CardMetrics {
  id: number;
  team: PlayTeam;
  cardId: string;
  cost: number;
  startTick: number;
  endTick: number;
  scope: 'lane' | 'ids' | 'team' | 'point';
  who: 'any' | 'hero' | 'minion';
  lane: LaneId | null;
  x: number;
  y: number;
  r: number;
  ids: number[];
  targetId: number | null;
  /** Where `bonus` comes from: which damage, the multiplier on it, and the one after `until`. */
  attr: { on: 'dealt' | 'structure' | 'taken' | 'none'; mul: number; until: number; after: number };
  armor: boolean;
  fell: boolean;
  seen: number[];
}

export interface FeedbackState {
  fights: OpenFight[];
  nextFight: number;
  laneKills: { tick: number; lane: LaneId; team: PlayTeam }[];
  runs: CardRun[];
  nextRun: number;
}

/** Counters the event log cannot give (reset when an Act starts). */
export interface ActTally {
  /** Event seq of the Act's first event; the report reads the log from here. */
  startSeq: number;
  tempo: Record<PlayTeam, number>;
  waves: number;
  pawnlingsLost: Record<PlayTeam, Record<LaneId, number>>;
}

/** Who picks a side's relics: the AI rule, nobody, random, or the player (the browser's White). */
export type RelicMode = 'ai' | 'none' | 'random' | 'manual';

/** Pawn Structure: how many elite pawns to keep in each lane. */
export type PawnQuota = Record<LaneId, number>;

/** White's standing pawn plan: pawns fielded toward these counts when Tempo allows. */
export interface PawnPlan {
  quota: PawnQuota;
  /** Tempo kept back so gambits stay playable. */
  reserve: number;
  /** Auto fielding on or off (a toggle for the match); off keeps the counts but fields nothing. */
  auto: boolean;
}

/** A relic held for the rest of the match, with what it is aimed at. */
export interface HeldRelic {
  id: string;
  lane: LaneId | null;
  /** The bound piece's unit id. */
  piece: number | null;
  /** Standing Order: the lane card that is always on. Sealed Move: the card that fires. */
  card: string | null;
  /** Sealed Move: what sets the card off. */
  trigger: SealedTrigger | null;
  /** Pawn Structure: the pawns to keep in each lane. */
  quota: PawnQuota | null;
  /** Pawn Structure: Tempo kept back before an auto pawn is fielded. */
  reserve: number | null;
}

export type RelicAim = Pick<HeldRelic, 'lane' | 'piece' | 'card' | 'trigger' | 'quota' | 'reserve'>;

export interface RelicOffer {
  id: string;
  /** Slot 1: chosen from what went wrong in the Act report. */
  tailored: boolean;
  /** Why a tailored offer was made (a coach line); null for the random ones. */
  why: string | null;
  /** The aim the offer arrives with: the AI's rule, or the problem the tailored offer answers. */
  aim: RelicAim;
}

/** What the live relics keep track of (reset when an Act starts unless noted). */
export interface RelicRun {
  sealed: Record<PlayTeam, { fired: boolean; since: number | null; skip: number[] }>;
  /** An enemy piece fell this Act (a Sealed Move trigger). */
  enemyDown: Record<PlayTeam, boolean>;
  /** Sortie: Bastions that already called a rotation (kept for the match). */
  sortied: Record<PlayTeam, number[]>;
  /** Strong Square: the banner this Act and how long a lone enemy has stood on it. */
  banner: Record<PlayTeam, { x: number; y: number; toppled: boolean; alone: number } | null>;
  /** Curtain Wall: the last tick an enemy was near each Bastion. */
  wall: Record<number, number>;
}

interface RelicState {
  run: RelicRun;
  held: Record<PlayTeam, HeldRelic[]>;
  /** The three cards of the draft that is open at the break (empty otherwise). */
  offers: Record<PlayTeam, RelicOffer[]>;
  /** The draft at this break is done: a relic taken, declined, or nothing to offer. */
  settled: Record<PlayTeam, boolean>;
  /** The relic each side took at the latest break, for the resume banner. */
  latest: Record<PlayTeam, string | null>;
  /** Fewer Bastions standing, a fallen Throne, or much less Tempo earned in the last Act: Rally relics work. */
  behind: Record<PlayTeam, boolean>;
  mode: Record<PlayTeam, RelicMode>;
}

export interface BellState {
  stage: BellStage;
  /** Tick the current stage began. */
  since: number;
  /** Consecutive ticks with none of the ten pieces in combat (pending only). */
  calm: number;
  toll: number;
  report: ActReport | null;
}

export interface ActPieceStat {
  id: number;
  piece: PieceId;
  lane: LaneId;
  kills: number;
  deaths: number;
  damage: number;
  /** Damage this piece did not take (armor, resist, reductions, shields). */
  mitigated: number;
  /** Who killed it, by count: a piece id, or minion, tower, guardian, camp, none. */
  diedTo: Record<string, number>;
  /** Why it fell, by cause. */
  falls: Partial<Record<DeathCause, number>>;
}

/** One card's plays in an Act, summed. */
export interface ActCardStat extends CardMetrics {
  cardId: string;
  plays: number;
  tempo: number;
  seconds: number;
}

export interface ActTeamStat {
  tempo: number;
  damage: number;
  /** Damage this side's pieces did not take. */
  mitigated: number;
  pieceDeaths: number;
  pieceKills: number;
  /** Lanes where this team lost a Bastion. */
  bastionsLost: LaneId[];
  throneLost: boolean;
  obelisks: number;
  camps: number;
  gambits: number;
  pawns: number;
  /** Tempo held when the Act closed. */
  tempoHeld: number;
  pawnlingsLost: Record<LaneId, number>;
  pieces: ActPieceStat[];
  cards: ActCardStat[];
}

/** What each side did in the Act that just closed (the break sheet and the AI re-plan read it). */
export interface ActReport {
  act: number;
  waves: number;
  teams: Record<PlayTeam, ActTeamStat>;
  /** Fights with at least one piece lost, in order. */
  fights: FightRecord[];
  /** Lane momentum at the bell (-1 Black .. 1 White). */
  lanes: Record<LaneId, number>;
}

/** A fight that has ended (the `fightEnd` event). `lost.A` is how many White pieces fell in it. */
export interface FightRecord {
  id: number;
  zone: FightZone;
  x: number;
  y: number;
  startTick: number;
  endTick: number;
  pieces: Record<PlayTeam, PieceId[]>;
  lost: Record<PlayTeam, number>;
  pawnlings: Record<PlayTeam, number>;
  pawns: Record<PlayTeam, number>;
  bastion: Record<PlayTeam, number>;
}

export interface SetupEntry {
  piece: PieceId;
  path: Path;
  lane: LaneId;
}

/** One side's setup: its opening and its five pieces (path and lane each). */
export interface TeamSetup {
  opening: string;
  pieces: SetupEntry[];
}

interface HandSlot {
  cardId: string | null;
  /** Tick the held card expires (is replaced) when unplayed. */
  expireTick: number;
  /** Tick an empty slot is refilled; null while a card is held. */
  refillTick: number | null;
}

interface PendingFork {
  heroId: number;
  /** Rank 4 is the archetype choice, Rank 8 the style's two-option fork. */
  rank: 4 | 8;
  /** Tick the AI picks for the player; null when the game pauses for forks (no timeout). */
  deadlineTick: number | null;
}

/** A timed gambit zone: Sanctuary heals, Outpost armours, Open File speeds a lane, Barricade walls. */
export interface ZoneState {
  kind: ZoneKind;
  team: PlayTeam;
  cardId: string;
  lane?: LaneId;
  x: number;
  y: number;
  radius: number;
  /** Barricade: the wall's endpoints (also written into the terrain's blocks). */
  wall?: { ax: number; ay: number; bx: number; by: number; r: number };
  endTick: number;
  /** The `CardRun` measuring this card. */
  runId?: number;
}

/** A modifier that starts later (Queen's Gambit backlash). */
interface TimedMod {
  atTick: number;
  unitId: number;
  mod: Modifier;
}

interface Blackboard {
  claims: Record<string, number>;
  plan: { tick: number; siege: boolean; lane: LaneId };
}

export interface MatchState {
  seed: number;
  tick: number;
  phase: PhaseState;
  units: Unit[];
  nextId: number;
  rng: RngState;
  teams: Record<PlayTeam, TeamState>;
  slots: SlotState[];
  curseOffers: CurseOffer[];
  keeper: KeeperState;
  tagMult: Record<string, number>;
  pressure: string[];
  winner: PlayTeam | null;
  nextWaveTick: number;
  obeliskSchedule: number[];
  /** White's chosen setup (pre-filled with the AI default) and Black's AI pick. */
  setup: Record<PlayTeam, TeamSetup>;
  /** Each side's opening (set when the match starts). */
  opening: Record<PlayTeam, string>;
  /** Exchange: a team-wide damage multiplier until the tick (null when none). */
  teamDamage: Record<PlayTeam, { value: number; untilTick: number } | null>;
  /** `MatchConfig.forceStyles`. */
  forceStyles: Record<PlayTeam, Partial<Record<PieceId, string>>>;
  autoGambits: Record<PlayTeam, boolean>;
  autoForks: Record<PlayTeam, boolean>;
  tempo: Record<PlayTeam, number>;
  hands: Record<PlayTeam, HandSlot[]>;
  forks: PendingFork[];
  check: Record<PlayTeam, boolean>;
  throneDown: Record<PlayTeam, boolean>;
  zones: ZoneState[];
  timedMods: TimedMod[];
  board: Record<PlayTeam, Blackboard>;
  tideNextTick: number;
  lastPassiveTick: number;
  events: EventInst[];
  eventSchedule: EventScheduleEntry[];
  nextEventId: number;
  bell: BellState;
  /** White's standing pawn plan; absent until the player sets one (the AI never does). */
  pawnPlan?: PawnPlan;
  /** The Act break's armory: open while the break resolves; White's pieces bought or sold for. */
  armory: ArmoryState;
  actTally: ActTally;
  feedback: FeedbackState;
  relics: RelicState;
  /** Tournament-run rules for this match (`MatchConfig.start`, `lockStyles`, `adjudicate`, `relicMax`); absent otherwise. */
  run?: RunRules;
}

/** The in-match part of a Tournament run (absent in an Exhibition match). */
export interface RunRules {
  /** Relics a side may hold (3 normally, 5 in a run). */
  relicMax: number;
  /** Relics Black may hold (the round table can set it lower than `relicMax`). */
  relicMaxB: number;
  /** Book moves: cards drawn twice as often for this side. */
  books: Record<PlayTeam, string[]>;
  /** White's carried archetypes: Rank 4 resolves at once to these. */
  locked: Partial<Record<PieceId, string>>;
  /** A match that reaches the last Act's 0:00 gets a winner by Bastions, then Throne health. */
  adjudicate: boolean;
}

/** A relic carried between Tournament matches: aimed by piece type, since unit ids change. */
export interface CarriedRelic {
  id: string;
  lane: LaneId | null;
  piece: PieceId | null;
  card: string | null;
  trigger: SealedTrigger | null;
  quota: PawnQuota | null;
  reserve: number | null;
}

/** What one side brings into a match (a Tournament run): held relics, items, book moves, Tempo. */
export interface TeamStart {
  /** Held from Act 1; an aim that no longer fits (a piece, an Opening's card) falls back to the default aim. */
  relics?: CarriedRelic[];
  /** One item per piece, owned from the start (free). */
  heirlooms?: Partial<Record<PieceId, string>>;
  /** Cards drawn twice as often (stacks with the Opening's ×2). */
  books?: string[];
  /** Extra Tempo at the start (on top of `gambits.tempoStart`). */
  tempoBonus?: number;
}

export interface PositionSample {
  tick: number;
  id: number;
  x: number;
  y: number;
  hp: number;
}

export interface EventPayloads {
  matchStart: {
    seed: number;
    heroes: {
      id: number;
      team: string;
      def: string;
      role: string;
      style: string | null;
      path: string;
    }[];
  };
  phaseStart: { phase: number; kind: PhaseKind };
  phaseEnd: { phase: number; kind: PhaseKind };
  damage: {
    src: number;
    tgt: number;
    srcKind: UnitKind | 'none';
    tgtKind: UnitKind;
    srcTeam: TeamId | 'none';
    tgtTeam: TeamId;
    amount: number;
    dtype: DamageType;
    origin: string;
    lethal: boolean;
    /** Damage the target did not take (armor, resist, reductions, shields); pieces only. */
    mitigated?: number;
    /** Heavy hit: the target was knocked this far straight away from the attacker. */
    kb?: number;
  };
  damageBucket: {
    srcTeam: TeamId | 'none';
    tgtKind: UnitKind;
    amount: number;
    count: number;
  };
  heal: { src: number; tgt: number; amount: number; origin: string };
  death: {
    id: number;
    kind: UnitKind;
    team: TeamId;
    killer: number;
    killerKind: UnitKind | 'none';
    assists: number[];
    x: number;
    y: number;
    /** Pieces only: why it fell. */
    fall?: { cause: DeathCause; killer: PieceId | null; by: PieceId[] };
  };
  respawn: { id: number };
  gold: { id: number; amount: number; source: string };
  /** `at: 'break'` marks a purchase made at the Act break (the armory or the AI's break shop). */
  purchase: { id: number; item: string; price: number; consumed: string[]; at?: 'break' };
  sell: { id: number; item: string; refund: number; at?: 'break' };
  /** White changed a piece's armory plan at the break (null: back to the path's list). */
  planSet: { id: number; plan: string[] | null };
  rankUp: { id: number; rank: number; bonus: string };
  /** `locked`: a Tournament run's carried archetype resolved the Rank 4 choice (`lockStyles`). */
  fork: { id: number; rank: number; optionId: string; auto: boolean; locked?: true };
  gambit: {
    team: PlayTeam;
    cardId: string;
    lane?: LaneId;
    x?: number;
    y?: number;
    targetId?: number;
  };
  fightEnd: FightRecord;
  gambitEnd: CardMetrics & {
    team: PlayTeam;
    cardId: string;
    cost: number;
    lane?: LaneId;
    x: number;
    y: number;
    startTick: number;
    endTick: number;
    /** Check and Poisoned Pawn: the marked unit fell. */
    fell: boolean;
  };
  check: { team: PlayTeam };
  throneDown: { team: PlayTeam };
  checkmate: { winner: PlayTeam };
  pawnFielded: { team: PlayTeam; lane: LaneId; id: number };
  bell: { stage: BellStage; toll?: number; act: number };
  relicOffered: { team: PlayTeam; ids: string[] };
  relicTaken: {
    team: PlayTeam;
    relic: string;
    replaced: string | null;
    auto: boolean;
  } & RelicAim;
  relicAimed: { team: PlayTeam; relic: string } & RelicAim;
  relicDeclined: { team: PlayTeam };
  sealedMove: { team: PlayTeam; card: string; trigger: SealedTrigger; outcome: 'fired' | 'lapsed' };
  relicTriggered: { team: PlayTeam; relic: string; lane: LaneId };
  laneSet: { id: number; lane: LaneId };
  pathSet: { id: number; path: Path };
  recall: {
    id: number;
    dest: string;
    stage: 'start' | 'done' | 'interrupted';
    auto?: boolean;
  };
  structureDown: {
    kind: UnitKind;
    team: TeamId;
    lane: string;
    index: number;
    killer: number;
    x: number;
    y: number;
  };
  campCleared: {
    slot: string;
    spot: number;
    typeId: string;
    killer: number;
    gold: number;
    points: number;
  };
  biomeOpen: { slot: string; biome: string };
  campsRolled: { slot: string; types: string[] };
  obeliskSpawn: { unit: number; node: string; x: number; y: number };
  obeliskClaimed: { team: PlayTeam; node: string; reward: string; value: number };
  obeliskExpired: { node: string };
  curseOffered: { hero: number; item: string; flawType: string };
  curseAccepted: { hero: number; item: string; flaw: string };
  curseRefused: { hero: number; item: string };
  pressure: { event: string; name: string };
  laneSwap: { a: number; b: number };
  keeperMoved: { spot: string; x: number; y: number; stock: string[] };
  commandRejected: { cmd: string; reason: string };
  /** `adjudicated`: no Checkmate; the winner came from `MatchConfig.adjudicate` (null: a dead tie). */
  matchEnd: { winner: PlayTeam | null; phase: number; adjudicated?: true };
  teamPoints: { team: PlayTeam; amount: number; source: string };
  eventWarning: {
    id: number;
    def: string;
    kind: string;
    name: string;
    slot: string;
    x: number;
    y: number;
    radius: number;
    inTicks: number;
    lane: string;
    target: string;
  };
  eventStart: { id: number; def: string; kind: string; slot: string; x: number; y: number };
  eventKill: {
    id: number;
    def: string;
    unitDef: string;
    unit: number;
    team: TeamId;
    killer: number;
    gold: number;
    points: number;
  };
  eventReward: {
    id: number;
    def: string;
    team: PlayTeam;
    gold: number;
    points: number;
    buff: string;
    source: string;
  };
  eventTelegraph: { id: number; x: number; y: number; radius: number; ticks: number };
  eventEnd: {
    id: number;
    def: string;
    reason: 'cleared' | 'claimed' | 'expired' | 'arrived' | 'phaseEnd';
    winner: PlayTeam | null;
  };
}

export type EventType = keyof EventPayloads;

export type GameEvent = {
  [K in EventType]: { tick: number; seq: number; type: K; payload: EventPayloads[K] };
}[EventType];

export type Recorder = {
  events: GameEvent[];
  samples: PositionSample[];
  seq: number;
};

export type Command =
  | { type: 'setupTeam'; opening: string; pieces: SetupEntry[] }
  /** `optionId: 'auto'` takes the AI's pick for that piece's oldest pending fork. */
  | { type: 'chooseFork'; heroId: number; optionId: string }
  /** Resolves every pending White fork with the AI's pick ("Let the AI choose"). */
  | { type: 'autoForks' }
  | { type: 'playGambit'; slot: number; lane?: LaneId; x?: number; y?: number; targetId?: number }
  | { type: 'setLane'; heroId: number; lane: LaneId }
  | { type: 'setPath'; heroId: number; path: Path }
  | { type: 'fieldPawn'; lane: LaneId }
  /** White's standing pawn plan: pawns to keep fielded per lane (total within the cap). */
  | { type: 'setPawnPlan'; quota: PawnQuota }
  /** Turns White's automatic pawn fielding (the standing plan) on or off; the counts are kept. */
  | { type: 'setPawnAuto'; auto: boolean }
  /** Leaves the Act break sheet and starts the next Act (after a relic is taken). */
  | { type: 'resumeAct' }
  /** Armory (Act break only): White's piece buys an item from the full shop, all tiers. */
  | { type: 'buy'; heroId: number; item: string }
  /** Armory (Act break only): White's piece sells an item for half its price (not cursed ones). */
  | { type: 'sell'; heroId: number; item: string }
  /** Armory (Act break only): six distinct item ids the piece buys in order, or null for its path's list. */
  | { type: 'setPlan'; heroId: number; plan: string[] | null }
  /** Armory (Act break only): the AI shops now for one White piece, or all five (null). */
  | { type: 'autoShop'; heroId: number | null }
  /** Takes one of the break's offered relics, aimed; with three held, `replace` names the one it replaces. */
  | ({ type: 'pickRelic'; relicId: string; replace?: string } & Partial<RelicAim>)
  /** A full hand of three keeps what it holds and takes none of the offers. */
  | { type: 'declineRelic' }
  /** Re-aims a held relic (at a break only). */
  | ({ type: 'aimRelic'; relicId: string } & Partial<RelicAim>)
  /** "Let the AI choose": picks and aims a relic for White. */
  | { type: 'autoRelic' };

export interface ArmoryState {
  /** True from the bell's break until the next Act starts (the break shop sells every tier). */
  open: boolean;
  /** White's hero ids bought or sold for at this break: they keep their gold on resume. */
  touched: number[];
}

/** One item in the armory grid, priced for one piece. */
export interface ArmoryTile {
  id: string;
  name: string;
  tier: number;
  category: string;
  /** List price. */
  cost: number;
  /** Price for this piece now: parts it owns come off, and the obelisk discount on a Masterwork. */
  price: number;
  /** The parts it is built from, and those the piece owns (consumed on purchase). */
  parts: string[];
  partsOwned: string[];
  owned: boolean;
  inPlan: boolean;
  /** The AI's next buy for this piece (the "AI suggests" pip). */
  suggested: boolean;
  /** Buyable now: armory open, not blocked, price within the piece's gold. */
  affordable: boolean;
  /** Why it cannot be bought (duplicate, no free slot, armory closed), or null. */
  blocked: string | null;
}

/** What the armory shows for one piece. */
export interface ArmoryView {
  heroId: number;
  piece: PieceId;
  gold: number;
  /** Items held (cursed ones included), and the slot count. */
  items: string[];
  slots: number;
  /** The six-item plan the piece shops by (its path's list until changed), and whether it was changed. */
  plan: string[];
  customPlan: boolean;
  /** Plan items the piece does not have yet, in order (the ghost tiles). */
  planLeft: string[];
  /** The AI's next buy at the break (null when it would buy nothing). */
  suggestion: string | null;
  /** Bought or sold for at this break: keeps its gold on resume instead of the AI shopping. */
  touched: boolean;
  /** Sale price per held item (null for cursed items, which cannot be sold). */
  sellRefund: Record<string, number | null>;
  open: boolean;
  /** Tier 1, 2 and 3 tiles for every item. */
  tiles: ArmoryTile[];
}

export interface CommandResult {
  ok: boolean;
  reason?: string;
}

export type ReplayOp = { op: 'issue'; cmd: Command } | { op: 'step'; ticks: number };

export interface MatchConfig {
  seed: number;
  /** Fix either side's setup (tests, tools). With A given the match starts live at once. */
  setup?: { A?: TeamSetup; B?: TeamSetup };
  /** Which teams the gambit/pawn AI plays for (Black always in the browser). Default A off, B on. */
  autoGambits?: { A: boolean; B: boolean };
  /** Internal (tools): forks pick at once without the player wait. Defaults to `autoGambits`. */
  autoForks?: { A: boolean; B: boolean };
  /** Internal (tools): archetypes the AI must pick at Rank 4, per team and piece. */
  forceStyles?: { A?: Partial<Record<PieceId, string>>; B?: Partial<Record<PieceId, string>> };
  /**
   * Interactive play: `Match.step` stops the moment a White fork opens and does nothing (returns 0)
   * while one is pending, and White's forks have no timeout (answer with `chooseFork` or
   * `autoForks`). Default false: headless runs never pause and the AI picks after `ranks.forkSec`.
   */
  pauseForForks?: boolean;
  /**
   * Interactive play: the Act break waits on the sheet until `resumeAct`, and `Match.step` does
   * nothing while it waits. Default false: headless runs resolve the break at once (both AIs
   * re-plan, then the next Act starts).
   */
  pauseForBreak?: boolean;
  /**
   * Who picks each side's relics at an Act break. Default: Black by the AI rule, White by the
   * player when `pauseForBreak` is set, else by the AI rule. `manual` falls back to `ai` without a sheet.
   */
  relics?: { A?: RelicMode; B?: RelicMode };
  /** `long`: play on the Long Board (`content/map-long.json`, its own tuning). Default: the square map. */
  map?: 'default' | 'long';
  /** Tournament run: what each side brings into the match (relics, heirlooms, book moves, Tempo). */
  start?: { A?: TeamStart; B?: TeamStart };
  /** Tournament run: White's Rank 4 resolves at once to these archetypes (Rank 8 still pauses). */
  lockStyles?: { A?: Partial<Record<PieceId, string>> };
  /** Tournament run: a match without Checkmate is decided by Bastions destroyed, then Throne health. */
  adjudicate?: boolean;
  /** Relics a side may hold (default `relics.max`, 3; a run uses 5). */
  relicMax?: number;
  /** Relics Black may hold (default `relicMax`; a run's round table can set it lower). */
  relicMaxB?: number;
}

export interface Replay {
  seed: number;
  contentHash: string;
  config: MatchConfig;
  ops: ReplayOp[];
}

export interface SnapUnit {
  id: number;
  kind: UnitKind;
  team: TeamId;
  defId: string;
  x: number;
  y: number;
  px: number;
  py: number;
  hp: number;
  maxHp: number;
  shield: number;
  alive: boolean;
  piece: PieceId | null;
  style: string | null;
  path: Path | null;
  rank: number;
  forkPending: boolean;
  /** Elite pawn fielded with Tempo (pawnlings are false). */
  pawn: boolean;
  /** A piece's assigned lane: changes with setLane and AI lane swaps, never from roaming. */
  lane: LaneId | null;
  role: Role | null;
  /** Marked by the Check gambit (takes more damage). */
  marked: boolean;
  /** Marked by the Poisoned Pawn gambit (its killer is slowed and the killer's team loses Tempo). */
  poisoned?: boolean;
  stunned: boolean;
  /** Final melee/ranged for a piece (its style can override the piece). */
  attackKind: 'melee' | 'ranged' | null;
  recalling: boolean;
  goal: GoalKind | null;
  /** Pieces: fighting, holding its ground, or fleeing (breaking off to retreat or fall back). */
  engage?: 'fight' | 'hold' | 'flee';
  slot: number;
  range: number;
  claim: number;
  curse: boolean;
  target: number | null;
  flash: boolean;
  /** Dealt or took damage within the last 1.5 s (the bell's calm test). */
  inCombat: boolean;
  /**
   * Pieces only: dealt damage to, or took damage from, an enemy piece within the last 1.5 s (not
   * pawnlings, pawns, camps or structures). The roster's red combat flash follows this.
   */
  inDuel?: boolean;
  /** Pieces only: the lane the piece is in or heading to, the jungle, or its base (home or recalling). */
  laneNow?: LaneNow;
  /**
   * Pieces on the Long Board only, display only: its current target stands on a lower tier, so
   * Reach or Sight gives it the edge (the view's eye icon). Absent otherwise.
   */
  highGround?: true;
}

export interface Snapshot {
  tick: number;
  phase: PhaseState;
  winner: PlayTeam | null;
  units: SnapUnit[];
  slots: {
    id: string;
    open: boolean;
    biomeId: string | null;
    x: number;
    y: number;
    radius: number;
  }[];
  pressure: string[];
  points: Record<PlayTeam, number>;
  keeper: { x: number; y: number; spot: string } | null;
  phaseTicksLeft: number;
  events: SnapEvent[];
  act: SnapAct;
  tempo: Record<PlayTeam, number>;
  /** White's Tempo cap (Spare Tempo raises it). */
  tempoMax: number;
  /** Seconds a played card takes to come back (Quiet Move shortens it). */
  handRefillSec: number;
  /** White's hand. */
  hand: SnapGambit[];
  pawns: Record<PlayTeam, { alive: number; cap: number; cost: number }>;
  /** White's standing pawn plan (present once set). */
  pawnPlan?: PawnPlan;
  /** White's pending forks. */
  forks: SnapFork[];
  check: Record<PlayTeam, boolean>;
  throneDown: Record<PlayTeam, boolean>;
  /** White's and Black's openings (null before the match starts). */
  opening: Record<PlayTeam, string | null>;
  /** Active gambit zones: Sanctuary, Barricade, Outpost and Open File. */
  zones: SnapZone[];
  /** Who is pushing each lane: -1 Black all the way .. 1 White all the way. */
  momentum: Record<LaneId, number>;
  relics: SnapRelics;
}

/** The relic draft as the sheet and the HUD see it (White's open offers; both sides' held relics). */
interface SnapRelics {
  held: Record<PlayTeam, HeldRelic[]>;
  /** Relics a side may hold, in a Tournament run (5); absent means `relics.max` (3). */
  max?: number;
  /** White's offers while the break draft is open. */
  offers: RelicOffer[];
  /** White's draft at this break is done (or there was nothing to offer). */
  settled: boolean;
  /** The relic each side took at the latest break. */
  latest: Record<PlayTeam, string | null>;
  behind: Record<PlayTeam, boolean>;
  /** Why White's pieces cannot start the next Act in their lanes (null when they can). */
  formation: string | null;
  /** The pawns White may keep fielded in the next Act (Pawn Structure quotas fit inside it). */
  pawnCap: number;
}

interface SnapAct {
  n: number;
  /** Seconds left on the Act clock; 0 from the bell on. */
  remainingSec: number;
  bell: BellStage;
  /** 1..tolls while tolling and during the halt. */
  toll?: number;
  /** 0..1 across the halt. */
  haltProgress?: number;
  /** The closed Act's numbers, present on the break sheet. */
  report?: ActReport;
}

type ZoneKind = 'sanctuary' | 'barricade' | 'outpost' | 'openFile';

export interface SnapZone {
  kind: ZoneKind;
  team: PlayTeam;
  /** Open File: the lane it covers. */
  lane?: LaneId;
  /** Centre (Open File: the lane's midpoint). */
  x: number;
  y: number;
  /** Sanctuary and Outpost: the area. Barricade: half the wall's length. Open File: 0. */
  radius: number;
  /** Barricade: the wall's direction in radians (the wall runs along this angle). */
  angle?: number;
  ticksLeft: number;
}

export interface SnapGambit {
  slot: number;
  cardId: string;
  school: School | null;
  name: string;
  desc: string;
  cost: number;
  target: GambitTarget;
  piece: PieceId | null;
  usable: boolean;
  reason: string;
  ticksLeft: number;
  refillTicks: number | null;
}

export interface SnapFork {
  heroId: number;
  piece: PieceId;
  /** 'archetype' at Rank 4 (options are the piece's three styles), 'skill' at Rank 8. */
  kind: 'archetype' | 'skill';
  /** The piece's style key (as `SnapUnit.style`); null for an archetype fork. */
  style: string | null;
  rank: 4 | 8;
  options: { id: string; name: string; desc: string }[];
  /** Ticks until the AI picks; null when there is no timeout (`pauseForForks`). */
  ticksLeft: number | null;
}

export interface SnapEvent {
  /** Unique per occurrence, e.g. "wishing_well#3". */
  id: string;
  /** Content id of the event definition (fox_wedding, hundred_demons, wishing_well, hungry_oni). */
  kind: string;
  /** Mechanic family: procession, parade, well or oni. */
  type: string;
  name: string;
  slot: string;
  x: number;
  y: number;
  radius: number;
  phase: 'warning' | 'active';
  ticksLeft: number;
  /** 0..1: route walked (procession), demons cleared (parade), hold claim (well), damage dealt (oni). */
  progress?: number;
  /** Well: team currently ahead on the claim. Parade: team it marches toward. */
  team?: PlayTeam | null;
  /** Oni slam warning area, present while the attack winds up. */
  telegraph?: { x: number; y: number; radius: number; ticksLeft: number };
}
