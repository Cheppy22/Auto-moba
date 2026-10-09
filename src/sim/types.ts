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
  StatKey,
  Stats,
};

export type TeamId = 'A' | 'B' | 'neutral';
export type PlayTeam = 'A' | 'B';
export type UnitKind = 'hero' | 'minion' | 'tower' | 'guardian' | 'camp' | 'obelisk' | 'keeper';
/** setup (White picks styles, paths and lanes) -> live (Acts run back to back) -> end (checkmate). */
export type PhaseKind = 'setup' | 'live' | 'end';

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

export interface ShieldInst {
  amount: number;
  expiresTick: number;
}

export interface DotInst {
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

export interface RecallState {
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
  style: string;
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
  lastRecallTick: number;
  lossStreak: number;
  lastDeathTick: number;
  lastStandUsed: boolean;
}

export interface CampState {
  slot: string;
  spot: number;
  typeId: string;
  homeX: number;
  homeY: number;
  biomeId: string;
}

export interface ObeliskState {
  nodeId: string;
  claim: Record<PlayTeam, number>;
  expireTick: number;
}

export interface EventUnitState {
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

export interface EventScheduleEntry {
  tick: number;
  defId: string;
}

export interface TowerState {
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
  /** Waypoint around solid terrain while the unit walks a detour; null when it walks straight. */
  detour: { x: number; y: number; untilTick: number } | null;
}

export interface TeamState {
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

export interface BidState {
  points: number;
  gold: number;
  goldBy: Record<number, number>;
}

export interface AuctionState {
  holyId: string;
  bids: Record<PlayTeam, BidState>;
  resolved: boolean;
  winner: PlayTeam | null;
  recipient: number | null;
  awaitingRecipient: boolean;
}

export interface CurseOffer {
  heroId: number;
  itemId: string;
  phase: number;
  resolved: boolean;
  accepted: boolean;
}

export interface KeeperState {
  unitId: number;
  spot: string;
  stock: string[];
}

export interface PhaseState {
  kind: PhaseKind;
  n: number;
  startTick: number;
}

export interface SetupEntry {
  piece: PieceId;
  style: string;
  path: Path;
  lane: LaneId;
}

export interface HandSlot {
  cardId: string | null;
  /** Tick the held card expires (is replaced) when unplayed. */
  expireTick: number;
  /** Tick an empty slot is refilled; null while a card is held. */
  refillTick: number | null;
}

export interface PendingFork {
  heroId: number;
  rank: 4 | 8;
  /** Tick the AI picks for the player; null when the game pauses for forks (no timeout). */
  deadlineTick: number | null;
}

/** Sanctuary zone: heals allies inside it every tick. */
export interface ZoneState {
  team: PlayTeam;
  cardId: string;
  x: number;
  y: number;
  radius: number;
  healPctPerSec: number;
  endTick: number;
}

/** A modifier that starts later (Queen's Gambit backlash). */
export interface TimedMod {
  atTick: number;
  unitId: number;
  mod: Modifier;
}

export interface Blackboard {
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
  auction: AuctionState;
  curseOffers: CurseOffer[];
  keeper: KeeperState;
  tagMult: Record<string, number>;
  pressure: string[];
  winner: PlayTeam | null;
  nextWaveTick: number;
  obeliskSchedule: number[];
  /** White's chosen setup (pre-filled with the AI default) and Black's AI pick. */
  setup: Record<PlayTeam, SetupEntry[]>;
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
      style: string;
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
  };
  respawn: { id: number };
  gold: { id: number; amount: number; source: string };
  purchase: { id: number; item: string; price: number; consumed: string[] };
  sell: { id: number; item: string; refund: number };
  rankUp: { id: number; rank: number; bonus: string };
  fork: { id: number; rank: number; optionId: string; auto: boolean };
  gambit: {
    team: PlayTeam;
    cardId: string;
    lane?: LaneId;
    x?: number;
    y?: number;
    targetId?: number;
  };
  check: { team: PlayTeam };
  throneDown: { team: PlayTeam };
  checkmate: { winner: PlayTeam };
  pawnFielded: { team: PlayTeam; lane: LaneId; id: number };
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
  bid: { team: PlayTeam; points: number; gold: number; hero: number };
  auctionResolved: {
    winner: PlayTeam | null;
    holy: string;
    recipient: number;
    pointsA: number;
    pointsB: number;
    goldA: number;
    goldB: number;
  };
  curseOffered: { hero: number; item: string; flawType: string };
  shopVisit: { id: number; shop: string };
  curseAccepted: { hero: number; item: string; flaw: string };
  curseRefused: { hero: number; item: string };
  pressure: { event: string; name: string };
  laneSwap: { a: number; b: number };
  keeperMoved: { spot: string; x: number; y: number; stock: string[] };
  commandRejected: { cmd: string; reason: string };
  matchEnd: { winner: PlayTeam | null; phase: number };
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
  | { type: 'setupTeam'; pieces: SetupEntry[] }
  /** `optionId: 'auto'` takes the AI's pick for that piece's oldest pending fork. */
  | { type: 'chooseFork'; heroId: number; optionId: string }
  /** Resolves every pending White fork with the AI's pick ("Let the AI choose"). */
  | { type: 'autoForks' }
  | { type: 'playGambit'; slot: number; lane?: LaneId; x?: number; y?: number; targetId?: number }
  | { type: 'setLane'; heroId: number; lane: LaneId }
  | { type: 'setPath'; heroId: number; path: Path }
  | { type: 'fieldPawn'; lane: LaneId };

export interface CommandResult {
  ok: boolean;
  reason?: string;
}

export type ReplayOp = { op: 'issue'; cmd: Command } | { op: 'step'; ticks: number };

export interface MatchConfig {
  seed: number;
  /** Fix either side's setup (tests, tools). With A given the match starts live at once. */
  setup?: { A?: SetupEntry[]; B?: SetupEntry[] };
  /** Which teams the gambit/pawn AI plays for (Black always in the browser). Default A off, B on. */
  autoGambits?: { A: boolean; B: boolean };
  /** Internal (tools): forks pick at once without the player wait. Defaults to `autoGambits`. */
  autoForks?: { A: boolean; B: boolean };
  /**
   * Interactive play: `Match.step` stops the moment a White fork opens and does nothing (returns 0)
   * while one is pending, and White's forks have no timeout (answer with `chooseFork` or
   * `autoForks`). Default false: headless runs never pause and the AI picks after `ranks.forkSec`.
   */
  pauseForForks?: boolean;
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
  lane: LaneId | null;
  role: Role | null;
  /** Marked by the Check gambit (takes more damage). */
  marked: boolean;
  stunned: boolean;
  /** Final melee/ranged for a piece (its style can override the piece). */
  attackKind: 'melee' | 'ranged' | null;
  recalling: boolean;
  goal: GoalKind | null;
  slot: number;
  range: number;
  claim: number;
  curse: boolean;
  holy: boolean;
  target: number | null;
  flash: boolean;
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
  act: number;
  tempo: Record<PlayTeam, number>;
  /** White's hand. */
  hand: SnapGambit[];
  pawns: Record<PlayTeam, { alive: number; cap: number; cost: number }>;
  /** White's pending forks. */
  forks: SnapFork[];
  check: Record<PlayTeam, boolean>;
  throneDown: Record<PlayTeam, boolean>;
  /** Active Sanctuary zones. */
  zones: { team: PlayTeam; x: number; y: number; radius: number; ticksLeft: number }[];
}

export interface SnapGambit {
  slot: number;
  cardId: string;
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
  /** The piece's style key (as `SnapUnit.style`). */
  style: string;
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
