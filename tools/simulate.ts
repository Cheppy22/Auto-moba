import {
  Match,
  type Content,
  type PieceId,
  type PlayTeam,
  type RelicMode,
  type TeamSetup,
} from '../src/sim';
import { teamNetWorth } from '../src/sim/curses';
import { PLAY_TEAMS } from '../src/sim';
import { aiCardPick, cardBlock } from '../src/sim/gambits';
import { highGroundEdge } from '../src/sim/world/height';

export interface HeroResult {
  team: PlayTeam;
  /** Piece id. */
  def: string;
  /** The archetype the piece chose at Rank 4; '' if it never reached Rank 4. */
  style: string;
  path: string;
  role: string;
  won: boolean;
  kills: number;
  deaths: number;
  assists: number;
  goldEarned: number;
  items: string[];
  rank: number;
}

export interface MatchSummary {
  seed: number;
  winner: PlayTeam | null;
  phases: number;
  minutes: number;
  ticks: number;
  ms: number;
  heroes: HeroResult[];
  curses: {
    offered: number;
    accepted: number;
    refused: number;
    acceptedBy: { item: string; won: boolean }[];
  };
  lead1: PlayTeam | null;
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
  /** Each Act break: every piece's gold and Masterworks (break index 0 = after Act 1). */
  breaks: BreakRead[];
  /** Masterwork purchases (any time), by item id. */
  masterworks: Record<string, number>;
  /** No Checkmate: the winner came from adjudication (a run or Blitz). */
  adjudicated: boolean;
}

/** One piece at one Act break (gold before and after the break shop, items after it). */
export interface BreakRead {
  act: number;
  team: PlayTeam;
  piece: string;
  /** Gold banked when the bell broke (before any break shopping). */
  goldBefore: number;
  /** Gold left when the next Act starts. */
  goldAfter: number;
  /** Gold spent at the break (net of sell refunds). */
  spent: number;
  items: number;
  /** Masterworks owned when the next Act starts, and those bought at this break. */
  masterworks: number;
  boughtMasterworks: number;
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
  /** White's pieces buy by a fixed greedy plan from the start (see `PLAN_PRESETS`). */
  plans?: PlanPreset;
  /** `blitz`: the short pace (at most 3 Acts, adjudicated without Checkmate). */
  pace?: 'blitz';
  /** Both sides play piece builds (`MatchConfig.techniques`). */
  techniques?: boolean;
  /** No items; Ranks grow by `builds.rankGrowth` (`MatchConfig.items: false`). */
  noItems?: boolean;
}

const TPS = 20;

/**
 * Greedy fixed plans for White (`--plans A=<preset>`, spec 1C balance plan step 3):
 * `mind-queen` (the Queen rushes the three Mind Masterworks), `body-rook` (the Rook rushes the three
 * Body Masterworks), `stack` (every piece stacks its main category: the four tier-2 items for the
 * 4-item attunement, then two Masterworks).
 */
export const PLAN_PRESETS = ['mind-queen', 'body-rook', 'stack'] as const;
export type PlanPreset = (typeof PLAN_PRESETS)[number];

function presetPlans(content: Content, m: Match, preset: PlanPreset): void {
  const byCat = (cat: string, tier: number) =>
    content.items.filter((i) => i.category === cat && i.tier === tier).map((i) => i.id);
  const rush = (cat: string) => [...byCat(cat, 3), ...byCat(cat, 2)].slice(0, 6);
  for (const id of m.state.teams.A.heroIds) {
    const h = m.unitById(id)!.hero!;
    let plan: string[] | null = null;
    if (preset === 'mind-queen' && h.defId === 'queen') plan = rush('mind');
    else if (preset === 'body-rook' && h.defId === 'rook') plan = rush('body');
    else if (preset === 'stack') {
      const st = content.pieceById.get(h.defId)!.stats;
      const cat = st.soulPower > st.bladeDmg * 0.8 ? 'soul' : 'mind';
      plan = [...byCat(cat, 2), ...byCat(cat, 3)].slice(0, 6);
    }
    if (plan) h.plan = plan;
  }
}

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
    ...(opts.techniques ? { techniques: true } : {}),
    ...(opts.noItems ? { items: false } : {}),
    autoGambits: { A: !opts.noGambitsA && !opts.whitePlayer, B: !opts.noGambitsB },
    // The baseline removes Tempo spending only; forks still pick at once as the AI does.
    autoForks: { A: true, B: true },
  });
  if (m.state.phase.kind === 'setup') m.issue({ type: 'setupTeam', ...m.defaultSetup() });
  if (opts.whitePlayer) m.issue({ type: 'setPawnPlan', quota: { top: 2, mid: 2, bot: 2 } });
  if (opts.plans) presetPlans(content, m, opts.plans);
  const reads = paceReader(m, !!opts.whitePlayer && !opts.noGambitsA, opts.whiteEvery ?? 0);
  const act = content.tuning.phaseSeconds * content.tuning.tickRate;
  const breaks: BreakRead[] = [];
  let evSeen = 0;
  const readBreak = (act: number): void => {
    // the break resolved inside this tick (headless): purchases and sells marked `at: 'break'`
    const spent = new Map<number, number>();
    const bought = new Map<number, number>();
    for (let k = evSeen; k < m.events.length; k++) {
      const e = m.events[k];
      if (e.type === 'purchase' && e.payload.at === 'break') {
        spent.set(e.payload.id, (spent.get(e.payload.id) ?? 0) + e.payload.price);
        if (content.itemById.get(e.payload.item)?.tier === 3)
          bought.set(e.payload.id, (bought.get(e.payload.id) ?? 0) + 1);
      } else if (e.type === 'sell' && e.payload.at === 'break')
        spent.set(e.payload.id, (spent.get(e.payload.id) ?? 0) - e.payload.refund);
    }
    for (const team of PLAY_TEAMS) {
      for (const id of m.state.teams[team].heroIds) {
        const h = m.unitById(id)!.hero!;
        const sp = spent.get(id) ?? 0;
        breaks.push({
          act,
          team,
          piece: h.defId,
          goldBefore: h.gold + sp,
          goldAfter: h.gold,
          spent: sp,
          items: h.items.length,
          masterworks: h.items.filter((x) => content.itemById.get(x)?.tier === 3).length,
          boughtMasterworks: bought.get(id) ?? 0,
        });
      }
    }
  };
  const run = (ticks: number): void => {
    for (let i = 0; i < ticks; i++) {
      reads.before();
      const act = m.state.phase.n;
      evSeen = m.events.length;
      if (m.step(1) === 0) return;
      if (m.state.phase.kind === 'live' && m.state.phase.n > act) readBreak(act);
      reads.after();
    }
  };
  run(act);
  let lead1: PlayTeam | null = null;
  if (m.state.phase.kind === 'live') {
    const a = teamNetWorth(m.ctx, 'A');
    const b = teamNetWorth(m.ctx, 'B');
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
        path: h.path,
        role: h.role,
        won: winner === team,
        kills: h.kills,
        deaths: h.deaths,
        assists: h.assists,
        goldEarned: h.goldEarned,
        items: h.items.slice(),
        rank: h.rank,
      });
    }
  }
  const curses = {
    offered: 0,
    accepted: 0,
    refused: 0,
    acceptedBy: [] as { item: string; won: boolean }[],
  };
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
  const masterworks: Record<string, number> = {};
  let campsCleared = 0;
  let firstTowerMinute: number | null = null;
  let throneAt = -1;
  let mate: MatchSummary['mate'] = null;
  const min = (tick: number): number => tick / content.tuning.tickRate / 60;
  for (const e of m.events) {
    if (e.type === 'relicOffered') relics[e.payload.team].offered.push(...e.payload.ids);
    else if (e.type === 'relicTaken') relics[e.payload.team].taken.push(e.payload.relic);
    else if (e.type === 'curseOffered') curses.offered++;
    else if (e.type === 'curseRefused') curses.refused++;
    else if (e.type === 'curseAccepted') {
      curses.accepted++;
      const t = teamOfHero.get(e.payload.hero);
      curses.acceptedBy.push({ item: e.payload.item, won: t !== undefined && t === winner });
    } else if (e.type === 'obeliskClaimed') obelisks[e.payload.team]++;
    else if (e.type === 'campCleared') campsCleared++;
    else if (e.type === 'gambit') {
      const g = gambits[e.payload.team];
      g[e.payload.cardId] = (g[e.payload.cardId] ?? 0) + 1;
      tempoSpent[e.payload.team].cards += content.gambitById.get(e.payload.cardId)?.cost ?? 0;
    } else if (e.type === 'pawnFielded') {
      pawns[e.payload.team]++;
      tempoSpent[e.payload.team].pawns += content.tuning.pawns.cost;
    } else if (e.type === 'check') checks[e.payload.team]++;
    else if (e.type === 'purchase' && content.itemById.get(e.payload.item)?.tier === 3)
      masterworks[e.payload.item] = (masterworks[e.payload.item] ?? 0) + 1;
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
  const ms = Number(process.hrtime.bigint() - t0) / 1e6;
  return {
    seed,
    winner,
    phases: s.phase.n,
    minutes: min(s.tick),
    ticks: s.tick,
    ms,
    heroes,
    curses,
    lead1,
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
    masterworks,
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
