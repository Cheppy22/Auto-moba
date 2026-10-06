import type { Ctx } from '../ctx';
import { buyItem, quote } from '../shop';
import type { ItemDef } from '../content/schema';
import type { Unit } from '../types';
import { other } from '../types';

function chainIncludes(ctx: Ctx, item: ItemDef, id: string): boolean {
  for (const f of item.from) {
    if (f === id) return true;
    const comp = ctx.c.itemById.get(f);
    if (comp && chainIncludes(ctx, comp, id)) return true;
  }
  return false;
}

function satisfied(ctx: Ctx, u: Unit, id: string): boolean {
  const h = u.hero!;
  for (const owned of h.items) {
    if (owned === id) return true;
    const it = ctx.c.itemById.get(owned);
    if (it && chainIncludes(ctx, it, id)) return true;
  }
  return false;
}

function adaptTarget(ctx: Ctx, u: Unit): string | null {
  if (u.team === 'neutral') return null;
  let blade = 0;
  let soul = 0;
  for (const id of ctx.s.teams[other(u.team)].heroIds) {
    const e = ctx.unit(id);
    if (!e) continue;
    blade += e.stats.bladeDmg * e.stats.atkSpeed;
    soul += e.stats.soulPower;
  }
  const want = blade > soul * 1.4 ? 'riveted_plate' : soul > blade * 0.9 ? 'spirit_lens' : null;
  if (want && ctx.c.itemById.has(want) && !satisfied(ctx, u, want)) return want;
  return null;
}

export interface Purchase {
  id: string;
  price: number;
}

export function nextPurchase(ctx: Ctx, u: Unit, ignoreAccess = false): Purchase | null {
  const h = u.hero;
  if (!h) return null;
  const def = ctx.c.heroById.get(h.defId)!;
  const targets = [...def.buildList];
  const adapt = adaptTarget(ctx, u);
  if (adapt && h.items.length >= 2) targets.splice(2, 0, adapt);
  for (const id of targets) {
    if (satisfied(ctx, u, id)) continue;
    const item = ctx.c.itemById.get(id);
    if (!item) continue;
    const q = quote(ctx, u, id, ignoreAccess);
    if (!('error' in q) && q.price <= h.gold) return { id, price: q.price };
    for (const comp of item.from) {
      if (satisfied(ctx, u, comp)) continue;
      const cq = quote(ctx, u, comp, ignoreAccess);
      if (!('error' in cq) && cq.price <= h.gold) return { id: comp, price: cq.price };
    }
    return null;
  }
  let best: Purchase | null = null;
  for (const it of ctx.c.items) {
    if (it.tier < 3) continue;
    if (!it.from.some((f) => h.items.includes(f))) continue;
    const q = quote(ctx, u, it.id, ignoreAccess);
    if (!('error' in q) && q.price <= h.gold && (!best || q.price > best.price))
      best = { id: it.id, price: q.price };
  }
  return best;
}

export function aiShop(ctx: Ctx, u: Unit): void {
  for (let i = 0; i < 5; i++) {
    const p = nextPurchase(ctx, u);
    if (!p) break;
    if (!buyItem(ctx, u, p.id).ok) break;
  }
}
