import { stepUnits } from './behavior';
import { resolveCollisions } from './collision';
import { applyCommand } from './commands';
import { contentFor, type Content } from './content/loader';
import type { LaneId } from './content/schema';
import { inCombat, TPS } from './combat';
import type { Ctx } from './ctx';
import { Grid } from './core/grid';
import { rand, seedStreams } from './core/rng';
import { strategicUpdate } from './ai/strategic';
import { updateFronts } from './ai/lanes';
import { tickEvents } from './events';
import { DESPERADO_MOD, POISON_MOD, cardBlock, initHands, tickGambits } from './gambits';
import { tickObelisks } from './obelisks';
import { pawnCap, pawnsAlive } from './pawns';
import { cardCost, formationError, pawnCost, refillSec, tempoCap } from './relics';
import { tickPawnPlan } from './pawnPlan';
import { bannerZones, freshRelicRun, tickRelics } from './relicsLive';
import { actTicks, enterAct } from './phase';
import { bellTimeScale, frozen, freshBell, tickBell } from './bell';
import { freshTally } from './actReport';
import { freshFeedback, inDuel, laneMomentum, laneNow, tickFights } from './feedback';
import { tickRuns } from './impact';
import { tickSpiritTide } from './pressure';
import { forkOptions, tickForks } from './ranks';
import { attackKindOf } from './pieces';
import { aiSetup, placeTeam, validateSetup } from './setup';
import { applyStart, runRulesFor } from './runRules';
import { forkPreview, techniquePreview, type ForkPreview } from './preview';
import { buildAdvice, buildView, firstMoves, freshBuilds, startBuilds } from './builds';
import {
  passiveGold,
  processDeaths,
  respawnHeroes,
  sampleAndFlush,
  spawnWaves,
  tickUnitState,
} from './systems';
import { tickCampRespawns } from './camps';
import { makeGuardian, makeTower } from './units';
import { LANES, buildWorld } from './world/map';
import { highGroundEdge } from './world/height';
import type {
  ActTechTally,
  Command,
  BuildAdvice,
  BuildView,
  FirstMoveView,
  Grade,
  TechniquePreview,
  CommandResult,
  EventPayloads,
  EventType,
  GameEvent,
  MatchConfig,
  MatchState,
  PlayTeam,
  Recorder,
  RelicAim,
  RelicMode,
  Replay,
  ReplayOp,
  SnapGambit,
  SnapUnit,
  Snapshot,
  TeamSetup,
  Unit,
} from './types';
import { PLAY_TEAMS } from './names';

function initialState(content: Content, config: MatchConfig): MatchState {
  const seed = config.seed;
  const run = runRulesFor(config, content);
  const rng = seedStreams(seed);
  // Both seeded picks are always drawn (White's pre-filled default first), so a fixed setup never
  // shifts the stream for the other side.
  const defaultA = aiSetup(content, rng);
  const pickB = aiSetup(content, rng);
  const team = (): MatchState['teams']['A'] => ({
    points: 0,
    heroIds: [],
    kills: 0,
    towersDown: 0,
    guardianId: -1,
  });
  return {
    seed,
    tick: 0,
    phase: { kind: 'setup', n: 0, startTick: 0 },
    units: [],
    nextId: 1,
    rng,
    teams: { A: team(), B: team() },
    slots: content.map.slots.map((s) => ({
      id: s.id,
      open: false,
      biomeId: null,
      campRespawn: [],
      campIds: [],
      types: [],
      mirrored: false,
    })),
    tagMult: {},
    pressure: [],
    winner: null,
    nextWaveTick: 0,
    obeliskSchedule: [],
    setup: { A: config.setup?.A ?? defaultA, B: config.setup?.B ?? pickB },
    opening: { A: (config.setup?.A ?? defaultA).opening, B: (config.setup?.B ?? pickB).opening },
    teamDamage: { A: null, B: null },
    breakthrough: { A: {}, B: {} },
    tempoSlow: { A: null, B: null },
    increment: { A: null, B: null },
    forceStyles: { A: config.forceStyles?.A ?? {}, B: config.forceStyles?.B ?? {} },
    autoGambits: { A: config.autoGambits?.A ?? false, B: config.autoGambits?.B ?? true },
    autoForks: {
      A: config.autoForks?.A ?? config.autoGambits?.A ?? false,
      B: true,
    },
    tempo: { A: 0, B: 0 },
    tempoSpent: { A: { pawns: 0, cards: 0 }, B: { pawns: 0, cards: 0 } },
    hands: { A: [], B: [] },
    forks: [],
    check: { A: false, B: false },
    throneDown: { A: false, B: false },
    zones: [],
    timedMods: [],
    board: {
      A: { claims: {}, plan: { tick: -999, siege: false, lane: 'mid' } },
      B: { claims: {}, plan: { tick: -999, siege: false, lane: 'mid' } },
    },
    tideNextTick: 0,
    lastPassiveTick: 0,
    events: [],
    eventSchedule: [],
    nextEventId: 1,
    bell: freshBell(),
    actTally: freshTally(0),
    feedback: freshFeedback(),
    relics: {
      run: freshRelicRun(),
      held: { A: [], B: [] },
      offers: { A: [], B: [] },
      settled: { A: true, B: true },
      latest: { A: null, B: null },
      behind: { A: false, B: false },
      mode: relicModes(config),
    },
    ...(run ? { run } : {}),
    ...(config.pace === 'blitz' ? { pace: 'blitz' as const } : {}),
    builds: freshBuilds(),
  };
}

const copyAim = <T extends RelicAim>(a: T): T => ({ ...a, quota: a.quota ? { ...a.quota } : null });

function relicModes(config: MatchConfig): Record<PlayTeam, RelicMode> {
  const manual = config.pauseForBreak ?? false;
  const a = config.relics?.A ?? (manual ? 'manual' : 'ai');
  const b = config.relics?.B ?? 'ai';
  return { A: a === 'manual' && !manual ? 'ai' : a, B: b === 'manual' ? 'ai' : b };
}

function buildCtx(
  content: Content,
  state: MatchState,
  pauseForForks: boolean,
  pauseForBreak: boolean,
): Ctx {
  const rec: Recorder = { events: [], samples: [], seq: 0 };
  const world = buildWorld(content.map);
  const ctx: Ctx = {
    s: state,
    c: content,
    t: content.tuning,
    pauseForForks,
    pauseForBreak,
    world,
    open: new Set(state.slots.filter((x) => x.open).map((x) => x.id)),
    rec,
    idx: new Map(),
    grid: new Grid<Unit>(world.width, world.length, 100),
    towers: {
      A: { top: [], mid: [], bot: [] },
      B: { top: [], mid: [], bot: [] },
    },
    guardians: { A: null, B: null },
    front: {
      A: { top: 0.2, mid: 0.2, bot: 0.2 },
      B: { top: 0.2, mid: 0.2, bot: 0.2 },
    },
    buckets: new Map(),
    actLog: [],
    emit: <K extends EventType>(type: K, payload: EventPayloads[K]): void => {
      rec.events.push({ tick: state.tick, seq: rec.seq++, type, payload } as GameEvent);
    },
    unit: (id: number) => ctx.idx.get(id),
  };
  return ctx;
}

function startMatch(ctx: Ctx, white: TeamSetup, start?: MatchConfig['start']): void {
  const s = ctx.s;
  s.setup.A = white;
  s.opening = { A: white.opening, B: s.setup.B.opening };
  for (const team of PLAY_TEAMS) {
    for (const lane of LANES) {
      makeTower(ctx, team, lane as LaneId, 0);
      makeTower(ctx, team, lane as LaneId, 1);
    }
    makeGuardian(ctx, team);
  }
  placeTeam(ctx, 'A', s.setup.A.pieces);
  placeTeam(ctx, 'B', s.setup.B.pieces);
  // the removed auction drew once from the loot stream here: keep that draw so seeds replay the same
  rand(ctx.s.rng, 'loot');
  const heroes = [...s.teams.A.heroIds, ...s.teams.B.heroIds].map((id) => {
    const u = ctx.unit(id)!;
    const h = u.hero!;
    return { id, team: u.team, def: u.defId, role: h.role, style: h.style };
  });
  ctx.emit('matchStart', { seed: s.seed, heroes });
  s.tempo = { A: ctx.t.gambits.tempoStart, B: ctx.t.gambits.tempoStart };
  applyStart(ctx, start);
  startBuilds(ctx);
  initHands(ctx);
  enterAct(ctx, 1);
}

function stepTick(ctx: Ctx): void {
  const s = ctx.s;
  for (const u of s.units) {
    u.px = u.x;
    u.py = u.y;
  }
  ctx.grid.clear();
  for (const u of s.units) if (u.alive) ctx.grid.insert(u);
  if (s.tick % 20 === 0) updateFronts(ctx);
  spawnWaves(ctx);
  tickSpiritTide(ctx);
  tickObelisks(ctx);
  tickEvents(ctx);
  tickCampRespawns(ctx);
  tickForks(ctx);
  tickGambits(ctx);
  tickRelics(ctx);
  tickPawnPlan(ctx);
  const order: PlayTeam[] = Math.floor(s.tick / 20) % 2 === 0 ? ['A', 'B'] : ['B', 'A'];
  for (const team of order) {
    for (const id of s.teams[team].heroIds) {
      const u = ctx.unit(id);
      if (!u || !u.alive) continue;
      if ((s.tick + (u.hero ? u.hero.slot : id) * 3) % 20 === 0) strategicUpdate(ctx, u);
    }
  }
  stepUnits(ctx);
  resolveCollisions(ctx);
  tickUnitState(ctx);
  tickFights(ctx);
  processDeaths(ctx);
  tickRuns(ctx);
  respawnHeroes(ctx);
  passiveGold(ctx);
  sampleAndFlush(ctx);
  s.tick++;
  tickBell(ctx);
}

export class Match {
  readonly ctx: Ctx;
  /** The content this match plays with: the loaded content, or its Long Board variant. */
  readonly content: Content;
  private ops: ReplayOp[] = [];
  private constructor(
    loaded: Content,
    readonly config: MatchConfig,
  ) {
    const content = contentFor(loaded, config.map, config.pace);
    this.content = content;
    this.ctx = buildCtx(
      content,
      initialState(content, config),
      config.pauseForForks ?? false,
      config.pauseForBreak ?? false,
    );
  }

  /** With `config.setup.A` the match starts live at once; otherwise it waits for `setupTeam`. */
  static create(content: Content, config: MatchConfig): Match {
    const m = new Match(content, config);
    for (const side of [config.setup?.A, config.setup?.B]) {
      if (side === undefined) continue;
      const err = validateSetup(content, side);
      if (err) throw new Error(`Invalid setup: ${err}`);
    }
    if (config.setup?.A) startMatch(m.ctx, m.ctx.s.setup.A, config.start);
    return m;
  }

  /** White's pre-filled setup (the AI default), for the setup board and headless runs. */
  defaultSetup(): TeamSetup {
    const d = this.ctx.s.setup.A;
    return { opening: d.opening, pieces: d.pieces.map((e) => ({ ...e })) };
  }

  get state(): MatchState {
    return this.ctx.s;
  }

  get events(): GameEvent[] {
    return this.ctx.rec.events;
  }

  get samples(): Recorder['samples'] {
    return this.ctx.rec.samples;
  }

  issue(cmd: Command): CommandResult {
    this.ops.push({ op: 'issue', cmd });
    return applyCommand(this.ctx, cmd, (ctx, white) => startMatch(ctx, white, this.config.start));
  }

  /**
   * Steps up to `ticks` ticks and returns how many ran. With `pauseForForks` it stops right after
   * the tick a White fork opens, and returns 0 while any White fork is pending. With
   * `pauseForBreak` it returns 0 while the Act break sheet waits for `resumeAct`.
   */
  step(ticks = 1): number {
    let n = 0;
    const last = this.ops[this.ops.length - 1];
    const pause = this.ctx.pauseForForks;
    for (let i = 0; i < ticks; i++) {
      if (this.ctx.s.phase.kind !== 'live') break;
      if (pause && this.ctx.s.forks.length > 0) break;
      if (this.ctx.s.bell.stage === 'break') break;
      stepTick(this.ctx);
      n++;
    }
    if (n > 0) {
      if (last && last.op === 'step') last.ticks += n;
      else this.ops.push({ op: 'step', ticks: n });
    }
    return n;
  }

  /** The app's step-rate multiplier: 1 normally, easing out to 0 across the bell's halt. */
  get timeScale(): number {
    return bellTimeScale(this.ctx);
  }

  /** Runs to checkmate (or the Act limit). A match still in setup starts with White's default. */
  runToEnd(maxPhases = 12): void {
    if (this.ctx.s.phase.kind === 'setup')
      this.issue({ type: 'setupTeam', ...this.defaultSetup() });
    const act = actTicks(this.ctx);
    while (this.ctx.s.phase.kind === 'live' && this.ctx.s.phase.n <= maxPhases) {
      if (this.step(act) === 0) break;
    }
  }

  exportReplay(): Replay {
    return {
      seed: this.config.seed,
      contentHash: this.content.hash,
      config: this.config,
      ops: this.ops.map((o) => (o.op === 'step' ? { ...o } : { op: 'issue', cmd: { ...o.cmd } })),
    };
  }

  static fromReplay(content: Content, replay: Replay): Match {
    if (replay.contentHash !== content.hash)
      throw new Error('Replay was recorded against different content');
    const m = Match.create(content, replay.config);
    for (const op of replay.ops) {
      if (op.op === 'issue') m.issue(op.cmd);
      else m.step(op.ticks);
    }
    return m;
  }

  snapshot(): Snapshot {
    const s = this.ctx.s;
    const c = this.content;
    const units: SnapUnit[] = [];
    const need = this.ctx.t.obelisk.claimSec * TPS;
    const forkIds = new Set(s.forks.map((f) => f.heroId));
    for (const u of s.units) {
      if (!u.alive && !u.hero) continue;
      const shield = u.shields.reduce((a, b) => a + b.amount, 0);
      const h = u.hero;
      units.push({
        id: u.id,
        kind: u.kind,
        team: u.team,
        defId: u.defId,
        x: u.x,
        y: u.y,
        px: u.px,
        py: u.py,
        hp: u.hp,
        maxHp: u.stats.maxHp,
        shield,
        alive: u.alive,
        piece: h ? h.defId : null,
        style: h ? h.style : null,
        rank: h ? h.rank : 0,
        forkPending: forkIds.has(u.id),
        pawn: !!u.pawn,
        lane: h ? h.lane : u.lane,
        role: h ? h.role : null,
        marked: u.mods.some((m) => m.id === 'gambit:check'),
        poisoned: u.mods.some((m) => m.id === POISON_MOD),
        stunned: u.stunUntil !== undefined && u.stunUntil > s.tick,
        ...(u.rootUntil !== undefined && u.rootUntil > s.tick ? { pinned: true as const } : {}),
        ...(u.mods.some((m) => m.id === DESPERADO_MOD) ? { desperate: true as const } : {}),
        attackKind: h ? attackKindOf(c, h) : null,
        recalling: !!h?.recall,
        goal: h?.goal ? h.goal.kind : null,
        ...(h ? { engage: h.engage } : {}),
        slot: h ? h.slot : 0,
        range: u.stats.range,
        claim: u.obelisk ? Math.max(u.obelisk.claim.A, u.obelisk.claim.B) / need : 0,
        target: u.targetId,
        inCombat: inCombat(s.tick, u),
        ...(h ? { inDuel: inDuel(this.ctx, u), laneNow: laneNow(this.ctx, u) } : {}),
        ...(highGroundEdge(this.ctx, u) ? { highGround: true as const } : {}),
        flash: u.atkCd >= Math.max(1, Math.round(TPS / Math.max(0.2, u.stats.atkSpeed))) - 2,
      });
    }
    const live = s.phase.kind === 'live';
    const still = live && frozen(this.ctx);
    const hand: SnapGambit[] = s.hands.A.map((slot, i) => {
      const def = slot.cardId !== null ? c.gambitById.get(slot.cardId) : undefined;
      const block = def ? cardBlock(this.ctx, 'A', i) : 'refilling';
      return {
        slot: i,
        cardId: def ? def.id : '',
        school: def ? def.school : null,
        name: def ? def.name : '',
        desc: def ? def.desc : '',
        cost: def ? cardCost(this.ctx, 'A', def) : 0,
        target: def ? def.target : 'none',
        piece: def ? def.piece : null,
        usable: live && !still && block === '',
        reason: !live ? 'match not live' : still ? 'play is stopped for the bell' : block,
        ticksLeft: def
          ? slot.opening
            ? Math.max(0, actTicks(this.ctx) - (s.tick - s.phase.startTick))
            : Math.max(0, slot.expireTick - s.tick)
          : 0,
        refillTicks: slot.refillTick !== null ? Math.max(0, slot.refillTick - s.tick) : null,
        refillTotal: slot.discarded ?? Math.round(refillSec(this.ctx, 'A') * TPS),
        discarded: slot.discarded !== undefined,
        opening: !!slot.opening,
      };
    });
    const pawnsOf = (team: PlayTeam): Snapshot['pawns']['A'] => ({
      alive: pawnsAlive(this.ctx, team),
      cap: live ? pawnCap(this.ctx, team) : this.ctx.t.pawns.capBase,
      cost: pawnCost(this.ctx, team),
    });
    return {
      tick: s.tick,
      phase: { ...s.phase },
      winner: s.winner,
      units,
      slots: s.slots.map((sl) => {
        const d = c.map.slots.find((x) => x.id === sl.id)!;
        return { id: sl.id, open: sl.open, biomeId: sl.biomeId, x: d.x, y: d.y, radius: d.radius };
      }),
      pressure: s.pressure.slice(),
      points: { A: s.teams.A.points, B: s.teams.B.points },
      phaseTicksLeft: live ? Math.max(0, actTicks(this.ctx) - (s.tick - s.phase.startTick)) : 0,
      events: s.events.map((e) => {
        const def = c.eventById.get(e.defId)!;
        return {
          id: `${e.defId}#${e.id}`,
          kind: e.defId,
          type: e.kind,
          name: def.name,
          slot: e.slot,
          x: e.x,
          y: e.y,
          radius: e.radius,
          phase: e.phase,
          ticksLeft: Math.max(0, (e.phase === 'warning' ? e.warnEndTick : e.endTick) - s.tick),
          progress: e.progress,
          team: e.kind === 'parade' ? e.target : e.holder,
          ...(e.tele
            ? {
                telegraph: {
                  x: e.tele.x,
                  y: e.tele.y,
                  radius: def.telegraph?.radius ?? 0,
                  ticksLeft: Math.max(0, e.tele.endTick - s.tick),
                },
              }
            : {}),
        };
      }),
      act: this.snapAct(live),
      tempo: { A: Math.floor(s.tempo.A), B: Math.floor(s.tempo.B) },
      hand,
      pawns: { A: pawnsOf('A'), B: pawnsOf('B') },
      ...(s.pawnPlan
        ? {
            pawnPlan: {
              quota: { ...s.pawnPlan.quota },
              reserve: s.pawnPlan.reserve,
              auto: s.pawnPlan.auto,
            },
          }
        : {}),
      forks: s.forks
        .filter((f) => this.ctx.unit(f.heroId)?.team === 'A')
        .map((f) => {
          const u = this.ctx.unit(f.heroId)!;
          return {
            heroId: f.heroId,
            piece: u.hero!.defId,
            kind: 'archetype' as const,
            style: u.hero!.style,
            rank: f.rank,
            options: forkOptions(this.ctx, u).map((o) => ({
              id: o.id,
              name: o.name,
              desc: o.desc,
            })),
            ticksLeft: f.deadlineTick === null ? null : Math.max(0, f.deadlineTick - s.tick),
          };
        }),
      check: { ...s.check },
      throneDown: { ...s.throneDown },
      opening: s.phase.kind === 'setup' ? { A: null, B: null } : { ...s.opening },
      zones: [
        ...s.zones.map((z) => {
          const wall = z.wall;
          return {
            kind: z.kind,
            team: z.team,
            ...(z.lane ? { lane: z.lane } : {}),
            x: z.x,
            y: z.y,
            radius: z.radius,
            ...(wall ? { angle: Math.atan2(wall.by - wall.ay, wall.bx - wall.ax) } : {}),
            ticksLeft: Math.max(0, z.endTick - s.tick),
          };
        }),
        ...bannerZones(this.ctx, s.phase.startTick + actTicks(this.ctx)),
      ],
      momentum: laneMomentum(this.ctx),
      relics: {
        held: {
          A: s.relics.held.A.map(copyAim),
          B: s.relics.held.B.map(copyAim),
        },
        offers: s.relics.offers.A.map((o) => ({ ...o, aim: copyAim(o.aim) })),
        settled: s.relics.settled.A,
        latest: { ...s.relics.latest },
        behind: { ...s.relics.behind },
        formation: formationError(this.ctx, 'A'),
        pawnCap: pawnCap(this.ctx, 'A', s.phase.n + 1),
        ...(s.run ? { max: s.run.relicMax } : {}),
      },
      tempoMax: tempoCap(this.ctx, 'A'),
      handRefillSec: refillSec(this.ctx, 'A'),
      clock: {
        slowTicks: Math.max(0, (s.tempoSlow.A?.untilTick ?? 0) - s.tick),
        incrementTicks: Math.max(0, (s.increment.A?.untilTick ?? 0) - s.tick),
        refund: s.increment.A?.value ?? 0,
      },
    };
  }

  private snapAct(live: boolean): Snapshot['act'] {
    const s = this.ctx.s;
    const b = s.bell;
    const bell = live ? b.stage : 'none';
    const left = live ? actTicks(this.ctx) - (s.tick - s.phase.startTick) : 0;
    return {
      n: s.phase.n,
      remainingSec: Math.max(0, left) / TPS,
      bell,
      ...(bell === 'tolling' || bell === 'halt' ? { toll: b.toll } : {}),
      ...(bell === 'halt' || bell === 'break'
        ? {
            haltProgress:
              bell === 'break' ? 1 : Math.min(1, (s.tick - b.since) / this.ctx.t.bell.haltTicks),
          }
        : {}),
      ...(bell === 'break' && b.report ? { report: b.report } : {}),
    };
  }

  /** White's Tempo cost for a card, less an extra relic `discount` (read-only; never below the minimum). */
  cardCost(cardId: string, discount = 0): number {
    const def = this.ctx.c.gambitById.get(cardId);
    return def ? cardCost(this.ctx, 'A', def, discount) : 0;
  }

  /** What one archetype of a piece's pending fork would change: stats before and after, its skill (read-only). */
  forkPreview(heroId: number, optionId: string): ForkPreview | null {
    return forkPreview(this.ctx, heroId, optionId);
  }

  /** The Builds tab's data for one piece (either side; read-only); null when the id is not a piece. */
  buildView(heroId: number): BuildView | null {
    return buildView(this.ctx, heroId);
  }

  /** "Pick for me" at a break: the AI's pick per open offer and the 1-2 picks that matter most. */
  buildAdvice(team: PlayTeam = 'A'): BuildAdvice {
    return buildAdvice(this.ctx, team);
  }

  /** What taking a Technique at a grade would change on a piece (read-only). */
  techniquePreview(heroId: number, techniqueId: string, grade: Grade): TechniquePreview | null {
    return techniquePreview(this.ctx, heroId, techniqueId, grade);
  }

  /**
   * Setup's First moves for White (before the match starts): each piece's offer for this Opening,
   * the AI's pick and the picks that matter most; the same cards the match deals when it starts.
   */
  firstMoves(opening?: string): FirstMoveView {
    const setup = this.ctx.s.setup.A;
    const view = firstMoves(
      this.content,
      this.ctx.t,
      this.ctx.s.seed,
      opening ?? setup.opening,
      setup.pieces.map((e) => e.piece),
      this.config.start?.A?.heirlooms,
    );
    // no piece exists yet, so the real numbers come from a throwaway match with the same setup
    const probe = this.setupProbe();
    if (!probe) return view;
    for (const row of view.pieces) {
      const id = probe.state.teams.A.heroIds.find(
        (i) => probe.unitById(i)?.hero?.defId === row.piece,
      );
      if (id === undefined) continue;
      for (const card of row.cards) {
        const pv = probe.techniquePreview(id, card.id, card.grade);
        // the "last Act" estimate has nothing to count before the match
        card.preview = pv ? { ...pv, estimate: null } : null;
      }
    }
    return view;
  }

  private probe: Match | null | undefined;

  /**
   * A throwaway match with White's default setup, holding only a run's heirlooms: Setup's cards
   * are priced on its pieces (stats before and after) because the real pieces do not exist yet.
   */
  private setupProbe(): Match | null {
    if (this.probe !== undefined) return this.probe;
    this.probe = null;
    try {
      const probe = Match.create(this.content, {
        ...this.config,
        setup: { A: this.defaultSetup() },
      });
      const heirlooms = this.config.start?.A?.heirlooms ?? {};
      for (const id of probe.state.teams.A.heroIds) {
        const h = probe.unitById(id)?.hero;
        if (!h) continue;
        h.techniques = h.techniques.filter((x) => x.id === heirlooms[h.defId]);
      }
      this.probe = probe;
    } catch (err) {
      console.error('The First moves numbers could not be read from a probe match', err);
    }
    return this.probe;
  }

  /**
   * What each Technique did, Act by Act (the Act in progress last): the end report's per-Act
   * tallies. Kept beside the match state, not in it, so it never touches a state hash.
   */
  techniqueLog(): ActTechTally[] {
    const open = this.ctx.s.builds.act;
    const rows =
      Object.keys(open).length > 0 ? [{ act: this.ctx.s.phase.n, techniques: open }] : [];
    return [...this.ctx.actLog, ...rows].map((r) => ({
      act: r.act,
      techniques: Object.fromEntries(Object.entries(r.techniques).map(([k, v]) => [k, { ...v }])),
    }));
  }

  unitById(id: number): Unit | undefined {
    return this.ctx.unit(id);
  }
}
