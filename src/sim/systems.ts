import { maybeSwapLane } from './ai/swap';
import { teamNetWorth } from './curses';
import {
  TPS,
  HERO_ASSIST_WINDOW,
  castAbilities,
  cleanExpired,
  fireTriggers,
  healUnit,
  tickDots,
  tickPeriodicTriggers,
  tryRevive,
} from './combat';
import { dist } from './core/math';
import type { Ctx } from './ctx';
import { hpPct } from './ctx';
import { giveGold } from './shop';
import { makeMinion } from './units';
import { LANES } from './world/map';
import type { PlayTeam, Unit } from './types';
import { other } from './types';
import { onCampUnitDeath } from './camps';
import { endAllEvents, onEventUnitDeath } from './events';
import { removeBoardClaim } from './ai/claims';
import { addTempo } from './gambits';

export function spawnWaves(ctx: Ctx): void {
  const w = ctx.t.waves;
  if (ctx.s.tick < ctx.s.nextWaveTick) return;
  ctx.s.nextWaveTick += Math.round(w.intervalSec * TPS);
  const phase = ctx.s.phase.n;
  const scale = 1 + w.scalePerPhase * (phase - 1);
  const extra =
    phase >= w.extraMeleeFromPhase
      ? w.extraMeleePerPhaseAfter * (phase - w.extraMeleeFromPhase + 1)
      : 0;
  const melee = w.melee + extra;
  // The short mid lane would clash at the exact centre every wave; the team that "leads" alternates
  // by wave (a deterministic stagger) so the clash point drifts to either side of the centre.
  const waveNo = Math.round((ctx.s.nextWaveTick - w.firstSec * TPS) / (w.intervalSec * TPS));
  const leader: PlayTeam = waveNo % 2 === 0 ? 'A' : 'B';
  for (const team of ['A', 'B'] as PlayTeam[]) {
    for (const lane of LANES) {
      const lead = lane === 'mid' && team === leader ? w.midLeadUnits : 0;
      for (let i = 0; i < melee; i++) makeMinion(ctx, team, lane, 'melee', scale, i * 9 + lead);
      for (let i = 0; i < w.ranged; i++)
        makeMinion(ctx, team, lane, 'ranged', scale, (melee + i) * 9 + lead);
    }
  }
}

export function tickUnitState(ctx: Ctx): void {
  const units = ctx.s.units;
  const tick = ctx.s.tick;
  const n = units.length;
  const start = n > 0 ? tick % n : 0;
  for (let k = 0; k < n; k++) {
    const u = units[(start + k) % n];
    if (!u.alive) continue;
    cleanExpired(ctx, u);
    if (u.stats.hpRegen > 0 && u.hp < u.stats.maxHp)
      healUnit(ctx, null, u, u.stats.hpRegen / TPS, 'regen', false);
    tickDots(ctx, u);
    const h = u.hero;
    if (h) {
      for (let k = 0; k < 4; k++) if (h.cd[k] > 0) h.cd[k]--;
      if (h.order && h.order.untilTick <= tick) h.order = null;
      tickPeriodicTriggers(ctx, u);
      if (u.team !== 'neutral') {
        const b = ctx.world.basePos[u.team];
        if (dist(u.x, u.y, b.x, b.y) <= ctx.t.ai.healBaseRadius && u.hp < u.stats.maxHp) {
          healUnit(ctx, null, u, (u.stats.maxHp * ctx.t.ai.baseHealPerSec) / TPS, 'base', false);
        }
      }
      if ((tick + u.id) % 3 === 0) castAbilities(ctx, u);
    }
  }
}

/** Respawn grows within an Act and per Act; Check (King) and Endgame lengthen it after the cap. */
export function respawnTicks(ctx: Ctx, u: Unit): number {
  const r = ctx.t.respawn;
  const intoPhase = Math.max(0, ctx.s.tick - ctx.s.phase.startTick) / TPS;
  let sec = Math.min(
    r.maxSec,
    (r.baseSec + r.basePerPhase * (ctx.s.phase.n - 1) + r.growthPerSec * intoPhase) *
      u.stats.respawnMult,
  );
  if (u.hero?.defId === 'king') sec *= ctx.t.check.kingRespawnMul;
  sec *= ctx.s.tagMult.respawn ?? 1;
  return Math.max(TPS, Math.round(sec * TPS));
}

function checkmate(ctx: Ctx, loser: PlayTeam): void {
  if (ctx.s.phase.kind === 'end') return;
  const winner = other(loser);
  ctx.s.winner = winner;
  endAllEvents(ctx);
  ctx.s.phase = { kind: 'end', n: ctx.s.phase.n, startTick: ctx.s.tick };
  ctx.emit('checkmate', { winner });
  ctx.emit('matchEnd', { winner, phase: ctx.s.phase.n });
}

function kingDown(ctx: Ctx, team: PlayTeam): void {
  if (ctx.s.throneDown[team]) {
    checkmate(ctx, team);
    return;
  }
  ctx.s.check[team] = true;
  ctx.emit('check', { team });
}

function awardAssists(ctx: Ctx, victim: Unit, killerId: number): number[] {
  const ids: number[] = [];
  const h = victim.hero;
  if (!h) return ids;
  for (const a of h.attackers) {
    if (a.id === killerId || ctx.s.tick - a.tick > HERO_ASSIST_WINDOW) continue;
    const hero = ctx.unit(a.id);
    if (!hero || !hero.hero || hero.team === victim.team) continue;
    hero.hero.assists++;
    giveGold(ctx, hero, ctx.t.gold.assist, 'assist');
    ids.push(a.id);
  }
  h.attackers = [];
  return ids;
}

function shareNearby(
  ctx: Ctx,
  victim: Unit,
  killerTeam: PlayTeam | null,
  skipId: number,
  amount: number,
): void {
  if (!killerTeam) return;
  for (const id of ctx.s.teams[killerTeam].heroIds) {
    const hero = ctx.unit(id);
    if (!hero || !hero.alive || hero.id === skipId) continue;
    if (dist(hero.x, hero.y, victim.x, victim.y) <= ctx.t.gold.shareRadius)
      giveGold(ctx, hero, amount, 'share');
  }
}

function killUnit(ctx: Ctx, u: Unit): void {
  const killer = ctx.unit(u.pendingKill?.killerId ?? 0) ?? null;
  const killerHero = killer && killer.hero ? killer : null;
  const killerTeam: PlayTeam | null = killer && killer.team !== 'neutral' ? killer.team : null;
  u.alive = false;
  u.hp = 0;
  u.pendingKill = null;
  u.targetId = null;
  switch (u.kind) {
    case 'hero': {
      const h = u.hero!;
      h.deaths++;
      const victimStreak = h.streak;
      h.streak = 0;
      h.lossStreak = ctx.s.tick - h.lastDeathTick > ctx.t.ai.lossWindowTicks ? 1 : h.lossStreak + 1;
      h.lastDeathTick = ctx.s.tick;
      h.recall = null;
      h.goal = null;
      h.respawnAt = ctx.s.tick + respawnTicks(ctx, u);
      removeBoardClaim(ctx, u);
      const assists = awardAssists(ctx, u, killer ? killer.id : 0);
      if (killerHero && killerTeam) {
        const kh = killerHero.hero!;
        kh.kills++;
        kh.lossStreak = 0;
        kh.streak++;
        const behind = Math.max(
          0,
          teamNetWorth(ctx, u.team as PlayTeam) - teamNetWorth(ctx, killerTeam),
        );
        giveGold(
          ctx,
          killerHero,
          ctx.t.gold.heroKill +
            ctx.t.gold.killBountyPerStreak * Math.min(5, victimStreak) +
            Math.round((ctx.t.gold.comebackBounty * Math.min(behind, 8000)) / 1000),
          'kill',
        );
        fireTriggers(ctx, killerHero, 'kill', { victim: u });
      }
      if (killerTeam) {
        ctx.s.teams[killerTeam].kills++;
        addTempo(ctx, killerTeam, ctx.t.gambits.tempoPieceKill);
      }
      ctx.emit('death', {
        id: u.id,
        kind: 'hero',
        team: u.team,
        killer: killer ? killer.id : 0,
        killerKind: killer ? killer.kind : 'none',
        assists,
        x: u.x,
        y: u.y,
      });
      maybeSwapLane(ctx, u);
      if (h.defId === 'king' && u.team !== 'neutral') {
        if (ctx.s.throneDown[u.team]) h.respawnAt = null;
        kingDown(ctx, u.team);
      }
      break;
    }
    case 'minion': {
      if (u.ev) {
        onEventUnitDeath(ctx, u, killer);
        break;
      }
      if (u.pawn) {
        if (killerTeam) {
          addTempo(ctx, killerTeam, ctx.t.gambits.tempoPawnKill);
          if (killerHero) giveGold(ctx, killerHero, u.bounty, 'pawn');
          for (const id of ctx.s.teams[killerTeam].heroIds) {
            const hero = ctx.unit(id);
            if (hero) giveGold(ctx, hero, ctx.t.pawns.teamBounty, 'pawnTeam');
          }
        }
        break;
      }
      if (killerTeam) addTempo(ctx, killerTeam, ctx.t.gambits.tempoPawnlingKill);
      if (killerHero) {
        giveGold(ctx, killerHero, u.bounty, 'lasthit');
        shareNearby(ctx, u, killerTeam, killerHero.id, ctx.t.gold.minionShare);
        fireTriggers(ctx, killerHero, 'kill', { victim: u });
      } else shareNearby(ctx, u, killerTeam, -1, ctx.t.gold.minionShare);
      break;
    }
    case 'camp':
      onCampUnitDeath(ctx, u, killer);
      break;
    case 'tower': {
      const t = u.tower!;
      if (killerTeam) {
        ctx.s.teams[killerTeam].towersDown++;
        addTempo(ctx, killerTeam, ctx.t.gambits.tempoBastion);
        for (const id of ctx.s.teams[killerTeam].heroIds) {
          const hero = ctx.unit(id);
          if (hero) giveGold(ctx, hero, ctx.t.tower.teamGold, 'tower');
        }
        if (killerHero) giveGold(ctx, killerHero, ctx.t.tower.gold, 'tower');
      }
      ctx.emit('structureDown', {
        kind: 'tower',
        team: u.team,
        lane: t.lane,
        index: t.index,
        killer: killer ? killer.id : 0,
        x: u.x,
        y: u.y,
      });
      break;
    }
    case 'guardian': {
      ctx.emit('structureDown', {
        kind: 'guardian',
        team: u.team,
        lane: 'base',
        index: 0,
        killer: killer ? killer.id : 0,
        x: u.x,
        y: u.y,
      });
      if (u.team === 'neutral') break;
      ctx.s.throneDown[u.team] = true;
      ctx.emit('throneDown', { team: u.team });
      const king = ctx.s.teams[u.team].heroIds
        .map((id) => ctx.unit(id))
        .find((x) => x?.hero?.defId === 'king');
      if (king && !king.alive) {
        king.hero!.respawnAt = null;
        checkmate(ctx, u.team);
      }
      break;
    }
    default:
      break;
  }
}

export function processDeaths(ctx: Ctx): void {
  const units = ctx.s.units;
  for (let i = 0; i < units.length; i++) {
    const u = units[i];
    if (!u.pendingKill) continue;
    if (u.hero && tryRevive(ctx, u)) continue;
    killUnit(ctx, u);
  }
  let removed = false;
  for (const u of units) {
    if (!u.alive && !u.hero) {
      ctx.idx.delete(u.id);
      removed = true;
    }
  }
  if (removed) ctx.s.units = units.filter((u) => u.alive || u.hero);
}

export function respawnHeroes(ctx: Ctx): void {
  for (const team of ['A', 'B'] as PlayTeam[]) {
    for (const id of ctx.s.teams[team].heroIds) {
      const u = ctx.unit(id);
      if (!u || u.alive || !u.hero || u.hero.respawnAt === null) continue;
      if (ctx.s.tick < u.hero.respawnAt) continue;
      const b = ctx.world.basePos[team];
      const dir = team === 'A' ? 1 : -1;
      u.x = b.x + dir * (14 + u.hero.slot * 7);
      u.y = b.y - dir * (14 + (u.hero.slot % 2) * 9);
      u.px = u.x;
      u.py = u.y;
      u.alive = true;
      u.dirty = true;
      u.hp = u.stats.maxHp;
      u.hero.respawnAt = null;
      u.hero.lastStandUsed = false;
      u.stunUntil = undefined;
      if (u.hero.defId === 'king') ctx.s.check[team] = false;
      u.hero.engage = 'fight';
      u.shields = [];
      u.dots = [];
      u.mods = u.mods.filter((m) => m.expiresTick === null);
      ctx.emit('respawn', { id: u.id });
    }
  }
}

export function passiveGold(ctx: Ctx): void {
  const every = 10 * TPS;
  if (ctx.s.tick - ctx.s.lastPassiveTick < every) return;
  ctx.s.lastPassiveTick = ctx.s.tick;
  const amount = ctx.t.passiveGoldPerSec * 10;
  for (const team of ['A', 'B'] as PlayTeam[]) {
    for (const id of ctx.s.teams[team].heroIds) {
      const u = ctx.unit(id);
      if (u) giveGold(ctx, u, amount, 'passive');
    }
  }
}

export function sampleAndFlush(ctx: Ctx): void {
  const tick = ctx.s.tick;
  if (tick % 10 === 0) {
    for (const team of ['A', 'B'] as PlayTeam[]) {
      for (const id of ctx.s.teams[team].heroIds) {
        const u = ctx.unit(id);
        if (u && u.alive)
          ctx.rec.samples.push({
            tick,
            id,
            x: Math.round(u.x * 10) / 10,
            y: Math.round(u.y * 10) / 10,
            hp: Math.round(hpPct(u) * 1000) / 1000,
          });
      }
    }
  }
  if (tick % TPS === 0 && ctx.buckets.size > 0) {
    for (const b of ctx.buckets.values()) {
      ctx.emit('damageBucket', {
        srcTeam: b.srcTeam,
        tgtKind: b.tgtKind,
        amount: Math.round(b.amount),
        count: b.count,
      });
    }
    ctx.buckets.clear();
  }
}
