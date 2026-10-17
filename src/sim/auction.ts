import { pick, rand } from './core/rng';
import type { Ctx } from './ctx';
import { grantSpecial } from './curses';
import type { CommandResult, PlayTeam, Unit } from './types';

export function initAuction(ctx: Ctx): void {
  const holy = pick(ctx.s.rng, 'loot', ctx.c.holy);
  ctx.s.auction = {
    holyId: holy.id,
    bids: { A: { points: 0, gold: 0, goldBy: {} }, B: { points: 0, gold: 0, goldBy: {} } },
    resolved: false,
    winner: null,
    recipient: null,
    awaitingRecipient: false,
  };
}

export function auctionOpen(ctx: Ctx): boolean {
  return (
    ctx.t.auction.enabled &&
    ctx.s.phase.kind === 'prep' &&
    ctx.s.phase.n <= 3 &&
    !ctx.s.auction.resolved
  );
}

export function placeBid(
  ctx: Ctx,
  team: PlayTeam,
  hero: Unit,
  points: number,
  gold: number,
): CommandResult {
  if (!auctionOpen(ctx)) return { ok: false, reason: 'auction is closed' };
  if (!hero.hero) return { ok: false, reason: 'not a hero' };
  points = Math.max(0, Math.floor(points));
  gold = Math.max(0, Math.floor(gold));
  if (points + gold <= 0) return { ok: false, reason: 'empty bid' };
  if (points > ctx.s.teams[team].points) return { ok: false, reason: 'not enough team points' };
  if (gold > hero.hero.gold) return { ok: false, reason: 'not enough gold' };
  ctx.s.teams[team].points -= points;
  hero.hero.gold -= gold;
  const b = ctx.s.auction.bids[team];
  b.points += points;
  b.gold += gold;
  b.goldBy[hero.id] = (b.goldBy[hero.id] ?? 0) + gold;
  ctx.emit('bid', { team, points, gold, hero: hero.id });
  return { ok: true };
}

export function aiBids(ctx: Ctx, team: PlayTeam): void {
  if (!auctionOpen(ctx)) return;
  const frac = ctx.t.ai.bidFraction[Math.min(ctx.s.phase.n, 3) - 1] ?? 1;
  const jitter = 0.85 + rand(ctx.s.rng, 'ai') * 0.3;
  const points = Math.floor(ctx.s.teams[team].points * frac * jitter);
  let richest: Unit | null = null;
  for (const id of ctx.s.teams[team].heroIds) {
    const u = ctx.unit(id);
    if (u && u.hero && !u.hero.isPlayer && (!richest || u.hero.gold > richest.hero!.gold))
      richest = u;
  }
  const gold = richest
    ? Math.floor(richest.hero!.gold * ctx.t.ai.bidGoldFraction * (frac >= 1 ? 1.5 : 0.5))
    : 0;
  if (richest && (points > 0 || gold > 0))
    placeBid(ctx, team, richest, points, Math.min(gold, richest.hero!.gold));
}

function bestRecipient(ctx: Ctx, team: PlayTeam): number {
  let best = ctx.s.teams[team].heroIds[0];
  let bestScore = -1;
  for (const id of ctx.s.teams[team].heroIds) {
    const u = ctx.unit(id);
    if (!u) continue;
    const score =
      u.stats.bladeDmg * u.stats.atkSpeed + u.stats.soulPower * 0.8 + u.stats.maxHp * 0.05;
    if (score > bestScore) {
      bestScore = score;
      best = id;
    }
  }
  return best;
}

export function awardHoly(ctx: Ctx, heroId: number): void {
  const u = ctx.unit(heroId);
  if (!u || !u.hero) return;
  grantSpecial(ctx, u, ctx.s.auction.holyId);
  ctx.s.auction.recipient = heroId;
  ctx.s.auction.awaitingRecipient = false;
  ctx.emit('auctionResolved', {
    winner: ctx.s.auction.winner,
    holy: ctx.s.auction.holyId,
    recipient: heroId,
    pointsA: ctx.s.auction.bids.A.points,
    pointsB: ctx.s.auction.bids.B.points,
    goldA: ctx.s.auction.bids.A.gold,
    goldB: ctx.s.auction.bids.B.gold,
  });
}

export function resolveAuction(ctx: Ctx): void {
  const a = ctx.s.auction;
  if (a.resolved) return;
  a.resolved = true;
  const rate = ctx.t.auction.pointRate;
  const va = a.bids.A.points * rate + a.bids.A.gold;
  const vb = a.bids.B.points * rate + a.bids.B.gold;
  let winner: PlayTeam;
  if (va !== vb) winner = va > vb ? 'A' : 'B';
  else if (a.bids.A.points !== a.bids.B.points)
    winner = a.bids.A.points > a.bids.B.points ? 'A' : 'B';
  else winner = rand(ctx.s.rng, 'loot') < 0.5 ? 'A' : 'B';
  a.winner = winner;
  const loser: PlayTeam = winner === 'A' ? 'B' : 'A';
  for (const [hid, g] of Object.entries(a.bids[loser].goldBy)) {
    const u = ctx.unit(Number(hid));
    if (u && u.hero) u.hero.gold += Math.round(g * ctx.t.auction.loserRefund);
  }
  const playerTeam = ctx.s.playerHeroId !== null ? ctx.unit(ctx.s.playerHeroId)?.team : null;
  if (playerTeam === winner) {
    a.awaitingRecipient = true;
    return;
  }
  awardHoly(ctx, bestRecipient(ctx, winner));
}
