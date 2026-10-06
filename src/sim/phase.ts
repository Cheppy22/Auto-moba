import { aiPrep, offerUpgrades } from './ai/prep';
import { initAuction, resolveAuction } from './auction';
import { openSlotsForPhase, rerollJungle } from './camps';
import { TPS } from './combat';
import type { Ctx } from './ctx';
import { evaluateCurseOffers } from './curses';
import { relocateKeeper } from './keeper';
import { scheduleObelisks } from './obelisks';
import { applyPressure } from './pressure';
import { dirtyAll } from './stats';
import type { CommandResult, PlayTeam } from './types';

void initAuction;

export function enterPrep(ctx: Ctx, n: number): void {
  const s = ctx.s;
  s.phase = { kind: 'prep', n, startTick: s.tick };
  ctx.emit('phaseStart', { phase: n, kind: 'prep' });
  const before = new Set(s.slots.filter((x) => x.open).map((x) => x.id));
  openSlotsForPhase(ctx);
  if (n >= 2)
    rerollJungle(ctx, new Set(s.slots.filter((x) => x.open && !before.has(x.id)).map((x) => x.id)));
  applyPressure(ctx);
  relocateKeeper(ctx);
  s.upgradeOffers = {};
  evaluateCurseOffers(ctx);
  aiPrep(ctx);
  if (s.playerHeroId !== null) {
    const p = ctx.unit(s.playerHeroId);
    if (p && p.hero) {
      const offer = offerUpgrades(ctx, p);
      if (offer.length) s.upgradeOffers[p.id] = offer;
    }
  }
  dirtyAll(ctx);
}

export function startLive(ctx: Ctx): CommandResult {
  const s = ctx.s;
  if (s.phase.kind !== 'prep') return { ok: false, reason: 'not in prep' };
  if (s.playerHeroId !== null) {
    if (s.upgradeOffers[s.playerHeroId]?.length)
      return { ok: false, reason: 'pick an upgrade first' };
    if (s.curseOffers.some((o) => o.heroId === s.playerHeroId && !o.resolved)) {
      return { ok: false, reason: 'answer the curse offer first' };
    }
  }
  if (s.phase.n === 3 && !s.auction.resolved) resolveAuction(ctx);
  if (s.auction.awaitingRecipient)
    return { ok: false, reason: 'choose who receives the holy item' };
  s.phase = { kind: 'live', n: s.phase.n, startTick: s.tick };
  if (s.phase.n === 1) s.nextWaveTick = Math.round(ctx.t.waves.firstSec * TPS) + s.tick;
  scheduleObelisks(ctx);
  for (const team of ['A', 'B'] as PlayTeam[]) {
    for (const id of s.teams[team].heroIds) {
      const u = ctx.unit(id);
      if (u && u.hero) {
        u.hero.engage = 'fight';
        u.hero.engageTick = s.tick - 100;
      }
    }
  }
  dirtyAll(ctx);
  ctx.emit('phaseStart', { phase: s.phase.n, kind: 'live' });
  return { ok: true };
}

export function endLive(ctx: Ctx): void {
  const s = ctx.s;
  if (s.phase.kind !== 'live') return;
  for (const u of s.units) {
    if (u.kind === 'obelisk' && u.alive) {
      u.alive = false;
      ctx.emit('obeliskExpired', { node: u.obelisk!.nodeId });
    }
    if (u.hero) u.hero.recall = null;
  }
  ctx.emit('phaseEnd', { phase: s.phase.n, kind: 'live' });
  s.phase = { kind: 'report', n: s.phase.n, startTick: s.tick };
}

export function continueFromReport(ctx: Ctx): CommandResult {
  const s = ctx.s;
  if (s.phase.kind !== 'report') return { ok: false, reason: 'not in report' };
  if (s.phase.n >= ctx.t.maxPhases) return { ok: false, reason: 'phase limit reached' };
  enterPrep(ctx, s.phase.n + 1);
  return { ok: true };
}
