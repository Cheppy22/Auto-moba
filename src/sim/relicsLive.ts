import { committed, frozen } from './bell';
import { TPS, healUnit, inCombat } from './combat';
import { relicEffect } from './content/loader';
import type { RelicEffect, SealedTrigger } from './content/schema';
import { dist } from './core/math';
import type { Ctx } from './ctx';
import { hpPct } from './ctx';
import { laneAt } from './feedback';
import { addTempo, playSealed, setOrder, syncHands } from './gambits';
import { fieldPawn, pawnCap, pawnsAlive } from './pawns';
import { actStartTempo, cardCost, param, pawnCost, tempoCap, workingRelic } from './relics';
import { addMod } from './stats';
import { LANES, lanePoint } from './world/map';
import type { LaneId, Modifier, PawnQuota, PlayTeam, RelicRun, SnapZone, Unit } from './types';
import { other } from './types';

const TEAMS: PlayTeam[] = ['A', 'B'];

export const freshRelicRun = (): RelicRun => ({
  sealed: {
    A: { fired: false, since: null, skip: [] },
    B: { fired: false, since: null, skip: [] },
  },
  enemyDown: { A: false, B: false },
  sortied: { A: [], B: [] },
  banner: { A: null, B: null },
  wall: {},
});

const pieces = (ctx: Ctx, team: PlayTeam): Unit[] => {
  const out: Unit[] = [];
  for (const id of ctx.s.teams[team].heroIds) {
    const u = ctx.unit(id);
    if (u?.alive) out.push(u);
  }
  return out;
};

const ownTowers = (ctx: Ctx, team: PlayTeam): Unit[] => {
  const out: Unit[] = [];
  for (const lane of LANES) for (const t of ctx.towers[team][lane]) if (t?.alive) out.push(t);
  return out;
};

/** Keeps a relic's modifier on a unit; it lapses on its own a moment after the condition ends. */
function hold(
  ctx: Ctx,
  u: Unit,
  id: string,
  stat: Modifier['stat'],
  kind: Modifier['kind'],
  value: number,
  ttl: number,
): void {
  const have = u.mods.find((m) => m.id === id);
  if (
    have &&
    have.value === value &&
    have.expiresTick !== null &&
    have.expiresTick - ctx.s.tick > ttl / 2
  )
    return;
  addMod(ctx, u, {
    id,
    stat,
    kind,
    value,
    source: id,
    tags: [],
    expiresTick: ctx.s.tick + ttl,
  });
}

/** Everything the live relics set up when an Act starts. */
export function onActStart(ctx: Ctx): void {
  const run = ctx.s.relics.run;
  for (const team of TEAMS) {
    const bonus = actStartTempo(ctx, team);
    ctx.s.tempo[team] = Math.min(ctx.s.tempo[team], tempoCap(ctx, team));
    if (bonus > 0) addTempo(ctx, team, bonus);
    syncHands(ctx, team);
    const sealed = workingRelic(ctx, team, 'sealed_move');
    const below = sealed ? param(sealed, 'bastionBelow', 0.5) : 0.5;
    run.sealed[team] = {
      fired: false,
      since: null,
      skip: ownTowers(ctx, team)
        .filter((t) => hpPct(t) < below)
        .map((t) => t.id),
    };
    run.enemyDown[team] = false;
    const square = workingRelic(ctx, team, 'strong_square');
    const lane = square?.held.lane;
    if (lane) {
      const mid = lanePoint(ctx.world.lanes[lane], 0.5);
      run.banner[team] = { x: mid.x, y: mid.y, toppled: false, alone: 0 };
    } else run.banner[team] = null;
  }
}

/** A piece fell: the other side's Sealed Move may be waiting for it. */
export function onPieceDown(ctx: Ctx, victim: Unit): void {
  if (victim.team === 'A' || victim.team === 'B')
    ctx.s.relics.run.enemyDown[other(victim.team)] = true;
}

/** Knight's Tour: a camp the Knight clears pays Tempo. */
export function onCampCleared(ctx: Ctx, hero: Unit | null): void {
  if (!hero || hero.hero?.defId !== 'knight' || (hero.team !== 'A' && hero.team !== 'B')) return;
  const h = workingRelic(ctx, hero.team, 'knights_tour');
  if (h) addTempo(ctx, hero.team, param(h, 'tempo', 4));
}

// ---------------------------------------------------------------- every 5 ticks

function guards(ctx: Ctx, team: PlayTeam): void {
  const g = workingRelic(ctx, team, 'guarded_piece');
  const u = g && g.held.piece !== null ? ctx.unit(g.held.piece) : undefined;
  if (!g || !u?.alive) return;
  const r = param(g, 'radius', 300);
  const near = pieces(ctx, team).some((v) => v !== u && dist(u.x, u.y, v.x, v.y) <= r);
  if (near) hold(ctx, u, 'relic:guarded', 'damageTakenMult', 'mul', param(g, 'takenMul', 0.88), 12);
}

function ransom(ctx: Ctx, team: PlayTeam): void {
  const r = workingRelic(ctx, team, 'kings_ransom');
  if (!r || !ctx.s.check[team]) return;
  for (const u of pieces(ctx, team))
    if (u.hero!.defId !== 'king')
      hold(ctx, u, 'relic:ransom', 'damageTakenMult', 'mul', param(r, 'takenMul', 0.9), 12);
}

function tour(ctx: Ctx, team: PlayTeam): void {
  const r = workingRelic(ctx, team, 'knights_tour');
  if (!r) return;
  for (const u of pieces(ctx, team))
    if (u.hero!.defId === 'knight' && !inCombat(ctx.s.tick, u))
      hold(ctx, u, 'relic:tour', 'moveSpeed', 'mul', param(r, 'speedMul', 1.15), 12);
}

function banner(ctx: Ctx, team: PlayTeam): void {
  const sq = workingRelic(ctx, team, 'strong_square');
  const b = ctx.s.relics.run.banner[team];
  if (!sq || !b || b.toppled) return;
  const r = param(sq, 'radius', 160) * ctx.world.k;
  let foes = 0;
  let guards = 0;
  for (const u of ctx.grid.query(b.x, b.y, r)) {
    if (!u.alive || dist(u.x, u.y, b.x, b.y) > r) continue;
    if (u.team === team && (u.hero || (u.kind === 'minion' && !u.ev))) {
      hold(ctx, u, 'relic:banner:a', 'armor', 'add', param(sq, 'armor', 10), 12);
      hold(ctx, u, 'relic:banner:r', 'resist', 'add', param(sq, 'resist', 10), 12);
      if (u.hero) guards++;
    } else if (u.team === other(team) && u.hero) foes++;
  }
  b.alone = foes === 1 && guards === 0 ? b.alone + 5 : 0;
  if (b.alone >= param(sq, 'toppleSec', 5) * TPS) {
    b.toppled = true;
    const lane = sq.held.lane;
    if (lane) ctx.emit('relicTriggered', { team, relic: sq.def.id, lane });
  }
}

// ---------------------------------------------------------------- every 10 ticks

function chain(ctx: Ctx, team: PlayTeam): void {
  const c = workingRelic(ctx, team, 'pawn_chain');
  if (!c) return;
  const pawns: Unit[] = [];
  for (const u of ctx.s.units) if (u.alive && u.pawn && u.team === team) pawns.push(u);
  const r = param(c, 'radius', 150);
  for (const u of pawns) {
    let n = 0;
    for (const v of pawns) if (v !== u && dist(u.x, u.y, v.x, v.y) <= r) n++;
    const bonus = Math.min(param(c, 'max', 0.12), n * param(c, 'perPawn', 0.04));
    if (bonus <= 0) continue;
    hold(ctx, u, 'relic:chain:d', 'bladeDmg', 'mul', 1 + bonus, 24);
    hold(ctx, u, 'relic:chain:a', 'armor', 'mul', 1 + bonus, 24);
  }
}

function curtain(ctx: Ctx, team: PlayTeam): void {
  const w = workingRelic(ctx, team, 'curtain_wall');
  if (!w) return;
  const wall = ctx.s.relics.run.wall;
  const r = param(w, 'radius', 300) * ctx.world.k;
  for (const lane of LANES) {
    const t = ctx.towers[team][lane][0];
    if (!t?.alive) continue;
    const near = ctx.grid
      .query(t.x, t.y, r)
      .some(
        (u) =>
          u.alive &&
          u.team === other(team) &&
          (u.hero || (u.kind === 'minion' && !u.ev)) &&
          dist(u.x, u.y, t.x, t.y) <= r,
      );
    if (near) wall[t.id] = ctx.s.tick;
    else if (
      t.hp < t.stats.maxHp &&
      ctx.s.tick - (wall[t.id] ?? -TPS * 99) >= param(w, 'quietSec', 5) * TPS
    )
      healUnit(
        ctx,
        null,
        t,
        t.stats.maxHp * param(w, 'regen', 0.005) * 0.5,
        'relic:curtain',
        false,
      );
  }
}

/**
 * Fields one pawn toward a lane quota: the lane with the biggest gap, once Tempo is above the
 * reserve. Shared by Pawn Structure and the standing pawn plan (`pawnPlan.ts`).
 */
export function fieldTowardQuota(
  ctx: Ctx,
  team: PlayTeam,
  quota: PawnQuota,
  reserve: number,
  discount: number,
): void {
  const have: Record<LaneId, number> = { top: 0, mid: 0, bot: 0 };
  for (const u of ctx.s.units) if (u.alive && u.pawn && u.team === team && u.lane) have[u.lane]++;
  let lane: LaneId | null = null;
  let most = 0;
  for (const l of LANES) {
    const gap = quota[l] - have[l];
    if (gap > most) {
      most = gap;
      lane = l;
    }
  }
  if (!lane || pawnsAlive(ctx, team) >= pawnCap(ctx, team)) return;
  const cost = Math.max(0, pawnCost(ctx, team) - discount);
  if (ctx.s.tempo[team] >= cost + reserve) fieldPawn(ctx, team, lane, discount);
}

function structure(ctx: Ctx, team: PlayTeam): void {
  const ps = workingRelic(ctx, team, 'pawn_structure');
  const quota = ps?.held.quota;
  if (!ps || !quota || committed(ctx)) return;
  fieldTowardQuota(ctx, team, quota, ps.held.reserve ?? 0, param(ps, 'discount', 2));
}

// ---------------------------------------------------------------- every second

function tripped(ctx: Ctx, team: PlayTeam, trigger: SealedTrigger, skip: number[]): boolean {
  const sealed = workingRelic(ctx, team, 'sealed_move')!;
  switch (trigger) {
    case 'bastion':
      return ownTowers(ctx, team).some(
        (t) => !skip.includes(t.id) && hpPct(t) < param(sealed, 'bastionBelow', 0.5),
      );
    case 'kill':
      return ctx.s.relics.run.enemyDown[team];
    case 'guarded': {
      const below = param(sealed, 'guardedBelow', 0.4);
      return ctx.s.relics.held[team].some((h) => {
        const def = ctx.c.relicById.get(h.id);
        const e: RelicEffect | null = def ? relicEffect(def) : null;
        if (h.piece === null || (e !== 'crown_jewel' && e !== 'guarded_piece')) return false;
        const u = ctx.unit(h.piece);
        return !!u?.alive && hpPct(u) < below;
      });
    }
    case 'lane3': {
      const count: Record<LaneId, number> = { top: 0, mid: 0, bot: 0 };
      for (const e of pieces(ctx, other(team))) {
        const lane = laneAt(ctx, e.x, e.y, ctx.t.feedback.fight.laneRadius);
        if (lane) count[lane]++;
      }
      return LANES.some((l) => count[l] >= param(sealed, 'stack', 3));
    }
    case 'clock':
      return ctx.s.tick - ctx.s.phase.startTick >= param(sealed, 'clockSec', 120) * TPS;
  }
}

function sealedMove(ctx: Ctx, team: PlayTeam): void {
  const sm = workingRelic(ctx, team, 'sealed_move');
  const state = ctx.s.relics.run.sealed[team];
  const card = sm?.held.card ? ctx.c.gambitById.get(sm.held.card) : undefined;
  const trigger = sm?.held.trigger;
  if (!sm || !card || !trigger || state.fired) return;
  if (state.since === null) {
    if (!tripped(ctx, team, trigger, state.skip)) return;
    state.since = ctx.s.tick;
  }
  const cost = Math.max(0, cardCost(ctx, team, card) - param(sm, 'discount', 10));
  if (playSealed(ctx, team, card, cost)) {
    state.fired = true;
    ctx.emit('sealedMove', { team, card: card.id, trigger, outcome: 'fired' });
  } else if (ctx.s.tick - state.since >= param(sm, 'lapseSec', 5) * TPS) {
    state.fired = true;
    ctx.emit('sealedMove', { team, card: card.id, trigger, outcome: 'lapsed' });
  }
}

function sortie(ctx: Ctx, team: PlayTeam): void {
  const s = workingRelic(ctx, team, 'sortie');
  if (!s) return;
  const done = ctx.s.relics.run.sortied[team];
  for (const tower of ownTowers(ctx, team)) {
    if (done.includes(tower.id) || hpPct(tower) >= param(s, 'below', 0.5)) continue;
    done.push(tower.id);
    const lane = tower.tower!.lane;
    let rotator: Unit | null = null;
    let best = Infinity;
    for (const u of pieces(ctx, team)) {
      if (u.hero!.lane === lane) continue;
      const d = dist(u.x, u.y, tower.x, tower.y);
      if (d < best) {
        best = d;
        rotator = u;
      }
    }
    const defend = Math.round(param(s, 'defendSec', 20) * TPS);
    if (rotator)
      setOrder(ctx, rotator, {
        kind: 'defend',
        lane,
        x: rotator.x,
        y: rotator.y,
        targetId: null,
        untilTick: ctx.s.tick + defend,
      });
    const buff = Math.round(param(s, 'buffSec', 12) * TPS);
    for (const u of pieces(ctx, team)) {
      if (u.hero!.lane !== lane && u !== rotator) continue;
      for (const stat of ['bladeDmg', 'soulPower'] as const)
        addMod(ctx, u, {
          id: `relic:sortie:${stat}`,
          stat,
          kind: 'mul',
          value: param(s, 'damageMul', 1.15),
          source: 'relic:sortie',
          tags: [],
          expiresTick: ctx.s.tick + buff,
        });
    }
    ctx.emit('relicTriggered', { team, relic: s.def.id, lane });
  }
}

/** The live part of the relics: auras that follow conditions, auto pawns, Sealed Move, Sortie. */
export function tickRelics(ctx: Ctx): void {
  const s = ctx.s;
  if (s.phase.kind !== 'live' || frozen(ctx)) return;
  for (const team of TEAMS) {
    if (s.relics.held[team].length === 0) continue;
    const t = s.tick + (team === 'A' ? 0 : 2);
    if (t % 5 === 0) {
      guards(ctx, team);
      ransom(ctx, team);
      tour(ctx, team);
      banner(ctx, team);
    }
    if (t % 10 === 0) {
      chain(ctx, team);
      curtain(ctx, team);
      structure(ctx, team);
    }
    if (t % TPS === 0) {
      sealedMove(ctx, team);
      sortie(ctx, team);
    }
  }
}

/** Strong Square's standing banners, drawn like an Outpost's aura. */
export function bannerZones(ctx: Ctx, endTick: number): SnapZone[] {
  const out: SnapZone[] = [];
  const radius = (ctx.c.relicById.get('strong_square')?.params.radius ?? 160) * ctx.world.k;
  for (const team of TEAMS) {
    const b = ctx.s.relics.run.banner[team];
    if (b && !b.toppled && workingRelic(ctx, team, 'strong_square'))
      out.push({
        kind: 'outpost',
        team,
        x: b.x,
        y: b.y,
        radius,
        ticksLeft: Math.max(0, endTick - ctx.s.tick),
      });
  }
  return out;
}
