import { stepUnits } from './behavior';
import { initAuction } from './auction';
import { applyCommand } from './commands';
import type { Content } from './content/loader';
import type { LaneId } from './content/schema';
import { TPS } from './combat';
import type { Ctx } from './ctx';
import { Grid } from './core/grid';
import { seedStreams } from './core/rng';
import { strategicUpdate } from './ai/strategic';
import { updateFronts } from './ai/lanes';
import { tickEvents } from './events';
import { cardBlock, initHands, tickGambits } from './gambits';
import { createKeeper } from './keeper';
import { tickObelisks } from './obelisks';
import { pawnCap, pawnsAlive } from './pawns';
import { actTicks, enterAct, tickActClock } from './phase';
import { tickSpiritTide } from './pressure';
import { forkOptions, tickForks } from './ranks';
import { attackKindOf } from './pieces';
import { aiSetup, placeTeam, validateSetup } from './setup';
import { aiShop, nextTarget } from './ai/shopping';
import { nearBase } from './shop';
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
import type {
  Command,
  CommandResult,
  EventPayloads,
  EventType,
  GameEvent,
  MatchConfig,
  MatchState,
  PlayTeam,
  Recorder,
  Replay,
  ReplayOp,
  SetupEntry,
  SnapGambit,
  SnapUnit,
  Snapshot,
  Unit,
} from './types';

function initialState(content: Content, config: MatchConfig): MatchState {
  const seed = config.seed;
  const rng = seedStreams(seed);
  // Both seeded picks are always drawn (White's pre-filled default first), so a fixed setup never
  // shifts the stream for the other side.
  const defaultA = aiSetup(content, rng);
  const pickB = aiSetup(content, rng);
  const team = (): MatchState['teams']['A'] => ({
    points: 0,
    unlocks: [],
    heroIds: [],
    kills: 0,
    towersDown: 0,
    guardianId: -1,
    curseOffers: 0,
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
    auction: {
      holyId: '',
      bids: { A: { points: 0, gold: 0, goldBy: {} }, B: { points: 0, gold: 0, goldBy: {} } },
      resolved: false,
      winner: null,
      recipient: null,
      awaitingRecipient: false,
    },
    curseOffers: [],
    keeper: { unitId: -1, spot: '', stock: [] },
    tagMult: {},
    pressure: [],
    winner: null,
    nextWaveTick: 0,
    obeliskSchedule: [],
    setup: { A: config.setup?.A ?? defaultA, B: config.setup?.B ?? pickB },
    autoGambits: { A: config.autoGambits?.A ?? false, B: config.autoGambits?.B ?? true },
    autoForks: {
      A: config.autoForks?.A ?? config.autoGambits?.A ?? false,
      B: true,
    },
    tempo: { A: 0, B: 0 },
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
  };
}

function buildCtx(content: Content, state: MatchState): Ctx {
  const rec: Recorder = { events: [], samples: [], seq: 0 };
  const world = buildWorld(content.map);
  const ctx: Ctx = {
    s: state,
    c: content,
    t: content.tuning,
    world,
    open: new Set(state.slots.filter((x) => x.open).map((x) => x.id)),
    rec,
    idx: new Map(),
    grid: new Grid<Unit>(content.map.size, 100),
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
    emit: <K extends EventType>(type: K, payload: EventPayloads[K]): void => {
      rec.events.push({ tick: state.tick, seq: rec.seq++, type, payload } as GameEvent);
    },
    unit: (id: number) => ctx.idx.get(id),
  };
  return ctx;
}

function startMatch(ctx: Ctx, white: SetupEntry[]): void {
  const s = ctx.s;
  s.setup.A = white;
  for (const team of ['A', 'B'] as PlayTeam[]) {
    for (const lane of LANES) {
      makeTower(ctx, team, lane as LaneId, 0);
      makeTower(ctx, team, lane as LaneId, 1);
    }
    makeGuardian(ctx, team);
  }
  createKeeper(ctx);
  placeTeam(ctx, 'A', s.setup.A);
  placeTeam(ctx, 'B', s.setup.B);
  initAuction(ctx);
  const heroes = [...s.teams.A.heroIds, ...s.teams.B.heroIds].map((id) => {
    const u = ctx.unit(id)!;
    const h = u.hero!;
    return { id, team: u.team, def: u.defId, role: h.role, style: h.style, path: h.path };
  });
  ctx.emit('matchStart', { seed: s.seed, heroes });
  s.tempo = { A: ctx.t.gambits.tempoStart, B: ctx.t.gambits.tempoStart };
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
  const order: PlayTeam[] = Math.floor(s.tick / 20) % 2 === 0 ? ['A', 'B'] : ['B', 'A'];
  for (const team of order) {
    for (const id of s.teams[team].heroIds) {
      const u = ctx.unit(id);
      if (!u || !u.alive) continue;
      if ((s.tick + (u.hero ? u.hero.slot : id) * 3) % 20 === 0) strategicUpdate(ctx, u);
      if (
        u.hero &&
        (s.tick + id) % 20 === 0 &&
        u.hero.gold >= ctx.t.ai.shopAtBaseGold &&
        nearBase(ctx, u)
      ) {
        aiShop(ctx, u);
      }
    }
  }
  stepUnits(ctx);
  tickUnitState(ctx);
  processDeaths(ctx);
  respawnHeroes(ctx);
  passiveGold(ctx);
  sampleAndFlush(ctx);
  s.tick++;
  tickActClock(ctx);
}

export class Match {
  readonly ctx: Ctx;
  private ops: ReplayOp[] = [];
  private constructor(
    readonly content: Content,
    readonly config: MatchConfig,
  ) {
    this.ctx = buildCtx(content, initialState(content, config));
  }

  /** With `config.setup.A` the match starts live at once; otherwise it waits for `setupTeam`. */
  static create(content: Content, config: MatchConfig): Match {
    const m = new Match(content, config);
    for (const side of [config.setup?.A, config.setup?.B]) {
      if (side === undefined) continue;
      const err = validateSetup(content, side);
      if (err) throw new Error(`Invalid setup: ${err}`);
    }
    if (config.setup?.A) startMatch(m.ctx, m.ctx.s.setup.A);
    return m;
  }

  /** White's pre-filled setup (the AI default), for the setup board and headless runs. */
  defaultSetup(): SetupEntry[] {
    return this.ctx.s.setup.A.map((e) => ({ ...e }));
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
    return applyCommand(this.ctx, cmd, startMatch);
  }

  step(ticks = 1): number {
    let n = 0;
    const last = this.ops[this.ops.length - 1];
    for (let i = 0; i < ticks; i++) {
      if (this.ctx.s.phase.kind !== 'live') break;
      stepTick(this.ctx);
      n++;
    }
    if (n > 0) {
      if (last && last.op === 'step') last.ticks += n;
      else this.ops.push({ op: 'step', ticks: n });
    }
    return n;
  }

  /** Runs to checkmate (or the Act limit). A match still in setup starts with White's default. */
  runToEnd(maxPhases = 12): void {
    if (this.ctx.s.phase.kind === 'setup')
      this.issue({ type: 'setupTeam', pieces: this.defaultSetup() });
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
    let keeper: Snapshot['keeper'] = null;
    const need = this.ctx.t.obelisk.claimSec * TPS;
    const forkIds = new Set(s.forks.map((f) => f.heroId));
    for (const u of s.units) {
      if (!u.alive && !u.hero) continue;
      if (u.kind === 'keeper') keeper = { x: u.x, y: u.y, spot: s.keeper.spot };
      const shield = u.shields.reduce((a, b) => a + b.amount, 0);
      const h = u.hero;
      let curse = false;
      let holy = false;
      if (h) {
        for (const id of h.items) {
          if (c.cursedById.has(id)) curse = true;
          if (c.holyById.has(id)) holy = true;
        }
      }
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
        path: h ? h.path : null,
        rank: h ? h.rank : 0,
        forkPending: forkIds.has(u.id),
        pawn: !!u.pawn,
        lane: h ? h.lane : u.lane,
        role: h ? h.role : null,
        marked: u.mods.some((m) => m.id === 'gambit:check'),
        stunned: u.stunUntil !== undefined && u.stunUntil > s.tick,
        attackKind: h ? attackKindOf(c, h) : null,
        recalling: !!h?.recall,
        goal: h?.goal ? h.goal.kind : null,
        slot: h ? h.slot : 0,
        range: u.stats.range,
        claim: u.obelisk ? Math.max(u.obelisk.claim.A, u.obelisk.claim.B) / need : 0,
        curse,
        holy,
        target: u.targetId,
        flash: u.atkCd >= Math.max(1, Math.round(TPS / Math.max(0.2, u.stats.atkSpeed))) - 2,
      });
    }
    const live = s.phase.kind === 'live';
    const hand: SnapGambit[] = s.hands.A.map((slot, i) => {
      const def = slot.cardId !== null ? c.gambitById.get(slot.cardId) : undefined;
      const block = def ? cardBlock(this.ctx, 'A', i) : 'refilling';
      return {
        slot: i,
        cardId: def ? def.id : '',
        name: def ? def.name : '',
        desc: def ? def.desc : '',
        cost: def ? def.cost : 0,
        target: def ? def.target : 'none',
        piece: def ? def.piece : null,
        usable: live && block === '',
        reason: live ? block : 'match not live',
        ticksLeft: def ? Math.max(0, slot.expireTick - s.tick) : 0,
        refillTicks: slot.refillTick !== null ? Math.max(0, slot.refillTick - s.tick) : null,
      };
    });
    const cap = live ? pawnCap(this.ctx) : this.ctx.t.pawns.capBase;
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
      keeper,
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
      act: s.phase.n,
      tempo: { A: Math.floor(s.tempo.A), B: Math.floor(s.tempo.B) },
      hand,
      pawns: {
        A: { alive: pawnsAlive(this.ctx, 'A'), cap, cost: this.ctx.t.pawns.cost },
        B: { alive: pawnsAlive(this.ctx, 'B'), cap, cost: this.ctx.t.pawns.cost },
      },
      forks: s.forks
        .filter((f) => this.ctx.unit(f.heroId)?.team === 'A')
        .map((f) => {
          const u = this.ctx.unit(f.heroId)!;
          return {
            heroId: f.heroId,
            piece: u.hero!.defId,
            rank: f.rank,
            options: forkOptions(this.ctx, u, f.rank).map((o) => ({
              id: o.id,
              name: o.name,
              desc: o.desc,
            })),
            ticksLeft: Math.max(0, f.deadlineTick - s.tick),
          };
        }),
      check: { ...s.check },
      throneDown: { ...s.throneDown },
      zones: s.zones.map((z) => ({
        team: z.team,
        x: z.x,
        y: z.y,
        radius: z.radius,
        ticksLeft: Math.max(0, z.endTick - s.tick),
      })),
    };
  }

  /** The build-path item a piece buys next (the Armory's "next buy"). */
  nextBuy(heroId: number): string | null {
    const u = this.ctx.unit(heroId);
    return u?.hero ? nextTarget(this.ctx, u) : null;
  }

  unitById(id: number): Unit | undefined {
    return this.ctx.unit(id);
  }
}
