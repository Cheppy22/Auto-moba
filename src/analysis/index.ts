import type {
  BadgeDef,
  Content,
  DamageType,
  GameEvent,
  Match,
  PlayTeam,
  PositionSample,
  UnitKind,
} from '../sim';
import { computeBadges, type BadgeAward } from './badges';
import { deriveFights, type Fight } from './fights';
import { PositionIndex } from './positions';

export type { BadgeAward } from './badges';
export type { Fight } from './fights';
export { PositionIndex } from './positions';
export * from './text';
export * from './summary';

export interface RosterEntry {
  id: number;
  team: PlayTeam;
  /** Piece id (king, queen, rook, bishop, knight). */
  def: string;
  role: string;
  style: string;
  path: string;
}

export interface AnalysisInput {
  events: GameEvent[];
  samples: PositionSample[];
  tickRate: number;
  fightGapSec: number;
  fightRadius: number;
  badges: BadgeDef[];
  /** The human player's team; defaults to A. */
  playerTeam?: PlayTeam;
  /** Content for display names and costs (pieces, styles, items, gambits). Optional. */
  content?: Content;
}

export function inputFromMatch(m: Match, c: Content): AnalysisInput {
  return {
    events: m.events,
    samples: m.samples,
    tickRate: c.tuning.tickRate,
    fightGapSec: c.tuning.fight.clusterGapSec,
    fightRadius: c.tuning.fight.clusterRadius,
    badges: c.badges,
    playerTeam: 'A',
    content: c,
  };
}

export type Scope = { kind: 'phase'; n: number } | { kind: 'match' };

export interface Purchase {
  tick: number;
  item: string;
  price: number;
  consumed: string[];
}

export interface DeathRecord {
  tick: number;
  killer: number;
  killerKind: UnitKind | 'none';
  x: number;
  y: number;
  mix: Record<DamageType, number>;
  fromHeroes: Record<number, number>;
}

export interface HeroModel {
  id: number;
  team: PlayTeam;
  def: string;
  role: string;
  kills: number;
  deaths: number;
  assists: number;
  damageDealt: number;
  dealtBy: Record<string, number>;
  objectiveDamage: number;
  jungleDamage: number;
  damageTaken: number;
  taken: Record<DamageType, number>;
  takenFrom: Record<string, number>;
  takenByOrigin: Record<string, number>;
  healingDone: number;
  healingReceived: number;
  goldEarned: number;
  goldBySource: Record<string, number>;
  goldSeries: { tick: number; total: number }[];
  purchases: Purchase[];
  sells: { tick: number; item: string; refund: number }[];
  ranks: { tick: number; rank: number; bonus: string }[];
  forks: { tick: number; rank: number; optionId: string; auto: boolean }[];
  recalls: { tick: number; dest: string; stage: string }[];
  deathRecords: DeathRecord[];
  distance: number;
  path: PositionSample[];
  fightIds: number[];
  curse: { tick: number; item: string; flaw: string }[];
}

export interface TeamModel {
  team: PlayTeam;
  kills: number;
  deaths: number;
  assists: number;
  goldEarned: number;
  damageToHeroes: number;
  objectiveDamage: number;
  towersDestroyed: number;
  guardianDestroyed: boolean;
  campsCleared: number;
  obelisksClaimed: number;
  pointsEarned: number;
  pointsSpent: number;
  heroDeathsByCause: Record<string, number>;
  gambitsPlayed: Record<string, number>;
  pawnsFielded: number;
  checks: number;
}

export interface SpecialFacts {
  obelisks: { tick: number; team: PlayTeam; node: string; reward: string; value: number }[];
  curses: { tick: number; hero: number; item: string; flaw?: string; refused?: boolean }[];
  keeper: { tick: number; spot: string; stock: string[] }[];
  pressure: { tick: number; name: string }[];
  biomes: { tick: number; slot: string; biome: string }[];
  bids: { tick: number; team: PlayTeam; points: number; gold: number; hero: number }[];
  auction: {
    holy: string;
    winner: PlayTeam | null;
    recipient: number;
    pointsA: number;
    pointsB: number;
    goldA: number;
    goldB: number;
  } | null;
  structures: {
    tick: number;
    kind: string;
    team: string;
    lane: string;
    index: number;
    killer: number;
  }[];
}

export interface Report {
  scope: Scope;
  fromTick: number;
  toTick: number;
  roster: RosterEntry[];
  heroes: HeroModel[];
  teams: Record<PlayTeam, TeamModel>;
  fights: Fight[];
  badges: BadgeAward[];
  special: SpecialFacts;
  phases: number[];
  /** The player's team, for "your team" / "the enemy" wording. */
  viewerTeam: PlayTeam;
}

const emptyMix = (): Record<DamageType, number> => ({ blade: 0, soul: 0, true: 0 });

function newHero(r: RosterEntry): HeroModel {
  return {
    id: r.id,
    team: r.team,
    def: r.def,
    role: r.role,
    kills: 0,
    deaths: 0,
    assists: 0,
    damageDealt: 0,
    dealtBy: {},
    objectiveDamage: 0,
    jungleDamage: 0,
    damageTaken: 0,
    taken: emptyMix(),
    takenFrom: {},
    takenByOrigin: {},
    healingDone: 0,
    healingReceived: 0,
    goldEarned: 0,
    goldBySource: {},
    goldSeries: [],
    purchases: [],
    sells: [],
    ranks: [],
    forks: [],
    recalls: [],
    deathRecords: [],
    distance: 0,
    path: [],
    fightIds: [],
    curse: [],
  };
}

function newTeam(team: PlayTeam): TeamModel {
  return {
    team,
    kills: 0,
    deaths: 0,
    assists: 0,
    goldEarned: 0,
    damageToHeroes: 0,
    objectiveDamage: 0,
    towersDestroyed: 0,
    guardianDestroyed: false,
    campsCleared: 0,
    obelisksClaimed: 0,
    pointsEarned: 0,
    pointsSpent: 0,
    heroDeathsByCause: {},
    gambitsPlayed: {},
    pawnsFielded: 0,
    checks: 0,
  };
}

export function phaseNumbers(events: GameEvent[]): number[] {
  const out: number[] = [];
  for (const e of events)
    if (e.type === 'phaseStart' && e.payload.kind === 'live') out.push(e.payload.phase);
  return out;
}

interface Window {
  seqFrom: number;
  seqTo: number;
  tickFrom: number;
  tickTo: number;
}

function windowFor(events: GameEvent[], scope: Scope): Window {
  const last = events[events.length - 1];
  const full: Window = {
    seqFrom: 0,
    seqTo: last ? last.seq : 0,
    tickFrom: 0,
    tickTo: last ? last.tick : 0,
  };
  if (scope.kind === 'match') return full;
  const w = { ...full };
  let foundStart = false;
  for (const e of events) {
    if (e.type === 'phaseStart' && e.payload.phase === scope.n) {
      w.seqFrom = e.seq;
      w.tickFrom = e.tick;
      foundStart = true;
    } else if (e.type === 'phaseEnd' && e.payload.phase === scope.n) {
      w.seqTo = e.seq;
      w.tickTo = e.tick;
    }
  }
  if (!foundStart) w.seqFrom = 0;
  return w;
}

const WINDOW_BEFORE_DEATH = 120;

export function buildReport(input: AnalysisInput, scope: Scope, viewer?: PlayTeam): Report {
  const events = input.events;
  const matchStart = events.find((e) => e.type === 'matchStart');
  const roster: RosterEntry[] = matchStart
    ? matchStart.payload.heroes.map((h) => ({
        id: h.id,
        team: h.team as PlayTeam,
        def: h.def,
        role: h.role,
        style: h.style,
        path: h.path,
      }))
    : [];
  const heroes = new Map<number, HeroModel>();
  for (const r of roster) heroes.set(r.id, newHero(r));
  const teams: Record<PlayTeam, TeamModel> = { A: newTeam('A'), B: newTeam('B') };
  const teamOf = new Map<number, PlayTeam>(roster.map((r) => [r.id, r.team]));
  const w = windowFor(events, scope);
  const auctionResolved = events.some((e) => e.type === 'auctionResolved' && e.seq <= w.seqTo);
  const special: SpecialFacts = {
    obelisks: [],
    curses: [],
    keeper: [],
    pressure: [],
    biomes: [],
    bids: [],
    auction: null,
    structures: [],
  };
  const recentTaken = new Map<
    number,
    { tick: number; src: number; dtype: DamageType; amount: number }[]
  >();
  const goldTotals = new Map<number, number>();

  for (const e of events) {
    if (e.seq < w.seqFrom || e.seq > w.seqTo) continue;
    switch (e.type) {
      case 'damage': {
        const p = e.payload;
        const src = heroes.get(p.src);
        const tgt = heroes.get(p.tgt);
        if (src) {
          src.dealtBy[p.tgtKind] = (src.dealtBy[p.tgtKind] ?? 0) + p.amount;
          if (p.tgtKind === 'hero') {
            src.damageDealt += p.amount;
            teams[src.team].damageToHeroes += p.amount;
          } else if (p.tgtKind === 'tower' || p.tgtKind === 'guardian') {
            src.objectiveDamage += p.amount;
            teams[src.team].objectiveDamage += p.amount;
          } else if (p.tgtKind === 'camp') src.jungleDamage += p.amount;
        }
        if (tgt) {
          tgt.damageTaken += p.amount;
          tgt.taken[p.dtype] += p.amount;
          tgt.takenFrom[p.srcKind] = (tgt.takenFrom[p.srcKind] ?? 0) + p.amount;
          tgt.takenByOrigin[p.origin] = (tgt.takenByOrigin[p.origin] ?? 0) + p.amount;
          const list = recentTaken.get(tgt.id) ?? [];
          list.push({ tick: e.tick, src: p.src, dtype: p.dtype, amount: p.amount });
          if (list.length > 60) list.shift();
          recentTaken.set(tgt.id, list);
        }
        break;
      }
      case 'heal': {
        const src = heroes.get(e.payload.src);
        const tgt = heroes.get(e.payload.tgt);
        if (src) src.healingDone += e.payload.amount;
        if (tgt) tgt.healingReceived += e.payload.amount;
        break;
      }
      case 'death': {
        const h = heroes.get(e.payload.id);
        if (!h) break;
        h.deaths++;
        teams[h.team].deaths++;
        const cause = e.payload.killerKind === 'none' ? 'unknown' : e.payload.killerKind;
        teams[h.team].heroDeathsByCause[cause] = (teams[h.team].heroDeathsByCause[cause] ?? 0) + 1;
        const killer = heroes.get(e.payload.killer);
        if (killer) {
          killer.kills++;
          teams[killer.team].kills++;
        }
        for (const a of e.payload.assists) {
          const ah = heroes.get(a);
          if (ah) {
            ah.assists++;
            teams[ah.team].assists++;
          }
        }
        const mix = emptyMix();
        const fromHeroes: Record<number, number> = {};
        for (const t of recentTaken.get(h.id) ?? []) {
          if (e.tick - t.tick > WINDOW_BEFORE_DEATH) continue;
          mix[t.dtype] += t.amount;
          if (heroes.has(t.src)) fromHeroes[t.src] = (fromHeroes[t.src] ?? 0) + t.amount;
        }
        h.deathRecords.push({
          tick: e.tick,
          killer: e.payload.killer,
          killerKind: e.payload.killerKind,
          x: e.payload.x,
          y: e.payload.y,
          mix,
          fromHeroes,
        });
        recentTaken.delete(h.id);
        break;
      }
      case 'gold': {
        const h = heroes.get(e.payload.id);
        if (!h) break;
        h.goldEarned += e.payload.amount;
        teams[h.team].goldEarned += e.payload.amount;
        h.goldBySource[e.payload.source] =
          (h.goldBySource[e.payload.source] ?? 0) + e.payload.amount;
        const total = (goldTotals.get(h.id) ?? 0) + e.payload.amount;
        goldTotals.set(h.id, total);
        h.goldSeries.push({ tick: e.tick, total });
        break;
      }
      case 'purchase': {
        heroes.get(e.payload.id)?.purchases.push({
          tick: e.tick,
          item: e.payload.item,
          price: e.payload.price,
          consumed: e.payload.consumed,
        });
        break;
      }
      case 'sell':
        heroes
          .get(e.payload.id)
          ?.sells.push({ tick: e.tick, item: e.payload.item, refund: e.payload.refund });
        break;
      case 'rankUp':
        heroes
          .get(e.payload.id)
          ?.ranks.push({ tick: e.tick, rank: e.payload.rank, bonus: e.payload.bonus });
        break;
      case 'fork':
        heroes.get(e.payload.id)?.forks.push({
          tick: e.tick,
          rank: e.payload.rank,
          optionId: e.payload.optionId,
          auto: e.payload.auto,
        });
        break;
      case 'gambit': {
        const g = teams[e.payload.team].gambitsPlayed;
        g[e.payload.cardId] = (g[e.payload.cardId] ?? 0) + 1;
        break;
      }
      case 'pawnFielded':
        teams[e.payload.team].pawnsFielded++;
        break;
      case 'check':
        teams[e.payload.team].checks++;
        break;
      case 'recall':
        heroes
          .get(e.payload.id)
          ?.recalls.push({ tick: e.tick, dest: e.payload.dest, stage: e.payload.stage });
        break;
      case 'structureDown': {
        special.structures.push({
          tick: e.tick,
          kind: e.payload.kind,
          team: e.payload.team,
          lane: e.payload.lane,
          index: e.payload.index,
          killer: e.payload.killer,
        });
        const kt = teamOf.get(e.payload.killer);
        const victim = e.payload.team;
        const credit: PlayTeam | null = kt ?? (victim === 'A' ? 'B' : victim === 'B' ? 'A' : null);
        if (credit) {
          if (e.payload.kind === 'tower') teams[credit].towersDestroyed++;
          else teams[credit].guardianDestroyed = true;
        }
        break;
      }
      case 'campCleared': {
        const kt = teamOf.get(e.payload.killer);
        if (kt) teams[kt].campsCleared++;
        break;
      }
      case 'obeliskClaimed':
        teams[e.payload.team].obelisksClaimed++;
        special.obelisks.push({
          tick: e.tick,
          team: e.payload.team,
          node: e.payload.node,
          reward: e.payload.reward,
          value: e.payload.value,
        });
        break;
      case 'teamPoints':
        if (e.payload.amount > 0) teams[e.payload.team].pointsEarned += e.payload.amount;
        break;
      case 'bid':
        if (viewer && e.payload.team !== viewer && !auctionResolved) break;
        teams[e.payload.team].pointsSpent += e.payload.points;
        special.bids.push({ tick: e.tick, ...e.payload });
        break;
      case 'auctionResolved':
        special.auction = {
          holy: e.payload.holy,
          winner: e.payload.winner,
          recipient: e.payload.recipient,
          pointsA: e.payload.pointsA,
          pointsB: e.payload.pointsB,
          goldA: e.payload.goldA,
          goldB: e.payload.goldB,
        };
        break;
      case 'curseOffered':
        special.curses.push({ tick: e.tick, hero: e.payload.hero, item: e.payload.item });
        break;
      case 'curseAccepted': {
        special.curses.push({
          tick: e.tick,
          hero: e.payload.hero,
          item: e.payload.item,
          flaw: e.payload.flaw,
        });
        heroes
          .get(e.payload.hero)
          ?.curse.push({ tick: e.tick, item: e.payload.item, flaw: e.payload.flaw });
        break;
      }
      case 'curseRefused':
        special.curses.push({
          tick: e.tick,
          hero: e.payload.hero,
          item: e.payload.item,
          refused: true,
        });
        break;
      case 'keeperMoved':
        special.keeper.push({ tick: e.tick, spot: e.payload.spot, stock: e.payload.stock });
        break;
      case 'pressure':
        special.pressure.push({ tick: e.tick, name: e.payload.name });
        break;
      case 'biomeOpen':
        special.biomes.push({ tick: e.tick, slot: e.payload.slot, biome: e.payload.biome });
        break;
      default:
        break;
    }
  }

  const pos = new PositionIndex(input.samples);
  for (const h of heroes.values()) {
    h.path = pos.slice(h.id, w.tickFrom, w.tickTo);
    let d = 0;
    for (let i = 1; i < h.path.length; i++) {
      d += Math.hypot(h.path[i].x - h.path[i - 1].x, h.path[i].y - h.path[i - 1].y);
    }
    h.distance = Math.round(d);
  }

  const fights = deriveFights(events, pos, teamOf, {
    gapTicks: Math.round(input.fightGapSec * input.tickRate),
    radius: input.fightRadius,
    seqFrom: w.seqFrom,
    seqTo: w.seqTo,
  });
  for (const f of fights) for (const id of f.participants) heroes.get(id)?.fightIds.push(f.id);

  const heroList = [...heroes.values()];
  const badges = computeBadges(input.badges, heroList);
  const phases = phaseNumbers(events);
  return {
    scope,
    fromTick: w.tickFrom,
    toTick: w.tickTo,
    roster,
    heroes: heroList,
    teams,
    fights,
    badges,
    special,
    phases,
    viewerTeam: viewer ?? input.playerTeam ?? 'A',
  };
}

export function mostTakenType(h: HeroModel): { type: DamageType; share: number } | null {
  const total = h.taken.blade + h.taken.soul + h.taken.true;
  if (total <= 0) return null;
  let best: DamageType = 'blade';
  for (const t of ['blade', 'soul', 'true'] as DamageType[])
    if (h.taken[t] > h.taken[best]) best = t;
  return { type: best, share: h.taken[best] / total };
}
