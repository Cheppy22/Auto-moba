import type { RngState } from './core/rng';
import type {
  DamageType,
  Disposition,
  LaneId,
  Posture,
  Role,
  StatKey,
  Stats,
} from './content/schema';

export type { DamageType, Disposition, LaneId, Posture, Role, StatKey, Stats };

export type TeamId = 'A' | 'B' | 'neutral';
export type PlayTeam = 'A' | 'B';
export type UnitKind = 'hero' | 'minion' | 'tower' | 'guardian' | 'camp' | 'obelisk' | 'keeper';
export type PhaseKind = 'draft' | 'prep' | 'live' | 'report' | 'end';

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
  | 'base';

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
}

export interface HeroState {
  defId: string;
  isPlayer: boolean;
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
  upgrades: string[];
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
  suggest: string[];
  lossStreak: number;
  lastDeathTick: number;
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
  roaming?: boolean;
  lastDamagedTick: number;
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

export interface DraftState {
  aiHeroes: Record<PlayTeam, string[]>;
  playerHero: string | null;
  playerRole: Role | null;
  playerTeam: PlayTeam;
  unique: boolean;
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
  playerHeroId: number | null;
  upgradeOffers: Record<number, string[]>;
  draft: DraftState | null;
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
  matchStart: { seed: number; heroes: { id: number; team: string; def: string; role: string }[] };
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
  upgradePick: { id: number; upgrade: string };
  posture: { id: number; posture: Posture };
  recall: { id: number; dest: string; stage: 'start' | 'done' | 'interrupted' };
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
  | { type: 'pickHero'; heroId: string }
  | { type: 'pickLane'; role: Role }
  | { type: 'startMatch' }
  | { type: 'setPosture'; posture: Posture }
  | { type: 'recall'; dest: 'base' }
  | { type: 'suggestShop'; shopId: string }
  | { type: 'clearSuggest' }
  | { type: 'pickUpgrade'; upgradeId: string }
  | { type: 'buy'; itemId: string }
  | { type: 'sell'; itemId: string }
  | { type: 'bid'; points: number; gold: number }
  | { type: 'acceptCurse' }
  | { type: 'refuseCurse' }
  | { type: 'chooseHolyRecipient'; heroId: number }
  | { type: 'startPhase' }
  | { type: 'continue' };

export interface CommandResult {
  ok: boolean;
  reason?: string;
}

export type ReplayOp = { op: 'issue'; cmd: Command } | { op: 'step'; ticks: number };

export interface MatchConfig {
  seed: number;
  player?: { heroId: string; role: Role; team?: PlayTeam } | null;
  draft?: { A: string[]; B: string[] };
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
  isPlayer: boolean;
  role: Role | null;
  posture: Posture | null;
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
  playerHeroId: number | null;
  keeper: { x: number; y: number; spot: string } | null;
  suggest: string[];
  phaseTicksLeft: number;
  events: SnapEvent[];
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

export interface ShopEntry {
  id: string;
  name: string;
  category: 'mind' | 'body' | 'soul';
  tier: number;
  cost: number;
  price: number;
  consumed: string[];
  source: 'base' | 'keeper' | 'jungle';
  canBuy: boolean;
  reason: string;
  desc: string;
}
