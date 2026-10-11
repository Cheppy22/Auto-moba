import { inCombat, TPS } from './combat';
import { clamp, dist } from './core/math';
import type { Ctx } from './ctx';
import { LANES, laneDist, nearestBy } from './world/map';
import type {
  DeathCause,
  Fall,
  FeedbackState,
  FightRecord,
  FightZone,
  LaneId,
  LaneNow,
  OpenFight,
  PieceId,
  PlayTeam,
  Unit,
} from './types';
import { other } from './types';
import { PLAY_TEAMS } from './names';

const HIT_MERGE_TICKS = 4;
const HIT_CAP = 64;

export const freshFeedback = (): FeedbackState => ({
  fights: [],
  nextFight: 1,
  laneKills: [],
  runs: [],
  nextRun: 1,
});

const pair = (): Record<PlayTeam, number> => ({ A: 0, B: 0 });

/** The lane whose centre line passes within `maxOff` of the point, or null. */
export function laneAt(ctx: Ctx, x: number, y: number, maxOff: number): LaneId | null {
  return nearestBy(LANES, (lane) => laneDist(ctx.world.lanes[lane], x, y), maxOff, true);
}

function zoneAt(ctx: Ctx, x: number, y: number): FightZone {
  const f = ctx.t.feedback.fight;
  for (const team of PLAY_TEAMS) {
    const b = ctx.world.basePos[team];
    if (dist(x, y, b.x, b.y) <= f.baseRadius) return team === 'A' ? 'baseA' : 'baseB';
  }
  return laneAt(ctx, x, y, f.laneRadius) ?? 'jungle';
}

// ------------------------------------------------------------------ read-outs for the HUD

/** Goals that mean "going to (or holding) a lane". */
const LANE_GOALS: readonly string[] = ['farmLane', 'pushTower', 'defendTower', 'joinFight'];

/**
 * True when the piece dealt damage to, or took damage from, an enemy piece in the last 1.5 s.
 * Pawnlings, pawns, camps and structures do not count (unlike `inCombat`). Read-only.
 */
export function inDuel(ctx: Ctx, u: Unit): boolean {
  const h = u.hero;
  if (!h || !u.alive) return false;
  const tick = ctx.s.tick;
  const window = Math.round(1.5 * TPS); // same window as `inCombat`
  if (h.attackers.some((a) => tick - a.tick <= window)) return true;
  for (const id of ctx.s.teams[other(u.team as PlayTeam)].heroIds) {
    const e = ctx.unit(id)?.hero;
    if (e?.attackers.some((a) => a.id === u.id && tick - a.tick <= window)) return true;
  }
  return false;
}

/**
 * Where a piece is for its tile's lane tag: its base when it sits at home or is recalling or
 * headed there; the lane it stands in; in the jungle, the lane it is heading to if its goal is a
 * lane job, else the jungle. Read-only, from position and goal.
 */
export function laneNow(ctx: Ctx, u: Unit): LaneNow {
  const h = u.hero!;
  const zone = zoneAt(ctx, u.x, u.y);
  if (zone === 'baseA' || zone === 'baseB') return 'base';
  if (h.recall || h.goal?.kind === 'recall' || h.goal?.kind === 'base') return 'base';
  if (zone !== 'jungle') return zone;
  if (h.goal && LANE_GOALS.includes(h.goal.kind))
    return laneAt(ctx, h.goal.x, h.goal.y, ctx.t.feedback.fight.laneRadius) ?? 'jungle';
  return 'jungle';
}

// ------------------------------------------------------------------ damage history

/** Called for every point of damage dealt to anything: keeps a piece's recent hits and fight damage. */
export function trackDamage(ctx: Ctx, src: Unit | null, tgt: Unit, amount: number): void {
  const h = tgt.hero;
  if (h) {
    const tick = ctx.s.tick;
    const id = src ? src.id : 0;
    let merged = false;
    for (let i = h.hits.length - 1; i >= 0 && tick - h.hits[i].tick < HIT_MERGE_TICKS; i--) {
      if (h.hits[i].src === id) {
        h.hits[i].amount += amount;
        merged = true;
        break;
      }
    }
    if (!merged) {
      h.hits.push({ tick, src: id, kind: src ? src.kind : 'camp', amount });
      const keep = tick - ctx.t.feedback.death.windowSec * TPS;
      let drop = 0;
      while (drop < h.hits.length && h.hits[drop].tick < keep) drop++;
      if (drop > 0 || h.hits.length > HIT_CAP)
        h.hits.splice(0, Math.max(drop, h.hits.length - HIT_CAP));
    }
  } else if ((tgt.kind === 'tower' || tgt.kind === 'guardian') && tgt.team !== 'neutral') {
    const f = nearestFight(ctx, tgt.x, tgt.y, true);
    if (f) f.bastion[tgt.team] += amount;
  }
}

// ------------------------------------------------------------------ why a piece fell

/** Reads the last few seconds of damage and the pieces around the victim into one cause. */
export function classifyFall(ctx: Ctx, victim: Unit, killer: Unit | null): Fall {
  const cfg = ctx.t.feedback.death;
  const h = victim.hero!;
  const tick = ctx.s.tick;
  const hits = h.hits.filter((x) => tick - x.tick <= cfg.windowSec * TPS);
  const burstTicks = cfg.burstSec * TPS;
  let burst = 0;
  let from = 0;
  let run = 0;
  for (let i = 0; i < hits.length; i++) {
    run += hits[i].amount;
    while (hits[i].tick - hits[from].tick > burstTicks) run -= hits[from++].amount;
    if (run > burst) burst = run;
  }
  const byPiece = new Map<number, number>();
  for (const x of hits)
    if (x.kind === 'hero') byPiece.set(x.src, (byPiece.get(x.src) ?? 0) + x.amount);
  const by: PieceId[] = [...byPiece.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .flatMap(([id]) => {
      const d = ctx.unit(id)?.hero?.defId;
      return d ? [d] : [];
    });
  const team = victim.team as PlayTeam;
  const foe = other(team);
  let allies = 1;
  let foes = 0;
  let backed = false;
  let lone = true;
  for (const id of ctx.s.teams[team].heroIds) {
    const a = ctx.unit(id);
    if (!a || !a.alive || a === victim) continue;
    const d = dist(a.x, a.y, victim.x, victim.y);
    if (d <= cfg.nearRadius) {
      allies++;
      backed = true;
    }
    if (d <= cfg.isolatedRadius) lone = false;
  }
  for (const id of ctx.s.teams[foe].heroIds) {
    const e = ctx.unit(id);
    if (e?.alive && dist(e.x, e.y, victim.x, victim.y) <= cfg.nearRadius) foes++;
  }
  if (lone) {
    for (const st of [
      ...ctx.towers[team].top,
      ...ctx.towers[team].mid,
      ...ctx.towers[team].bot,
      ctx.guardians[team],
    ]) {
      if (st?.alive && dist(st.x, st.y, victim.x, victim.y) <= cfg.isolatedRadius) {
        lone = false;
        break;
      }
    }
  }
  let offLane = false;
  if (!backed && h.lane) {
    offLane = laneDist(ctx.world.lanes[h.lane], victim.x, victim.y) > cfg.laneOffMax;
  }
  let cause: DeathCause;
  if (burst >= cfg.burstFrac * victim.stats.maxHp) cause = 'burst';
  else if (byPiece.size >= cfg.focusAttackers) cause = 'focus';
  else if (lone || offLane) cause = 'outOfPosition';
  else if (foes > allies) cause = 'outnumbered';
  else cause = 'traded';
  return {
    cause,
    killer: killer?.hero ? killer.hero.defId : null,
    killerKind: killer ? killer.kind : 'none',
    by,
    tick,
  };
}

// ------------------------------------------------------------------ fights

/** The open fight nearest a point and within the fight radius (half as far again when `wide`). */
function nearestFight(ctx: Ctx, x: number, y: number, wide: boolean): OpenFight | null {
  const fights = ctx.s.feedback.fights;
  if (fights.length === 0) return null;
  const reach = ctx.t.feedback.fight.radius * (wide ? 1.5 : 1);
  let best: OpenFight | null = null;
  let bestD = reach;
  for (const f of fights) {
    const d = dist(x, y, f.x, f.y);
    if (d <= bestD) {
      bestD = d;
      best = f;
    }
  }
  return best;
}

function record(ctx: Ctx, f: OpenFight): FightRecord {
  const x = f.n > 0 ? f.sx / f.n : f.x;
  const y = f.n > 0 ? f.sy / f.n : f.y;
  const kinds = (ids: number[]): PieceId[] =>
    ids.flatMap((id) => {
      const d = ctx.unit(id)?.hero?.defId;
      return d ? [d] : [];
    });
  return {
    id: f.id,
    zone: zoneAt(ctx, x, y),
    x: Math.round(x),
    y: Math.round(y),
    startTick: f.startTick,
    endTick: f.lastTick,
    pieces: { A: kinds(f.pieces.A), B: kinds(f.pieces.B) },
    lost: { ...f.lost },
    pawnlings: { ...f.pawnlings },
    pawns: { ...f.pawns },
    bastion: { A: Math.round(f.bastion.A), B: Math.round(f.bastion.B) },
  };
}

function closeFight(ctx: Ctx, f: OpenFight): void {
  ctx.emit('fightEnd', record(ctx, f));
}

/** Closes every fight now (the Act ends, or the match does). */
export function flushFights(ctx: Ctx): void {
  const fb = ctx.s.feedback;
  for (const f of fb.fights) closeFight(ctx, f);
  fb.fights = [];
}

/**
 * Once a tick, after the units have fought: clusters the pieces in combat; a cluster holding both
 * sides is a fight (new, or the open one nearby). A fight closes when no cluster has fed it for
 * `fight.endSec` (the 1.5 s combat timer runs first, so about 3 s after the last blow).
 */
export function tickFights(ctx: Ctx): void {
  const fb = ctx.s.feedback;
  const tick = ctx.s.tick;
  const cfg = ctx.t.feedback.fight;
  const live: Unit[] = [];
  for (const team of PLAY_TEAMS) {
    for (const id of ctx.s.teams[team].heroIds) {
      const u = ctx.unit(id);
      if (u?.alive && inCombat(tick, u)) live.push(u);
    }
  }
  const seen = new Array<boolean>(live.length).fill(false);
  for (let i = 0; i < live.length; i++) {
    if (seen[i]) continue;
    const cluster = [live[i]];
    seen[i] = true;
    for (let c = 0; c < cluster.length; c++) {
      for (let k = 0; k < live.length; k++) {
        if (!seen[k] && dist(cluster[c].x, cluster[c].y, live[k].x, live[k].y) <= cfg.radius) {
          seen[k] = true;
          cluster.push(live[k]);
        }
      }
    }
    if (!cluster.some((u) => u.team === 'A') || !cluster.some((u) => u.team === 'B')) continue;
    let cx = 0;
    let cy = 0;
    for (const u of cluster) {
      cx += u.x;
      cy += u.y;
    }
    cx /= cluster.length;
    cy /= cluster.length;
    let f = nearestFight(ctx, cx, cy, false);
    if (!f) {
      f = {
        id: fb.nextFight++,
        startTick: tick,
        lastTick: tick,
        x: cx,
        y: cy,
        sx: 0,
        sy: 0,
        n: 0,
        pieces: { A: [], B: [] },
        lost: pair(),
        pawnlings: pair(),
        pawns: pair(),
        bastion: pair(),
      };
      fb.fights.push(f);
    }
    f.lastTick = tick;
    f.x = cx;
    f.y = cy;
    f.sx += cx;
    f.sy += cy;
    f.n++;
    for (const u of cluster) {
      const list = f.pieces[u.team as PlayTeam];
      if (!list.includes(u.id)) list.push(u.id);
    }
  }
  if (fb.fights.length === 0) return;
  const end = Math.round(cfg.endSec * TPS);
  const open: OpenFight[] = [];
  for (const f of fb.fights) {
    if (tick - f.lastTick >= end) closeFight(ctx, f);
    else open.push(f);
  }
  fb.fights = open;
}

/** A piece died: it counts against its side in the fight it fell in, and in the lane's kill ledger. */
export function noteFall(ctx: Ctx, victim: Unit): void {
  const team = victim.team as PlayTeam;
  const fb = ctx.s.feedback;
  const f = nearestFight(ctx, victim.x, victim.y, true);
  if (f) {
    f.lost[team]++;
    if (!f.pieces[team].includes(victim.id)) f.pieces[team].push(victim.id);
  }
  const lane = laneAt(ctx, victim.x, victim.y, ctx.t.feedback.fight.laneRadius);
  if (lane) {
    const keep = ctx.s.tick - ctx.t.feedback.momentum.killWindowSec * TPS;
    fb.laneKills = fb.laneKills.filter((k) => k.tick >= keep);
    fb.laneKills.push({ tick: ctx.s.tick, lane, team: other(team) });
  }
}

/** A pawnling or an elite pawn died next to an open fight. */
export function noteMinionLoss(ctx: Ctx, u: Unit): void {
  if (u.team === 'neutral' || ctx.s.feedback.fights.length === 0) return;
  const f = nearestFight(ctx, u.x, u.y, true);
  if (!f) return;
  if (u.pawn) f.pawns[u.team]++;
  else f.pawnlings[u.team]++;
}

// ------------------------------------------------------------------ lane momentum

/**
 * Who is pushing each lane, -1 (Black) to 1 (White): where the pawnling fronts meet, how much
 * Bastion health each side has left, and the piece kills of the last half minute.
 */
export function laneMomentum(ctx: Ctx): Record<LaneId, number> {
  const cfg = ctx.t.feedback.momentum;
  const w = cfg.weights;
  const total = w.front + w.structures + w.kills || 1;
  const keep = ctx.s.tick - cfg.killWindowSec * TPS;
  const out: Record<LaneId, number> = { top: 0, mid: 0, bot: 0 };
  for (const lane of LANES) {
    const clash = (ctx.front.A[lane] + (1 - ctx.front.B[lane])) / 2;
    const front = clamp((clash - 0.5) / cfg.frontSpan, -1, 1);
    const left = (team: PlayTeam): number => {
      let hp = 0;
      let max = 0;
      for (const t of ctx.towers[team][lane]) {
        if (!t) continue;
        max += t.stats.maxHp;
        if (t.alive) hp += t.hp;
      }
      return max > 0 ? hp / max : 1;
    };
    const structures = clamp(left('A') - left('B'), -1, 1);
    let net = 0;
    for (const k of ctx.s.feedback.laneKills) {
      if (k.lane !== lane || k.tick < keep) continue;
      net += k.team === 'A' ? 1 : -1;
    }
    const kills = clamp(net / cfg.killsFull, -1, 1);
    out[lane] = clamp(
      (w.front * front + w.structures * structures + w.kills * kills) / total,
      -1,
      1,
    );
  }
  return out;
}
