import { stepUnits } from './behavior';
import { initAuction } from './auction';
import { applyCommand } from './commands';
import type { Content } from './content/loader';
import type { LaneId, Role } from './content/schema';
import { TPS } from './combat';
import type { Ctx } from './ctx';
import { Grid } from './core/grid';
import { seedStreams, pick } from './core/rng';
import { strategicUpdate } from './ai/strategic';
import { updateFronts } from './ai/lanes';
import { createKeeper } from './keeper';
import { tickObelisks } from './obelisks';
import { enterPrep, endLive } from './phase';
import { tickSpiritTide } from './pressure';
import { aiShop } from './ai/shopping';
import { baseCatalog, nearBase, quote } from './shop';
import { dirtyAll, recompute } from './stats';
import {
  passiveGold,
  processDeaths,
  respawnHeroes,
  sampleAndFlush,
  spawnWaves,
  tickUnitState,
} from './systems';
import { tickCampRespawns } from './camps';
import { makeGuardian, makeHero, makeTower } from './units';
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
  ShopEntry,
  SnapUnit,
  Snapshot,
  Unit,
} from './types';

const ROLE_SLOTS: Role[] = ['top', 'mid', 'bot', 'bot', 'jungle'];

function initialState(content: Content, seed: number, withPlayer: boolean | null): MatchState {
  const rng = seedStreams(seed);
  const aiHeroes: Record<PlayTeam, string[]> = { A: [], B: [] };
  const nA = withPlayer === null ? 5 : 4;
  for (let i = 0; i < nA; i++) aiHeroes.A.push(pick(rng, 'draft', content.heroes).id);
  for (let i = 0; i < 5; i++) aiHeroes.B.push(pick(rng, 'draft', content.heroes).id);
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
    phase: { kind: 'draft', n: 0, startTick: 0 },
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
    playerHeroId: null,
    upgradeOffers: {},
    draft: {
      aiHeroes,
      playerHero: null,
      playerRole: null,
      playerTeam: 'A',
    },
    board: { A: { claims: {} }, B: { claims: {} } },
    tideNextTick: 0,
    lastPassiveTick: 0,
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

function assignRoles(
  ctx: Ctx,
  heroIds: string[],
  fixed: { id: string; role: Role } | null,
): { defId: string; role: Role; isPlayer: boolean }[] {
  const pool = ROLE_SLOTS.slice();
  const out: { defId: string; role: Role; isPlayer: boolean; order: number }[] = [];
  if (fixed) {
    pool.splice(pool.indexOf(fixed.role), 1);
    out.push({ defId: fixed.id, role: fixed.role, isPlayer: true, order: -1 });
  }
  const pending = heroIds.map((defId, order) => ({ defId, order }));
  const unplaced: typeof pending = [];
  for (const p of pending) {
    const pref = ctx.c.heroById.get(p.defId)!.preferredRole;
    const i = pool.indexOf(pref);
    if (i >= 0) {
      pool.splice(i, 1);
      out.push({ defId: p.defId, role: pref, isPlayer: false, order: p.order });
    } else unplaced.push(p);
  }
  for (const p of unplaced) {
    const role = pool.shift()!;
    out.push({ defId: p.defId, role, isPlayer: false, order: p.order });
  }
  out.sort((a, b) => ROLE_SLOTS.indexOf(a.role) - ROLE_SLOTS.indexOf(b.role));
  return out;
}

function finalizeDraft(ctx: Ctx): void {
  const s = ctx.s;
  const d = s.draft!;
  for (const team of ['A', 'B'] as PlayTeam[]) {
    for (const lane of LANES) {
      makeTower(ctx, team, lane as LaneId, 0);
      makeTower(ctx, team, lane as LaneId, 1);
    }
    makeGuardian(ctx, team);
  }
  createKeeper(ctx);
  const fixed = d.playerHero && d.playerRole ? { id: d.playerHero, role: d.playerRole } : null;
  const roster: Record<PlayTeam, { defId: string; role: Role; isPlayer: boolean }[]> = {
    A: assignRoles(ctx, d.aiHeroes.A, fixed),
    B: assignRoles(ctx, d.aiHeroes.B, null),
  };
  for (const team of ['A', 'B'] as PlayTeam[]) {
    roster[team].forEach((r, slot) => {
      const u = makeHero(ctx, team, slot, r.defId, r.role, r.isPlayer);
      if (r.isPlayer) s.playerHeroId = u.id;
    });
  }
  initAuction(ctx);
  s.draft = null;
  const heroes = [...s.teams.A.heroIds, ...s.teams.B.heroIds].map((id) => {
    const u = ctx.unit(id)!;
    return { id, team: u.team, def: u.defId, role: u.hero!.role };
  });
  ctx.emit('matchStart', { seed: s.seed, heroes });
  enterPrep(ctx, 1);
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
  tickCampRespawns(ctx);
  for (const team of ['A', 'B'] as PlayTeam[]) {
    for (const id of s.teams[team].heroIds) {
      const u = ctx.unit(id);
      if (!u || !u.alive) continue;
      if ((s.tick + id * 3) % 20 === 0) strategicUpdate(ctx, u);
      if (
        u.hero &&
        !u.hero.isPlayer &&
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
  if (s.phase.kind === 'live' && s.tick - s.phase.startTick >= Math.round(ctx.t.phaseSeconds * TPS))
    endLive(ctx);
}

export class Match {
  readonly ctx: Ctx;
  private ops: ReplayOp[] = [];
  private constructor(
    readonly content: Content,
    readonly config: MatchConfig,
  ) {
    const player = config.player;
    const state = initialState(content, config.seed, player === null ? null : true);
    this.ctx = buildCtx(content, state);
  }

  static create(content: Content, config: MatchConfig): Match {
    const m = new Match(content, config);
    if (config.player) {
      m.ctx.s.draft!.playerHero = config.player.heroId;
      m.ctx.s.draft!.playerRole = config.player.role;
      finalizeDraft(m.ctx);
    } else if (config.player === null) {
      finalizeDraft(m.ctx);
    }
    return m;
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
    return applyCommand(this.ctx, cmd, finalizeDraft);
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

  autoAdvance(): CommandResult {
    const k = this.ctx.s.phase.kind;
    if (k === 'prep') return this.issue({ type: 'startPhase' });
    if (k === 'report') return this.issue({ type: 'continue' });
    return { ok: false, reason: 'nothing to advance' };
  }

  runToEnd(maxPhases = 12): void {
    for (let guard = 0; guard < maxPhases * 4; guard++) {
      const s = this.ctx.s;
      if (s.phase.kind === 'end') return;
      if (s.phase.kind === 'live') this.step(Math.round(this.ctx.t.phaseSeconds * TPS) + 5);
      else {
        const r = this.autoAdvance();
        if (!r.ok) return;
      }
      if (this.ctx.s.phase.n > maxPhases && this.ctx.s.phase.kind !== 'live') return;
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
    const units: SnapUnit[] = [];
    let keeper: Snapshot['keeper'] = null;
    const need = this.ctx.t.obelisk.claimSec * TPS;
    for (const u of s.units) {
      if (!u.alive && !u.hero) continue;
      if (u.kind === 'keeper') keeper = { x: u.x, y: u.y, spot: s.keeper.spot };
      const shield = u.shields.reduce((a, b) => a + b.amount, 0);
      const h = u.hero;
      let curse = false;
      let holy = false;
      if (h) {
        for (const id of h.items) {
          if (this.content.cursedById.has(id)) curse = true;
          if (this.content.holyById.has(id)) holy = true;
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
        isPlayer: !!h?.isPlayer,
        role: h ? h.role : null,
        posture: h ? h.posture : null,
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
    const phaseTicks = Math.round(this.ctx.t.phaseSeconds * TPS);
    return {
      tick: s.tick,
      phase: { ...s.phase },
      winner: s.winner,
      units,
      slots: s.slots.map((sl) => {
        const d = this.content.map.slots.find((x) => x.id === sl.id)!;
        return { id: sl.id, open: sl.open, biomeId: sl.biomeId, x: d.x, y: d.y, radius: d.radius };
      }),
      pressure: s.pressure.slice(),
      points: { A: s.teams.A.points, B: s.teams.B.points },
      playerHeroId: s.playerHeroId,
      keeper,
      phaseTicksLeft:
        s.phase.kind === 'live' ? Math.max(0, phaseTicks - (s.tick - s.phase.startTick)) : 0,
    };
  }

  shopList(): ShopEntry[] {
    const s = this.ctx.s;
    const p = s.playerHeroId !== null ? this.ctx.unit(s.playerHeroId) : undefined;
    if (!p || !p.hero || p.team === 'neutral') return [];
    const base = new Set(baseCatalog(this.ctx, p.team));
    const out: ShopEntry[] = [];
    for (const it of this.content.items) {
      const inBase = base.has(it.id);
      const inKeeper = s.keeper.stock.includes(it.id);
      const owned = p.hero.items.slice();
      const consumed: string[] = [];
      let discount = 0;
      for (const comp of it.from) {
        const i = owned.indexOf(comp);
        if (i >= 0) {
          owned.splice(i, 1);
          consumed.push(comp);
          discount += this.content.itemById.get(comp)?.cost ?? 0;
        }
      }
      const q = quote(this.ctx, p, it.id);
      const canBuy = !('error' in q) && p.hero.gold >= q.price;
      let reason = '';
      if ('error' in q) reason = q.error;
      else if (!canBuy) reason = 'not enough gold';
      out.push({
        id: it.id,
        name: it.name,
        category: it.category,
        tier: it.tier,
        cost: it.cost,
        price: Math.max(0, it.cost - discount),
        consumed,
        source: inBase ? 'base' : inKeeper ? 'keeper' : 'locked',
        canBuy,
        reason,
        desc: it.desc,
      });
    }
    return out;
  }

  unitById(id: number): Unit | undefined {
    return this.ctx.unit(id);
  }
}

void dirtyAll;
void recompute;
