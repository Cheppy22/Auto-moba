import type { Ctx } from './ctx';
import type { DamageType, Disposition, LaneId, Posture, Stats } from './content/schema';
import { laneWaypoints } from './world/map';
import { recompute } from './stats';
import type { HeroState, PlayTeam, SetupEntry, Unit, UnitKind, TeamId } from './types';

export const DISPOSITION_POSTURE: Record<Disposition, Posture> = {
  farmer: 'farm',
  attacker: 'push',
  defender: 'defend',
};

export function newUnit(
  ctx: Ctx,
  kind: UnitKind,
  team: TeamId,
  defId: string,
  x: number,
  y: number,
  base: Stats,
  atkType: DamageType = 'blade',
): Unit {
  const u: Unit = {
    id: ctx.s.nextId++,
    kind,
    team,
    defId,
    x,
    y,
    px: x,
    py: y,
    hp: base.maxHp,
    alive: true,
    base,
    stats: { ...base },
    mods: [],
    shields: [],
    dots: [],
    dirty: true,
    atkCd: 0,
    targetId: null,
    atkType,
    atkRange: base.range,
    path: [],
    pathI: 0,
    lane: null,
    pendingKill: null,
    bounty: 0,
    lastDamagedTick: -9999,
    detour: null,
  };
  ctx.s.units.push(u);
  ctx.idx.set(u.id, u);
  recompute(ctx, u);
  u.hp = u.stats.maxHp;
  return u;
}

export function makeHero(ctx: Ctx, team: PlayTeam, slot: number, entry: SetupEntry): Unit {
  const def = ctx.c.pieceById.get(entry.piece)!;
  const defId = entry.piece;
  const role = entry.lane;
  const base = ctx.world.basePos[team];
  const dir = team === 'A' ? 1 : -1;
  const ox = dir * (14 + slot * 7);
  const oy = -dir * (14 + (slot % 2) * 9);
  const u = newUnit(ctx, 'hero', team, defId, base.x + ox, base.y + oy, { ...def.stats });
  u.atkRange = def.stats.range;
  u.lane = role;
  const hero: HeroState = {
    defId,
    style: entry.style,
    path: entry.path,
    rank: 1,
    perks: [],
    order: null,
    structMul: null,
    slot,
    role,
    lane: u.lane,
    posture: DISPOSITION_POSTURE[def.disposition],
    disposition: def.disposition,
    jungler: false,
    items: [],
    flaws: {},
    gold: ctx.t.startingGold,
    goldEarned: 0,
    kills: 0,
    deaths: 0,
    assists: 0,
    streak: 0,
    respawnAt: null,
    cd: [0, 0, 0, 0],
    recall: null,
    goal: null,
    goalSetTick: -999,
    lastDamagedTick: -9999,
    lastDealtTick: -9999,
    trigCd: {},
    revived: false,
    attackers: [],
    distance: 0,
    engage: 'fight',
    engageTick: 0,
    holdTicks: 0,
    lastRecallTick: -9999,
    lossStreak: 0,
    lastDeathTick: -9999,
    lastStandUsed: false,
  };
  u.hero = hero;
  ctx.s.teams[team].heroIds.push(u.id);
  recompute(ctx, u);
  u.hp = u.stats.maxHp;
  return u;
}

export function makeMinion(
  ctx: Ctx,
  team: PlayTeam,
  lane: LaneId,
  type: 'melee' | 'ranged',
  scale: number,
  offset: number,
): Unit {
  const m = ctx.t.minions[type];
  const base = ctx.world.basePos[team];
  const stats: Stats = {
    maxHp: m.hp * scale,
    hpRegen: 0,
    armor: m.armor,
    resist: m.resist,
    bladeDmg: m.damage * scale,
    atkSpeed: m.atkSpeed,
    soulPower: 0,
    moveSpeed: m.moveSpeed,
    cdr: 0,
    range: m.range,
    respawnMult: 1,
    incomeMult: 1,
    damageTakenMult: 1,
  };
  const u = newUnit(ctx, 'minion', team, type, base.x, base.y, stats, m.damageType);
  u.lane = lane;
  u.bounty = m.gold;
  const path = laneWaypoints(ctx.world, team, lane);
  u.path = path;
  u.pathI = 1;
  const p0 = path[0];
  const p1 = path[1];
  const dx = p1[0] - p0[0];
  const dy = p1[1] - p0[1];
  const len = Math.sqrt(dx * dx + dy * dy) || 1;
  u.x = p0[0] + (dx / len) * offset;
  u.y = p0[1] + (dy / len) * offset;
  u.px = u.x;
  u.py = u.y;
  return u;
}

/** An elite pawn fielded with Tempo: spawns at the base and marches its lane like a pawnling. */
export function makePawn(ctx: Ctx, team: PlayTeam, lane: LaneId): Unit {
  const p = ctx.t.pawns;
  const g = 1 + p.scalePerAct * (Math.max(1, ctx.s.phase.n) - 1);
  const stats: Stats = {
    maxHp: p.hp * g,
    hpRegen: 0,
    armor: p.armor,
    resist: p.resist,
    bladeDmg: p.damage * g,
    atkSpeed: p.atkSpeed,
    soulPower: 0,
    moveSpeed: p.moveSpeed,
    cdr: 0,
    range: p.range,
    respawnMult: 1,
    incomeMult: 1,
    damageTakenMult: 1,
  };
  const base = ctx.world.basePos[team];
  const u = newUnit(ctx, 'minion', team, 'pawn', base.x, base.y, stats, p.damageType);
  u.pawn = true;
  u.lane = lane;
  u.bounty = p.bounty;
  const path = laneWaypoints(ctx.world, team, lane);
  u.path = path;
  u.pathI = 1;
  u.x = path[0][0];
  u.y = path[0][1];
  u.px = u.x;
  u.py = u.y;
  return u;
}

export function makeTower(ctx: Ctx, team: PlayTeam, lane: LaneId, index: 0 | 1): Unit {
  const t = ctx.t.tower;
  const pos = ctx.world.towerPos[team][lane][index];
  const stats: Stats = {
    maxHp: index === 1 ? Math.round(t.hp * t.innerHpMul) : t.hp,
    hpRegen: 0,
    armor: t.armor,
    resist: t.resist,
    bladeDmg: t.damage,
    atkSpeed: t.atkSpeed,
    soulPower: 0,
    moveSpeed: 0,
    cdr: 0,
    range: t.range,
    respawnMult: 1,
    incomeMult: 1,
    damageTakenMult: 1,
  };
  const u = newUnit(ctx, 'tower', team, 'tower', pos.x, pos.y, stats);
  u.tower = { lane, index };
  u.lane = lane;
  ctx.towers[team][lane][index] = u;
  return u;
}

export function makeGuardian(ctx: Ctx, team: PlayTeam): Unit {
  const g = ctx.t.guardian;
  const pos = ctx.world.guardianPos[team];
  const stats: Stats = {
    maxHp: g.hp,
    hpRegen: g.hpRegen,
    armor: g.armor,
    resist: g.resist,
    bladeDmg: g.damage,
    atkSpeed: g.atkSpeed,
    soulPower: 0,
    moveSpeed: 0,
    cdr: 0,
    range: g.range,
    respawnMult: 1,
    incomeMult: 1,
    damageTakenMult: 1,
  };
  const u = newUnit(ctx, 'guardian', team, 'guardian', pos.x, pos.y, stats, 'true');
  u.rageStage = 0;
  ctx.guardians[team] = u;
  ctx.s.teams[team].guardianId = u.id;
  return u;
}
