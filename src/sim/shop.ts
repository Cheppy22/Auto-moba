import { dist } from './core/math';
import type { Ctx } from './ctx';
import type { CommandResult, PlayTeam, Unit } from './types';

export function itemCost(ctx: Ctx, id: string): number {
  return ctx.c.itemById.get(id)?.cost ?? 0;
}

export function netWorth(ctx: Ctx, u: Unit): number {
  const h = u.hero;
  if (!h) return 0;
  let total = h.gold;
  for (const id of h.items) total += itemCost(ctx, id);
  return total;
}

export function giveGold(ctx: Ctx, u: Unit, amount: number, source: string, silent = false): void {
  const h = u.hero;
  if (!h || amount <= 0) return;
  const real = Math.round(amount * u.stats.incomeMult);
  h.gold += real;
  h.goldEarned += real;
  if (!silent) ctx.emit('gold', { id: u.id, amount: real, source });
}

export function baseCatalog(ctx: Ctx, team: PlayTeam): string[] {
  const out: string[] = [];
  for (const it of ctx.c.items) {
    if (it.tier <= 2 || ctx.s.teams[team].unlocks.includes(it.id)) out.push(it.id);
  }
  return out;
}

export function nearBase(ctx: Ctx, u: Unit): boolean {
  if (!u.hero || u.team === 'neutral') return false;
  const b = ctx.world.basePos[u.team];
  return dist(u.x, u.y, b.x, b.y) <= ctx.t.shop.baseRadius;
}

export function nearKeeper(ctx: Ctx, u: Unit): boolean {
  const k = ctx.unit(ctx.s.keeper.unitId);
  if (!k || !k.alive) return false;
  return dist(u.x, u.y, k.x, k.y) <= ctx.t.shop.keeperRadius;
}

export interface Access {
  base: boolean;
  keeper: boolean;
}

export function shopAccess(ctx: Ctx, u: Unit): Access {
  if (ctx.s.phase.kind === 'prep') return { base: true, keeper: true };
  if (ctx.s.phase.kind !== 'live' || !u.alive) return { base: false, keeper: false };
  return { base: nearBase(ctx, u), keeper: nearKeeper(ctx, u) };
}

export interface Quote {
  price: number;
  consumed: string[];
}

export function quote(
  ctx: Ctx,
  u: Unit,
  itemId: string,
  ignoreAccess = false,
): Quote | { error: string } {
  const h = u.hero;
  const item = ctx.c.itemById.get(itemId);
  if (!h || !item || u.team === 'neutral') return { error: 'unknown item' };
  const access = ignoreAccess ? { base: true, keeper: false } : shopAccess(ctx, u);
  const inBase = access.base && baseCatalog(ctx, u.team).includes(itemId);
  const inKeeper = access.keeper && ctx.s.keeper.stock.includes(itemId);
  if (!inBase && !inKeeper)
    return { error: access.base || access.keeper ? 'not in catalog' : 'no shop in reach' };
  const owned = h.items.slice();
  const consumed: string[] = [];
  let discount = 0;
  for (const comp of item.from) {
    const i = owned.indexOf(comp);
    if (i >= 0) {
      owned.splice(i, 1);
      consumed.push(comp);
      discount += itemCost(ctx, comp);
    }
  }
  const price = Math.max(0, item.cost - discount);
  if (owned.length + 1 > ctx.t.shop.slots) return { error: 'no free slot' };
  return { price, consumed };
}

export function buyItem(ctx: Ctx, u: Unit, itemId: string): CommandResult {
  const h = u.hero;
  if (!h) return { ok: false, reason: 'not a hero' };
  const q = quote(ctx, u, itemId);
  if ('error' in q) return { ok: false, reason: q.error };
  if (h.gold < q.price) return { ok: false, reason: 'not enough gold' };
  h.gold -= q.price;
  for (const c of q.consumed) h.items.splice(h.items.indexOf(c), 1);
  h.items.push(itemId);
  u.dirty = true;
  ctx.emit('purchase', { id: u.id, item: itemId, price: q.price, consumed: q.consumed });
  return { ok: true };
}

export function sellItem(ctx: Ctx, u: Unit, itemId: string): CommandResult {
  const h = u.hero;
  if (!h) return { ok: false, reason: 'not a hero' };
  const i = h.items.indexOf(itemId);
  if (i < 0) return { ok: false, reason: 'item not owned' };
  const item = ctx.c.itemById.get(itemId);
  if (!item) return { ok: false, reason: 'cursed and holy items cannot be sold' };
  const access = shopAccess(ctx, u);
  if (!access.base && !access.keeper) return { ok: false, reason: 'no shop in reach' };
  const refund = Math.round(item.cost * ctx.t.shop.sellRefund);
  h.items.splice(i, 1);
  h.gold += refund;
  u.dirty = true;
  ctx.emit('sell', { id: u.id, item: itemId, refund });
  return { ok: true };
}
