import {
  Match,
  type Content,
  type PieceId,
  type PlayTeam,
  type RelicMode,
  type TeamSetup,
} from '../src/sim';
import { teamGoldEarned } from '../src/sim/gold';
import { PLAY_TEAMS } from '../src/sim';
import { aiCardPick, cardBlock } from '../src/sim/gambits';
import { highGroundEdge } from '../src/sim/world/height';

export interface HeroResult {
  team: PlayTeam;
  /** Piece id. */
  def: string;
  /** The archetype the piece chose at Rank 4; '' if it never reached Rank 4. */
  style: string;
  role: string;
  won: boolean;
  kills: number;
  deaths: number;
  assists: number;
  goldEarned: number;
  rank: number;
  /** Techniques held at match end (`id:grade`). */
  techniques: string[];
}

export interface MatchSummary {
  seed: number;
  winner: PlayTeam | null;
  phases: number;
  minutes: number;
  ticks: number;
  ms: number;
  heroes: HeroResult[];
  lead1: PlayTeam | null;
  /** Each side's Opening id. */
  opening: Record<PlayTeam, string>;
  comeback: boolean;
  obelisks: Record<PlayTeam, number>;
  towers: Record<PlayTeam, number>;
  kills: Record<PlayTeam, number>;
  campsCleared: number;
  firstTowerMinute: number | null;
  gambits: Record<PlayTeam, Record<string, number>>;
  pawns: Record<PlayTeam, number>;
  /** Tempo spent per side on gambit cards and on fielding pawns. */
  tempoSpent: Record<PlayTeam, { cards: number; pawns: number }>;
  checks: Record<PlayTeam, number>;
  /** Minute each rank was first reached by any piece (index = rank). */
  rankMinute: (number | null)[];
  /** How the match ended: checkmate after the Throne fell first or the King fell first. */
  mate: 'throneFirst' | 'kingFirst' | null;
  /** Relic ids offered to each side across the match, and the ones it took. */
  relics: Record<PlayTeam, { offered: string[]; taken: string[]; held: string[] }>;
  /** Tempo pacing per side (seconds of match clock). */
  pace: Record<PlayTeam, TempoPace>;
  /** The Long Board's high-ground eye badge (`SnapUnit.highGround`), read every tick. */
  eye: EyeRead;
  /** Each Act break: every piece's gold and Techniques (break index 0 = after Act 1). */
  breaks: BreakRead[];
  /** No Checkmate: the winner came from adjudication (a run or Blitz). */
  adjudicated: boolean;
  /** Every card dealt (rerolls included) and every card taken, per side. */
  builds: Record<
    PlayTeam,
    { offered: string[]; taken: string[]; passes: number; rerolls: number; upgrades: number }
  >;
}

/** One piece at one Act break, read when the next Act starts. */
export interface BreakRead {
  act: number;
  team: PlayTeam;
  piece: string;
  /** Gold left when the next Act starts. */
  goldAfter: number;
  /** Gold spent at the break on rerolls and upgrades (net of the gold a pass gives). */
  spent: number;
  /** Techniques held when the next Act starts. */
  techniques: number;
  /** Upgrades bought at this break. */
  upgrades: number;
}

export interface TempoPace {
  /** First second a card in the hand could be played (its piece up, the Tempo there); null if never. */
  firstAffordableSec: number | null;
  /** First card played; null if none. */
  firstPlaySec: number | null;
  /** Cards played in each Act (index 0 = Act 1). */
  cardsByAct: number[];
  /** Seconds between consecutive card plays. */
  gaps: number[];
  /** Act 1 seconds with 0, 1, 2 and 3 playable cards in the hand. */
  act1Playable: [number, number, number, number];
  /** Cards dealt in Act 1, and those that left the hand without ever being playable. */
  act1Dealt: number;
  act1Dead: number;
  /** Mean Tempo held across Act 1. */
  act1Tempo: number;
}

export interface EyeRead {
  /** Ticks a living piece existed, and ticks it showed the badge. */
  pieceTicks: number;
  onTicks: number;
  /** Times the badge turned on (all, and only showings that lasted at least 1 s). */
  turnOns: number;
  turnOns1s: number;
  /** Pieces in the match (for per-piece rates). */
  pieces: number;
}

export interface SimOptions {
  maxPhases?: number;
  /** White never plays gambits or fields pawns (the gambit-value baseline). */
  noGambitsA?: boolean;
  /** Black never plays gambits or fields pawns. */
  noGambitsB?: boolean;
  setup?: { A?: TeamSetup; B?: TeamSetup };
  /** Who drafts each side's relics at the Act breaks (default: both by the AI rule). */
  relics?: { A?: RelicMode; B?: RelicMode };
  /** `long`: play on the Long Board. */
  map?: 'long';
  /** Force archetypes at Rank 4 (per team and piece). */
  forceStyles?: { A?: Partial<Record<PieceId, string>>; B?: Partial<Record<PieceId, string>> };
  /**
   * White as the browser sets up a player: the standing pawn plan (2 / 2 / 2, auto on) fields
   * White's pawns, never the AI. White's cards come from a stand-in player that plays the AI's
   * best-fitting card once a second, or none with `noGambitsA` (a player who never taps a card).
   */
  whitePlayer?: boolean;
  /** With `whitePlayer`: the stand-in plays at most one card per this many seconds (0 = no limit). */
  whiteEvery?: number;
  /** `blitz`: the short pace (at most 3 Acts, adjudicated without Checkmate). */
  pace?: 'blitz';
}

const TPS = 20;

export function simulateMatch(content: Content, seed: number, opts: SimOptions = {}): MatchSummary {
  const t0 = process.hrtime.bigint();
  const maxPhases = opts.maxPhases ?? 10;
  const m = Match.create(content, {
    seed,
    setup: opts.setup,
    forceStyles: opts.forceStyles,
    relics: opts.relics,
    map: opts.map,
    ...(opts.pace ? { pace: opts.pace } : {}),
    autoGambits: { A: !opts.noGambitsA && !opts.whitePlayer, B: !opts.noGambitsB },
    // The baseline removes Tempo spending only; forks still pick at once as the AI does.
    autoForks: { A: true, B: true },
  });
  if (m.state.phase.kind === 'setup') m.issue({ type: 'setupTeam', ...m.defaultSetup() });
  if (opts.whitePlayer) m.issue({ type: 'setPawnPlan', quota: { top: 2, mid: 2, bot: 2 } });
  const reads = paceReader(m, !!opts.whitePlayer && !opts.noGambitsA, opts.whiteEvery ?? 0);
  const act = content.tuning.phaseSeconds * content.tuning.tickRate;
  const breaks: BreakRead[] = [];
  const goldBefore = new Map<number, number>();
  const readBreak = (act: number): void => {
    // the break resolved inside this tick (headless): the upgrades it bought are its events
    const upgrades = new Map<number, number>();
    for (let k = evSeen; k < m.events.length; k++) {
      const e = m.events[k];
      if (e.type === 'techniqueUpgrade')
        upgrades.set(e.payload.id, (upgrades.get(e.payload.id) ?? 0) + 1);
    }
    for (const team of PLAY_TEAMS) {
      for (const id of m.state.teams[team].heroIds) {
        const h = m.unitById(id)!.hero!;
        breaks.push({
          act,
          team,
          piece: h.defId,
          goldAfter: h.gold,
          spent: (goldBefore.get(id) ?? h.gold) - h.gold,
          techniques: h.techniques.length,
          upgrades: upgrades.get(id) ?? 0,
        });
      }
    }
  };
  let evSeen = 0;
  const run = (ticks: number): void => {
    for (let i = 0; i < ticks; i++) {
      reads.before();
      const act = m.state.phase.n;
      evSeen = m.events.length;
      if (m.state.bell.stage === 'halt')
        for (const team of PLAY_TEAMS)
          for (const id of m.state.teams[team].heroIds)
            goldBefore.set(id, m.unitById(id)!.hero!.gold);
      if (m.step(1) === 0) return;
      if (m.state.phase.kind === 'live' && m.state.phase.n > act) readBreak(act);
      reads.after();
    }
  };
  run(act);
  let lead1: PlayTeam | null = null;
  if (m.state.phase.kind === 'live') {
    const a = teamGoldEarned(m.ctx, 'A');
    const b = teamGoldEarned(m.ctx, 'B');
    lead1 = a === b ? null : a > b ? 'A' : 'B';
  }
  while (m.state.phase.kind === 'live' && m.state.phase.n <= maxPhases) run(act);
  const s = m.state;
  const winner = s.winner;
  const heroes: HeroResult[] = [];
  for (const team of PLAY_TEAMS) {
    for (const id of s.teams[team].heroIds) {
      const h = m.unitById(id)!.hero!;
      heroes.push({
        team,
        def: h.defId,
        style: h.style ?? '',
        role: h.role,
        won: winner === team,
        kills: h.kills,
        deaths: h.deaths,
        assists: h.assists,
        goldEarned: h.goldEarned,
        rank: h.rank,
        techniques: h.techniques.map((x) => `${x.id}:${x.grade}`),
      });
    }
  }
  const teamOfHero = new Map<number, PlayTeam>();
  for (const team of PLAY_TEAMS) for (const id of s.teams[team].heroIds) teamOfHero.set(id, team);
  const obelisks: Record<PlayTeam, number> = { A: 0, B: 0 };
  const gambits: Record<PlayTeam, Record<string, number>> = { A: {}, B: {} };
  const pawns: Record<PlayTeam, number> = { A: 0, B: 0 };
  const checks: Record<PlayTeam, number> = { A: 0, B: 0 };
  const tempoSpent = { A: { cards: 0, pawns: 0 }, B: { cards: 0, pawns: 0 } };
  const relics: MatchSummary['relics'] = {
    A: { offered: [], taken: [], held: s.relics.held.A.map((h) => h.id) },
    B: { offered: [], taken: [], held: s.relics.held.B.map((h) => h.id) },
  };
  const rankMinute: (number | null)[] = Array.from({ length: 9 }, () => null);
  let campsCleared = 0;
  let firstTowerMinute: number | null = null;
  let throneAt = -1;
  let mate: MatchSummary['mate'] = null;
  const min = (tick: number): number => tick / content.tuning.tickRate / 60;
  for (const e of m.events) {
    if (e.type === 'relicOffered') relics[e.payload.team].offered.push(...e.payload.ids);
    else if (e.type === 'relicTaken') relics[e.payload.team].taken.push(e.payload.relic);
    else if (e.type === 'obeliskClaimed') obelisks[e.payload.team]++;
    else if (e.type === 'campCleared') campsCleared++;
    else if (e.type === 'gambit') {
      const g = gambits[e.payload.team];
      g[e.payload.cardId] = (g[e.payload.cardId] ?? 0) + 1;
      tempoSpent[e.payload.team].cards += content.gambitById.get(e.payload.cardId)?.cost ?? 0;
    } else if (e.type === 'pawnFielded') {
      pawns[e.payload.team]++;
      tempoSpent[e.payload.team].pawns += content.tuning.pawns.cost;
    } else if (e.type === 'check') checks[e.payload.team]++;
    else if (e.type === 'rankUp') {
      if (rankMinute[e.payload.rank] === null) rankMinute[e.payload.rank] = min(e.tick);
    } else if (e.type === 'throneDown' && winner && e.payload.team !== winner) throneAt = e.tick;
    else if (e.type === 'checkmate') mate = throneAt === e.tick ? 'kingFirst' : 'throneFirst';
    else if (
      e.type === 'structureDown' &&
      e.payload.kind === 'tower' &&
      firstTowerMinute === null
    ) {
      firstTowerMinute = min(e.tick);
    }
  }
  const blank = () => ({
    offered: [] as string[],
    taken: [] as string[],
    passes: 0,
    rerolls: 0,
    upgrades: 0,
  });
  const builds = { A: blank(), B: blank() };
  for (const e of m.events) {
    if (e.type === 'buildOffer') {
      builds[e.payload.team].offered.push(...e.payload.cards);
      if (e.payload.reroll > 0) builds[e.payload.team].rerolls++;
    } else if (e.type === 'technique') builds[e.payload.team].taken.push(e.payload.technique);
    else if (e.type === 'offerPassed') {
      const t = teamOfHero.get(e.payload.id);
      if (t) builds[t].passes++;
    } else if (e.type === 'techniqueUpgrade') {
      const t = teamOfHero.get(e.payload.id);
      if (t) builds[t].upgrades++;
    }
  }
  const ms = Number(process.hrtime.bigint() - t0) / 1e6;
  return {
    builds,
    seed,
    winner,
    phases: s.phase.n,
    minutes: min(s.tick),
    ticks: s.tick,
    ms,
    heroes,
    lead1,
    opening: { ...s.opening },
    comeback: lead1 !== null && winner !== null && winner !== lead1,
    obelisks,
    towers: { A: s.teams.A.towersDown, B: s.teams.B.towersDown },
    kills: { A: s.teams.A.kills, B: s.teams.B.kills },
    campsCleared,
    firstTowerMinute,
    gambits,
    pawns,
    tempoSpent,
    checks,
    rankMinute,
    mate,
    relics,
    pace: reads.pace(),
    eye: reads.eye,
    breaks,
    adjudicated: m.events.some((e) => e.type === 'matchEnd' && !!e.payload.adjudicated),
  };
}

/**
 * Per-tick read-outs for the Tempo pacing and eye-badge metrics. They only read the state, so
 * the match plays the same with or without them; the stand-in player (`cards`) issues White's
 * card plays as commands.
 */
function paceReader(
  m: Match,
  cards: boolean,
  every: number,
): { before(): void; after(): void; pace(): Record<PlayTeam, TempoPace>; eye: EyeRead } {
  const ctx = m.ctx;
  const s = m.state;
  const blank = (): TempoPace => ({
    firstAffordableSec: null,
    firstPlaySec: null,
    cardsByAct: [],
    gaps: [],
    act1Playable: [0, 0, 0, 0],
    act1Dealt: 0,
    act1Dead: 0,
    act1Tempo: 0,
  });
  const out: Record<PlayTeam, TempoPace> = { A: blank(), B: blank() };
  const slots: Record<PlayTeam, { key: string; ever: boolean; act1: boolean }[]> = { A: [], B: [] };
  const eye: EyeRead = { pieceTicks: 0, onTicks: 0, turnOns: 0, turnOns1s: 0, pieces: 0 };
  const run = new Map<number, number>();
  let act1Ticks = 0;
  let lastPlay = -Infinity;
  const endSlot = (team: PlayTeam, k: number): void => {
    const old = slots[team][k];
    if (old?.key && old.act1) {
      out[team].act1Dealt++;
      if (!old.ever) out[team].act1Dead++;
    }
  };
  return {
    before(): void {
      if (!cards || s.tick % TPS !== 5 || s.phase.kind !== 'live') return;
      if (s.tick - lastPlay < every * TPS) return;
      const best = aiCardPick(ctx, 'A');
      if (best && m.issue({ type: 'playGambit', slot: best.slot, ...best.plan.target }).ok)
        lastPlay = s.tick;
    },
    after(): void {
      const act1 = s.phase.kind === 'live' && s.phase.n === 1;
      if (act1) act1Ticks++;
      for (const team of PLAY_TEAMS) {
        const o = out[team];
        let n = 0;
        s.hands[team].forEach((h, k) => {
          const key = h.cardId === null ? '' : `${h.cardId}@${h.expireTick}`;
          const cur = slots[team][k];
          if (!cur || cur.key !== key) {
            endSlot(team, k);
            slots[team][k] = { key, ever: false, act1 };
          }
          if (h.cardId !== null && cardBlock(ctx, team, k) === '') {
            n++;
            slots[team][k].ever = true;
          }
        });
        if (n > 0 && o.firstAffordableSec === null) o.firstAffordableSec = s.tick / TPS;
        if (act1) {
          o.act1Playable[Math.min(3, n)] += 1 / TPS;
          o.act1Tempo += s.tempo[team];
        }
      }
      for (const team of PLAY_TEAMS) {
        for (const id of s.teams[team].heroIds) {
          const u = ctx.unit(id);
          if (!u?.alive) continue;
          eye.pieceTicks++;
          const on = highGroundEdge(ctx, u);
          const len = run.get(id) ?? 0;
          if (on) {
            eye.onTicks++;
            if (len === 0) eye.turnOns++;
            if (len + 1 === TPS) eye.turnOns1s++;
            run.set(id, len + 1);
          } else if (len) run.set(id, 0);
        }
      }
    },
    pace(): Record<PlayTeam, TempoPace> {
      eye.pieces = s.teams.A.heroIds.length + s.teams.B.heroIds.length;
      for (const team of PLAY_TEAMS) {
        slots[team].forEach((_x, k) => endSlot(team, k));
        out[team].act1Tempo /= Math.max(1, act1Ticks);
      }
      let act = 0;
      const last: Record<PlayTeam, number | null> = { A: null, B: null };
      for (const e of m.events) {
        if (e.type === 'phaseStart' && e.payload.kind === 'live') act = e.payload.phase;
        if (e.type !== 'gambit') continue;
        const o = out[e.payload.team];
        const sec = e.tick / TPS;
        while (o.cardsByAct.length < act) o.cardsByAct.push(0);
        o.cardsByAct[act - 1]++;
        if (o.firstPlaySec === null) o.firstPlaySec = sec;
        const prev = last[e.payload.team];
        if (prev !== null) o.gaps.push(sec - prev);
        last[e.payload.team] = sec;
      }
      return out;
    },
    eye,
  };
}
