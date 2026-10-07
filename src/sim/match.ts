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
import { tickEvents } from './events';
import { createKeeper } from './keeper';
import { tickObelisks } from './obelisks';
import { enterPrep, endLive } from './phase';
import { tickSpiritTide } from './pressure';
import { aiShop } from './ai/shopping';
import { nextTarget } from './ai/shopping';
import { itemPrice, nearBase, quote } from './shop';
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

const ROLE_SLOTS: Role[] = ['top', 'top', 'bot', 'bot', 'mid'];

function initialState(
  content: Content,
  seed: number,
  withPlayer: boolean | null,
  fixed?: { A: string[]; B: string[] },
  reserved?: string,
): MatchState {
  const rng = seedStreams(seed);
  const aiHeroes: Record<PlayTeam, string[]> = { A: [], B: [] };
  const nA = withPlayer === null ? 5 : 4;
  let pool = content.heroes.filter((h) => h.id !== reserved);
  const take = (): string => {
    if (pool.length === 0) pool = content.heroes.filter((h) => h.id !== reserved);
    const h = pick(rng, 'draft', pool);
    pool = pool.filter((x) => x.id !== h.id);
    return h.id;
  };
  const deferred = withPlayer === true && !fixed && !reserved;
  if (!deferred) {
    for (let i = 0; i < nA; i++) aiHeroes.A.push(take());
    for (let i = 0; i < 5; i++) aiHeroes.B.push(take());
  }
  if (fixed) {
    aiHeroes.A = fixed.A.slice(0, nA);
    aiHeroes.B = fixed.B.slice(0, 5);
  }
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
      unique: !fixed,
      deferred,
    },
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

interface Placed {
  defId: string;
  role: Role;
  isPlayer: boolean;
  jungler: boolean;
}

/**
 * Two heroes hold each side lane and one holds mid. The mid slot goes to an attacker (a roamer) if
 * the team has one; side lanes are paired so a lane gets different dispositions where possible.
 * In a pair the first farmer is the jungler: the partner holds the lane while the farmer clears
 * camps.
 */
function assignRoles(
  ctx: Ctx,
  heroIds: string[],
  fixed: { id: string; role: Role } | null,
): Placed[] {
  const disp = (id: string): string => ctx.c.heroById.get(id)!.disposition;
  const pool = ROLE_SLOTS.slice();
  const lanes: Record<Role, Placed[]> = { top: [], mid: [], bot: [] };
  if (fixed) {
    pool.splice(pool.indexOf(fixed.role), 1);
    lanes[fixed.role].push({ defId: fixed.id, role: fixed.role, isPlayer: true, jungler: false });
  }
  const rest = heroIds.slice();
  const place = (role: Role, i: number): void => {
    const [id] = rest.splice(i, 1);
    pool.splice(pool.indexOf(role), 1);
    lanes[role].push({ defId: id, role, isPlayer: false, jungler: false });
  };
  if (pool.includes('mid')) {
    const i = rest.findIndex((id) => disp(id) === 'attacker');
    place('mid', i >= 0 ? i : 0);
  }
  for (const role of ['top', 'bot'] as Role[]) {
    while (pool.includes(role) && rest.length > 0) {
      const have = new Set(lanes[role].map((p) => disp(p.defId)));
      const i = rest.findIndex((id) => !have.has(disp(id)));
      place(role, i >= 0 ? i : 0);
    }
  }
  for (const role of ['top', 'bot'] as Role[]) {
    const farmer =
      lanes[role].length === 2 ? lanes[role].find((p) => disp(p.defId) === 'farmer') : undefined;
    if (farmer) farmer.jungler = true;
  }
  const out = [...lanes.top, ...lanes.bot, ...lanes.mid];
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
  const roster: Record<PlayTeam, Placed[]> = {
    A: assignRoles(ctx, d.aiHeroes.A, fixed),
    B: assignRoles(ctx, d.aiHeroes.B, null),
  };
  for (const team of ['A', 'B'] as PlayTeam[]) {
    roster[team].forEach((r, slot) => {
      const u = makeHero(ctx, team, slot, r.defId, r.role, r.isPlayer);
      u.hero!.jungler = r.jungler;
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
  tickEvents(ctx);
  tickCampRespawns(ctx);
  const order: PlayTeam[] = Math.floor(s.tick / 20) % 2 === 0 ? ['A', 'B'] : ['B', 'A'];
  for (const team of order) {
    for (const id of s.teams[team].heroIds) {
      const u = ctx.unit(id);
      if (!u || !u.alive) continue;
      if ((s.tick + (u.hero ? u.hero.slot : id) * 3) % 20 === 0) strategicUpdate(ctx, u);
      if (
        u.hero &&
        (!u.hero.isPlayer || u.hero.autoBuy) &&
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
    const state = initialState(
      content,
      config.seed,
      player === null ? null : true,
      config.draft,
      player?.heroId,
    );
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
      suggest:
        (s.playerHeroId !== null ? this.ctx.unit(s.playerHeroId)?.hero?.suggest : undefined) ?? [],
      phaseTicksLeft:
        s.phase.kind === 'live' ? Math.max(0, phaseTicks - (s.tick - s.phase.startTick)) : 0,
      events: s.events.map((e) => {
        const def = this.content.eventById.get(e.defId)!;
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
    };
  }

  shopList(): ShopEntry[] {
    const s = this.ctx.s;
    const p = s.playerHeroId !== null ? this.ctx.unit(s.playerHeroId) : undefined;
    if (!p || !p.hero || p.team === 'neutral') return [];
    const out: ShopEntry[] = [];
    for (const it of this.content.items) {
      const inKeeper = s.keeper.stock.includes(it.id);
      const pr = itemPrice(this.ctx, p, it.id)!;
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
        price: pr.price,
        consumed: pr.consumed,
        source: it.tier <= 2 ? 'base' : inKeeper ? 'keeper' : 'jungle',
        canBuy,
        reason,
        desc: it.desc,
      });
    }
    return out;
  }

  /** Build-list item the player's hero should buy next (for the shop's Recommended tag). */
  recommendedItem(): string | null {
    const id = this.ctx.s.playerHeroId;
    const u = id !== null ? this.ctx.unit(id) : undefined;
    return u ? nextTarget(this.ctx, u) : null;
  }

  unitById(id: number): Unit | undefined {
    return this.ctx.unit(id);
  }
}
