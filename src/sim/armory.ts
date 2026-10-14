// The Act break's armory (spec SPEC-TOURNAMENT-ARMORY-2026-10-13 1C): White's buy, sell and plan
// commands, the AI's break shop for both sides, and the read-only view the Armory tab shows.
import type { Ctx } from './ctx';
import { breakShop, nextPurchase, satisfied } from './ai/shopping';
import { pathListOf } from './pieces';
import { armoryOpen, buyItem, itemPrice, quote, sellItem, sellRefund } from './shop';
import type { ArmoryTile, ArmoryView, CommandResult, PlayTeam, Unit } from './types';

/** The break's armory opens (both sides shop by the AI rule from here on, White by hand too). */
export function openArmory(ctx: Ctx): void {
  ctx.s.armory = { open: true, touched: [] };
}

/** The next Act starts: the armory closes. */
export function closeArmory(ctx: Ctx): void {
  ctx.s.armory = { open: false, touched: [] };
}

/** A team's pieces in slot order (dead ones too: the armory works wherever a piece is). */
function piecesInSlotOrder(ctx: Ctx, team: PlayTeam): Unit[] {
  return ctx.s.teams[team].heroIds
    .map((id) => ctx.unit(id))
    .filter((u): u is Unit => !!u?.hero)
    .sort((a, b) => a.hero!.slot - b.hero!.slot);
}

/** The AI's break shop for a team; `skip` holds hero ids that keep their gold (White's touched). */
export function teamBreakShop(ctx: Ctx, team: PlayTeam, skip: readonly number[] = []): void {
  for (const u of piecesInSlotOrder(ctx, team)) if (!skip.includes(u.id)) breakShop(ctx, u);
}

function whitePiece(ctx: Ctx, heroId: number): Unit | null {
  const u = ctx.unit(heroId);
  return u && u.hero && u.team === 'A' ? u : null;
}

function atBreak(ctx: Ctx): string | null {
  return ctx.s.phase.kind === 'live' && ctx.s.bell.stage === 'break' && ctx.s.armory.open
    ? null
    : 'the armory is open only at the Act break';
}

function touch(ctx: Ctx, heroId: number): void {
  if (!ctx.s.armory.touched.includes(heroId)) ctx.s.armory.touched.push(heroId);
}

export function armoryBuy(ctx: Ctx, heroId: number, item: string): CommandResult {
  const closed = atBreak(ctx);
  if (closed) return { ok: false, reason: closed };
  const u = whitePiece(ctx, heroId);
  if (!u) return { ok: false, reason: 'not one of your pieces' };
  const r = buyItem(ctx, u, item, 'break');
  if (r.ok) touch(ctx, heroId);
  return r;
}

export function armorySell(ctx: Ctx, heroId: number, item: string): CommandResult {
  const closed = atBreak(ctx);
  if (closed) return { ok: false, reason: closed };
  const u = whitePiece(ctx, heroId);
  if (!u) return { ok: false, reason: 'not one of your pieces' };
  const r = sellItem(ctx, u, item, 'break');
  if (r.ok) touch(ctx, heroId);
  return r;
}

/** Why a plan is not valid, or null: exactly `shop.slots` distinct, sellable (non-cursed) item ids. */
export function planError(ctx: Ctx, plan: readonly string[]): string | null {
  if (plan.length !== ctx.t.shop.slots) return `a plan names ${ctx.t.shop.slots} items`;
  if (new Set(plan).size !== plan.length) return 'a plan names each item once';
  for (const id of plan) if (!ctx.c.itemById.has(id)) return `unknown item ${id}`;
  return null;
}

export function armorySetPlan(ctx: Ctx, heroId: number, plan: string[] | null): CommandResult {
  const closed = atBreak(ctx);
  if (closed) return { ok: false, reason: closed };
  const u = whitePiece(ctx, heroId);
  if (!u) return { ok: false, reason: 'not one of your pieces' };
  if (plan !== null) {
    const err = planError(ctx, plan);
    if (err) return { ok: false, reason: err };
  }
  u.hero!.plan = plan === null ? null : plan.slice();
  ctx.emit('planSet', { id: heroId, plan: plan === null ? null : plan.slice() });
  return { ok: true };
}

/** "Let the AI shop": the break shop now, for one White piece or all five. */
export function armoryAutoShop(ctx: Ctx, heroId: number | null): CommandResult {
  const closed = atBreak(ctx);
  if (closed) return { ok: false, reason: closed };
  if (heroId === null) {
    teamBreakShop(ctx, 'A');
    return { ok: true };
  }
  const u = whitePiece(ctx, heroId);
  if (!u) return { ok: false, reason: 'not one of your pieces' };
  breakShop(ctx, u);
  return { ok: true };
}

/** The price a piece would pay at the break (read-only, for the UI). */
export function armoryQuote(
  ctx: Ctx,
  heroId: number,
  item: string,
): { price: number; consumed: string[] } | { error: string } {
  const u = ctx.unit(heroId);
  if (!u?.hero) return { error: 'not a piece' };
  return quote(ctx, u, item, 'break');
}

/** Everything the Armory tab draws for one piece; null when the id is not a piece. */
export function armoryView(ctx: Ctx, heroId: number): ArmoryView | null {
  const u = ctx.unit(heroId);
  const h = u?.hero;
  if (!u || !h || u.team === 'neutral') return null;
  const open = armoryOpen(ctx);
  const plan = h.plan ?? pathListOf(ctx.c, h);
  const suggestion = open ? (nextPurchase(ctx, u, 'break')?.id ?? null) : null;
  const tiles: ArmoryTile[] = [];
  for (const it of [...ctx.c.items].sort((a, b) => a.tier - b.tier)) {
    const q = quote(ctx, u, it.id, 'break');
    const p = itemPrice(ctx, u, it.id)!;
    const blocked = 'error' in q ? q.error : null;
    tiles.push({
      id: it.id,
      name: it.name,
      tier: it.tier,
      category: it.category,
      cost: it.cost,
      price: p.price,
      parts: it.from.slice(),
      partsOwned: p.consumed,
      owned: h.items.includes(it.id),
      inPlan: plan.includes(it.id),
      suggested: suggestion === it.id,
      affordable: blocked === null && p.price <= h.gold,
      blocked,
    });
  }
  const sell: Record<string, number | null> = {};
  for (const id of h.items) sell[id] = sellRefund(ctx, id);
  return {
    heroId,
    piece: h.defId,
    gold: h.gold,
    items: h.items.slice(),
    slots: ctx.t.shop.slots,
    plan: plan.slice(),
    customPlan: h.plan !== null,
    planLeft: plan.filter((id) => !satisfied(ctx, u, id)),
    suggestion,
    touched: ctx.s.armory.touched.includes(heroId),
    sellRefund: sell,
    open,
    tiles,
  };
}
