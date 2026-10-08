import { pick, rand } from './core/rng';
import type { Ctx } from './ctx';
import { netWorth } from './shop';
import type { CurseOffer, PlayTeam, Unit } from './types';

function freeSlot(ctx: Ctx, u: Unit): void {
  const h = u.hero!;
  if (h.items.length < ctx.t.shop.slots) return;
  let worst = -1;
  let worstCost = Infinity;
  h.items.forEach((id, i) => {
    const it = ctx.c.itemById.get(id);
    if (it && it.cost < worstCost) {
      worstCost = it.cost;
      worst = i;
    }
  });
  if (worst < 0) return;
  const id = h.items[worst];
  const it = ctx.c.itemById.get(id)!;
  h.items.splice(worst, 1);
  const refund = Math.round(it.cost * ctx.t.shop.sellRefund);
  h.gold += refund;
  ctx.emit('sell', { id: u.id, item: id, refund });
}

export function grantSpecial(ctx: Ctx, u: Unit, itemId: string): void {
  freeSlot(ctx, u);
  u.hero!.items.push(itemId);
  u.dirty = true;
}

export function teamNetWorth(ctx: Ctx, team: PlayTeam): number {
  let sum = 0;
  for (const id of ctx.s.teams[team].heroIds) {
    const u = ctx.unit(id);
    if (u) sum += netWorth(ctx, u);
  }
  return sum;
}

function moveKeeperNear(ctx: Ctx, hero: Unit): void {
  const k = ctx.unit(ctx.s.keeper.unitId);
  if (!k) return;
  let best = ctx.world.map.keeperSpots[0];
  let bestD = Infinity;
  for (const spot of ctx.world.map.keeperSpots) {
    const d = Math.hypot(spot.x - hero.x, spot.y - hero.y);
    if (d < bestD) {
      bestD = d;
      best = spot;
    }
  }
  if (best.id === ctx.s.keeper.spot) return;
  k.x = best.x;
  k.y = best.y;
  k.px = best.x;
  k.py = best.y;
  ctx.s.keeper.spot = best.id;
  ctx.emit('keeperMoved', { spot: best.id, x: best.x, y: best.y, stock: ctx.s.keeper.stock });
}

export function evaluateCurseOffers(ctx: Ctx): void {
  const n = ctx.s.phase.n;
  ctx.s.teams.A.curseOffers = 0;
  ctx.s.teams.B.curseOffers = 0;
  if (n < ctx.t.curse.minPhase) return;
  const a = teamNetWorth(ctx, 'A');
  const b = teamNetWorth(ctx, 'B');
  if (a === b) return;
  const loser: PlayTeam = a < b ? 'A' : 'B';
  let total = 0;
  let count = 0;
  for (const t of ['A', 'B'] as PlayTeam[]) {
    for (const id of ctx.s.teams[t].heroIds) {
      const u = ctx.unit(id);
      if (u) {
        total += netWorth(ctx, u);
        count++;
      }
    }
  }
  const avg = total / Math.max(1, count);
  let cand: Unit | null = null;
  let candNw = Infinity;
  for (const id of ctx.s.teams[loser].heroIds) {
    const u = ctx.unit(id);
    if (!u) continue;
    const nw = netWorth(ctx, u);
    if (nw < candNw) {
      candNw = nw;
      cand = u;
    }
  }
  if (!cand || candNw >= avg * ctx.t.curse.threshold) return;
  const owned = new Set(cand.hero!.items);
  const pool = ctx.c.cursed.filter((c) => !owned.has(c.id));
  if (pool.length === 0) return;
  const item = pick(ctx.s.rng, 'loot', pool);
  const offer: CurseOffer = {
    heroId: cand.id,
    itemId: item.id,
    phase: n,
    resolved: false,
    accepted: false,
  };
  ctx.s.curseOffers.push(offer);
  ctx.s.teams[loser].curseOffers++;
  ctx.emit('curseOffered', { hero: cand.id, item: item.id, flawType: item.flawType });
  moveKeeperNear(ctx, cand);
  // The AI decides curses for both teams.
  const desperation = Math.max(0, (avg - candNw) / Math.max(1, avg));
  const p = Math.min(0.95, ctx.t.ai.curseAcceptBase + desperation * 0.6);
  resolveCurse(ctx, offer, rand(ctx.s.rng, 'ai') < p);
}

export function pendingOffer(ctx: Ctx, heroId: number): CurseOffer | null {
  return ctx.s.curseOffers.find((o) => o.heroId === heroId && !o.resolved) ?? null;
}

export function resolveCurse(ctx: Ctx, offer: CurseOffer, accept: boolean): void {
  offer.resolved = true;
  offer.accepted = accept;
  const u = ctx.unit(offer.heroId);
  const item = ctx.c.cursedById.get(offer.itemId);
  if (!u || !u.hero || !item) return;
  if (!accept) {
    ctx.emit('curseRefused', { hero: u.id, item: item.id });
    return;
  }
  const flaw = pick(ctx.s.rng, 'loot', item.flaws);
  u.hero.flaws[item.id] = flaw.id;
  grantSpecial(ctx, u, item.id);
  ctx.emit('curseAccepted', { hero: u.id, item: item.id, flaw: flaw.id });
}
