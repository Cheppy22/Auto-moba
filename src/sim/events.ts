import { TPS, dealDamage } from './combat';
import { dist } from './core/math';
import { pick, rand, weightedPick } from './core/rng';
import type { Ctx } from './ctx';
import type { EventDef, EventUnitDef, Stats } from './content/schema';
import { giveGold } from './shop';
import { addMod } from './stats';
import { newUnit } from './units';
import { findPath, lanePoint, laneWaypoints, laneT } from './world/map';
import type { EventInst, LaneId, PlayTeam, Unit } from './types';
import { other } from './types';

/**
 * Timed jungle events (content/events/*.json). Each one is announced (`warning`), then `active`.
 * Everything is cleaned up when the live phase ends. Randomness uses only the `events` stream.
 */

function defOf(ctx: Ctx, ev: EventInst): EventDef {
  return ctx.c.eventById.get(ev.defId)!;
}

export function scheduleEvents(ctx: Ctx): void {
  const cfg = ctx.t.events;
  const n = ctx.s.phase.n;
  const count = cfg.perPhase[Math.min(n - 1, cfg.perPhase.length - 1)] ?? 0;
  const live = Math.round(ctx.t.phaseSeconds * TPS);
  const pool = ctx.c.events.filter((e) => n >= e.fromPhase && n <= e.toPhase);
  const sched: { tick: number; defId: string }[] = [];
  for (let i = 0; i < count && pool.length > 0; i++) {
    const def = weightedPick(ctx.s.rng, 'events', pool, (e) => e.weight);
    pool.splice(pool.indexOf(def), 1);
    const jitter = (rand(ctx.s.rng, 'events') * 2 - 1) * cfg.jitterSec;
    const at = Math.round((cfg.firstSec + i * cfg.gapSec + jitter) * TPS);
    const total = Math.round((def.warnSec + def.durationSec + cfg.endMarginSec) * TPS);
    if (at + total > live) continue;
    sched.push({ tick: ctx.s.tick + at, defId: def.id });
  }
  sched.sort((a, b) => a.tick - b.tick);
  ctx.s.eventSchedule = sched;
}

function slotPos(ctx: Ctx, id: string): { x: number; y: number } {
  const d = ctx.world.map.slots.find((s) => s.id === id)!;
  return { x: d.x, y: d.y };
}

function onAxis(ctx: Ctx, id: string): boolean {
  const p = slotPos(ctx, id);
  return Math.abs(p.x - p.y) < 1.5;
}

function beginWarning(ctx: Ctx, def: EventDef): void {
  const s = ctx.s;
  const open = s.slots.filter((x) => x.open).map((x) => x.id);
  if (open.length === 0) return;
  const busy = new Set(s.events.map((e) => e.slot));
  let slotId: string;
  let x: number;
  let y: number;
  let route: [number, number][] = [];
  let lane: LaneId | null = null;
  let target: PlayTeam | null = null;
  if (def.kind === 'well' || def.kind === 'oni') {
    let cands = open.filter((id) => (def.siteMode === 'neutral' ? onAxis(ctx, id) : true));
    const free = cands.filter((id) => !busy.has(id));
    if (free.length) cands = free;
    if (cands.length === 0) return;
    slotId = pick(s.rng, 'events', cands);
    ({ x, y } = slotPos(ctx, slotId));
  } else if (def.kind === 'procession') {
    const a = pick(s.rng, 'events', open);
    const rest = open.filter((id) => id !== a);
    const b = rest.length ? pick(s.rng, 'events', rest) : a;
    slotId = a;
    const pa = slotPos(ctx, a);
    const pb = slotPos(ctx, b);
    ({ x, y } = pa);
    const openSet = new Set(open);
    route =
      a === b
        ? [
            [pa.x, pa.y],
            [pa.x + 60, pa.y],
            [pa.x + 60, pa.y + 60],
            [pa.x, pa.y + 60],
          ]
        : findPath(ctx.world, pa, pb, openSet);
  } else {
    lane = pick(s.rng, 'events', def.lanes);
    target = pick(s.rng, 'events', ['A', 'B'] as PlayTeam[]);
    const from = other(target);
    const lg = ctx.world.lanes[lane];
    const wps = laneWaypoints(ctx.world, from, lane);
    const startIdx = wps.findIndex((w) => {
      const t = laneT(lg, w[0], w[1]);
      return (from === 'A' ? t : 1 - t) > 0.5 + 0.01;
    });
    const mid = lanePoint(lg, 0.5);
    route = [[mid.x, mid.y], ...wps.slice(Math.max(0, startIdx))];
    x = mid.x;
    y = mid.y;
    // The nearest slot is only a label for the UI.
    let best = open[0];
    let bd = Infinity;
    for (const id of open) {
      const p = slotPos(ctx, id);
      const d = dist(p.x, p.y, x, y);
      if (d < bd) {
        bd = d;
        best = id;
      }
    }
    slotId = best;
  }
  const id = s.nextEventId++;
  const warnEnd = s.tick + Math.round(def.warnSec * TPS);
  const ev: EventInst = {
    id,
    defId: def.id,
    kind: def.kind,
    slot: slotId,
    x,
    y,
    radius: def.radius,
    phase: 'warning',
    warnEndTick: warnEnd,
    endTick: warnEnd + Math.round(def.durationSec * TPS),
    unitIds: [],
    total: 0,
    progress: 0,
    holder: null,
    claim: { A: 0, B: 0 },
    kills: { A: 0, B: 0 },
    route,
    lane,
    target,
    slamNext: 0,
    tele: null,
  };
  s.events.push(ev);
  ctx.emit('eventWarning', {
    id,
    def: def.id,
    kind: def.kind,
    name: def.name,
    slot: slotId,
    x,
    y,
    radius: def.radius,
    inTicks: warnEnd - s.tick,
    lane: lane ?? '',
    target: target ?? '',
  });
}

function unitStats(ctx: Ctx, def: EventDef, ud: EventUnitDef): Stats {
  const g = 1 + def.scalePerPhase * (ctx.s.phase.n - 1);
  return {
    maxHp: ud.hp * g,
    hpRegen: 0,
    armor: ud.armor,
    resist: ud.resist,
    bladeDmg: ud.damage * g,
    atkSpeed: ud.atkSpeed,
    soulPower: ud.damageType === 'soul' ? ud.damage * g : 0,
    moveSpeed: ud.moveSpeed,
    cdr: 0,
    range: ud.range,
    respawnMult: 1,
    incomeMult: 1,
    damageTakenMult: 1,
  };
}

function activate(ctx: Ctx, ev: EventInst, def: EventDef): void {
  ev.phase = 'active';
  if (def.kind === 'procession' || def.kind === 'parade') {
    const r0 = ev.route[0];
    const r1 = ev.route[1] ?? ev.route[0];
    const dx = r1[0] - r0[0];
    const dy = r1[1] - r0[1];
    const l = Math.sqrt(dx * dx + dy * dy) || 1;
    let k = 0;
    for (const ud of def.units) {
      for (let i = 0; i < ud.count; i++, k++) {
        const back = k * (def.kind === 'procession' ? 16 : 12);
        const u = newUnit(
          ctx,
          'minion',
          'neutral',
          ud.id,
          r0[0] - (dx / l) * back,
          r0[1] - (dy / l) * back,
          unitStats(ctx, def, ud),
          ud.damageType,
        );
        u.ev = {
          eventId: ev.id,
          unitDef: ud.id,
          mode: def.kind === 'procession' ? 'passive' : 'march',
          ghost: def.kind === 'procession',
          homeX: r0[0],
          homeY: r0[1],
        };
        u.path = ev.route;
        u.pathI = 1;
        ev.unitIds.push(u.id);
      }
    }
    ev.total = ev.unitIds.length;
  } else if (def.kind === 'oni') {
    const ud = def.units[0];
    const u = newUnit(
      ctx,
      'minion',
      'neutral',
      ud.id,
      ev.x,
      ev.y,
      unitStats(ctx, def, ud),
      ud.damageType,
    );
    u.ev = { eventId: ev.id, unitDef: ud.id, mode: 'boss', ghost: true, homeX: ev.x, homeY: ev.y };
    ev.unitIds.push(u.id);
    ev.total = 1;
    ev.slamNext = ctx.s.tick + Math.round(def.telegraph!.cooldownSec * TPS);
  }
  ctx.emit('eventStart', {
    id: ev.id,
    def: def.id,
    kind: def.kind,
    slot: ev.slot,
    x: ev.x,
    y: ev.y,
  });
}

function aliveUnits(ctx: Ctx, ev: EventInst): Unit[] {
  const out: Unit[] = [];
  for (const id of ev.unitIds) {
    const u = ctx.unit(id);
    if (u && u.alive) out.push(u);
  }
  return out;
}

function rewardTeam(
  ctx: Ctx,
  ev: EventInst,
  def: EventDef,
  team: PlayTeam,
  source: string,
  killer: Unit | null,
): void {
  const st = ctx.s.teams[team];
  let gold = 0;
  for (const id of st.heroIds) {
    const h = ctx.unit(id);
    if (!h) continue;
    const g = def.rewardGoldTeam + (killer && killer.id === h.id ? def.rewardGoldKiller : 0);
    if (g > 0) {
      giveGold(ctx, h, g, `event:${def.id}`);
      gold += g;
    }
  }
  if (def.rewardPoints > 0) {
    st.points += def.rewardPoints;
    ctx.emit('teamPoints', { team, amount: def.rewardPoints, source: `event:${def.id}` });
  }
  let buff = '';
  if (def.buffs.length > 0 && def.buffSec > 0) {
    const exp = ctx.s.tick + Math.round(def.buffSec * TPS);
    for (const id of st.heroIds) {
      const h = ctx.unit(id);
      if (!h || !h.alive) continue;
      for (const b of def.buffs) {
        addMod(ctx, h, {
          id: `event:${def.id}:${b.stat}`,
          stat: b.stat,
          kind: b.kind,
          value: b.value,
          source: `event:${def.id}`,
          tags: [],
          expiresTick: exp,
        });
      }
    }
    buff = def.buffs.map((b) => `${b.stat}:${b.kind}:${b.value}`).join(',');
  }
  ctx.emit('eventReward', {
    id: ev.id,
    def: def.id,
    team,
    gold,
    points: def.rewardPoints,
    buff,
    source,
  });
}

function finish(
  ctx: Ctx,
  ev: EventInst,
  reason: 'cleared' | 'claimed' | 'expired' | 'arrived' | 'phaseEnd',
  winner: PlayTeam | null,
): void {
  for (const u of aliveUnits(ctx, ev)) {
    u.alive = false;
    u.pendingKill = null;
  }
  ctx.s.events = ctx.s.events.filter((e) => e.id !== ev.id);
  ctx.emit('eventEnd', { id: ev.id, def: ev.defId, reason, winner });
}

export function endAllEvents(ctx: Ctx): void {
  for (const ev of ctx.s.events.slice()) finish(ctx, ev, 'phaseEnd', null);
  ctx.s.eventSchedule = [];
}

function endParade(
  ctx: Ctx,
  ev: EventInst,
  def: EventDef,
  reason: 'cleared' | 'expired' | 'arrived',
): void {
  let winner: PlayTeam | null = null;
  const a = ev.kills.A;
  const b = ev.kills.B;
  if (a !== b && Math.max(a, b) >= def.minKills) winner = a > b ? 'A' : 'B';
  if (winner) rewardTeam(ctx, ev, def, winner, 'clear', null);
  finish(ctx, ev, reason, winner);
}

/** Called from killUnit for event units. */
export function onEventUnitDeath(ctx: Ctx, u: Unit, killer: Unit | null): void {
  const st = u.ev!;
  const ev = ctx.s.events.find((e) => e.id === st.eventId);
  if (!ev) return;
  const def = defOf(ctx, ev);
  const ud = def.units.find((x) => x.id === st.unitDef);
  ev.unitIds = ev.unitIds.filter((id) => id !== u.id);
  const hero = killer && killer.hero && killer.team !== 'neutral' ? killer : null;
  const team: PlayTeam | null = hero ? (hero.team as PlayTeam) : null;
  let gold = 0;
  let points = 0;
  if (ud && hero && team) {
    gold = ud.gold;
    if (gold > 0) giveGold(ctx, hero, gold, `event:${def.id}`);
    points = ud.points;
    if (points > 0) {
      ctx.s.teams[team].points += points;
      ctx.emit('teamPoints', { team, amount: points, source: `event:${def.id}` });
    }
    ev.kills[team]++;
  }
  ctx.emit('eventKill', {
    id: ev.id,
    def: def.id,
    unitDef: st.unitDef,
    unit: u.id,
    team: team ?? 'neutral',
    killer: killer ? killer.id : 0,
    gold,
    points,
  });
  if (ev.unitIds.length > 0) return;
  if (def.kind === 'oni') {
    if (team) rewardTeam(ctx, ev, def, team, 'kill', hero);
    finish(ctx, ev, 'cleared', team);
  } else if (def.kind === 'parade') {
    endParade(ctx, ev, def, 'cleared');
  } else {
    finish(ctx, ev, 'cleared', null);
  }
}

function tickWell(ctx: Ctx, ev: EventInst, def: EventDef): void {
  const need = def.holdSec * TPS;
  const present: Record<PlayTeam, number> = { A: 0, B: 0 };
  for (const h of ctx.grid.query(ev.x, ev.y, def.radius)) {
    if (h.alive && h.kind === 'hero' && h.team !== 'neutral') present[h.team]++;
  }
  for (const team of ['A', 'B'] as PlayTeam[]) {
    const foe = other(team);
    if (present[team] > 0 && present[foe] === 0) ev.claim[team] += 5;
    else if (present[team] === 0) ev.claim[team] = Math.max(0, ev.claim[team] - 3);
    if (ev.claim[team] >= need) {
      rewardTeam(ctx, ev, def, team, 'hold', null);
      finish(ctx, ev, 'claimed', team);
      return;
    }
  }
  const lead = ev.claim.A >= ev.claim.B ? 'A' : 'B';
  ev.progress = Math.min(1, ev.claim[lead] / need);
  ev.holder = ev.claim[lead] > 0 ? lead : null;
}

function tickOni(ctx: Ctx, ev: EventInst, def: EventDef): void {
  const boss = aliveUnits(ctx, ev)[0];
  if (!boss) return;
  ev.progress = 1 - Math.max(0, boss.hp / boss.stats.maxHp);
  const tg = def.telegraph!;
  if (ev.tele) {
    if (ctx.s.tick >= ev.tele.endTick) {
      const g = 1 + def.scalePerPhase * (ctx.s.phase.n - 1);
      for (const e of ctx.grid.query(ev.tele.x, ev.tele.y, tg.radius)) {
        if (!e.alive || e.team === 'neutral') continue;
        if (e.kind !== 'hero' && e.kind !== 'minion') continue;
        if (dist(e.x, e.y, ev.tele.x, ev.tele.y) > tg.radius) continue;
        dealDamage(ctx, boss, e, tg.damage * g, tg.damageType, 'oni-slam');
      }
      ev.tele = null;
    }
    return;
  }
  if (ctx.s.tick < ev.slamNext) return;
  const t = boss.targetId !== null ? ctx.unit(boss.targetId) : undefined;
  if (!t || !t.alive || t.team === 'neutral') return;
  ev.tele = { x: t.x, y: t.y, endTick: ctx.s.tick + Math.round(tg.windupSec * TPS) };
  ev.slamNext = ctx.s.tick + Math.round(tg.cooldownSec * TPS);
  ctx.emit('eventTelegraph', {
    id: ev.id,
    x: t.x,
    y: t.y,
    radius: tg.radius,
    ticks: ev.tele.endTick - ctx.s.tick,
  });
}

export function tickEvents(ctx: Ctx): void {
  const s = ctx.s;
  if (s.phase.kind !== 'live') return;
  while (s.eventSchedule.length && s.eventSchedule[0].tick <= s.tick) {
    const e = s.eventSchedule.shift()!;
    const def = ctx.c.eventById.get(e.defId);
    if (def) beginWarning(ctx, def);
  }
  for (const ev of s.events.slice()) {
    const def = defOf(ctx, ev);
    if (ev.phase === 'warning') {
      if (s.tick >= ev.warnEndTick) activate(ctx, ev, def);
      continue;
    }
    if (s.tick >= ev.endTick) {
      if (def.kind === 'parade') endParade(ctx, ev, def, 'expired');
      else finish(ctx, ev, 'expired', null);
      continue;
    }
    if (def.kind === 'well') {
      if (s.tick % 5 === 0) tickWell(ctx, ev, def);
    } else if (def.kind === 'oni') {
      tickOni(ctx, ev, def);
    } else if (s.tick % 5 === 0) {
      const alive = aliveUnits(ctx, ev);
      if (alive.length === 0) continue;
      let sx = 0;
      let sy = 0;
      let best = 0;
      const end = ev.route[ev.route.length - 1];
      let nearEnd = Infinity;
      for (const u of alive) {
        sx += u.x;
        sy += u.y;
        nearEnd = Math.min(nearEnd, dist(u.x, u.y, end[0], end[1]));
        best = Math.max(best, u.pathI);
      }
      ev.x = sx / alive.length;
      ev.y = sy / alive.length;
      if (def.kind === 'procession') {
        ev.progress = Math.min(1, best / Math.max(1, ev.route.length - 1));
        if (nearEnd <= ctx.t.movement.arriveDist + 4) finish(ctx, ev, 'arrived', null);
      } else {
        ev.progress = 1 - alive.length / Math.max(1, ev.total);
      }
    }
  }
}
