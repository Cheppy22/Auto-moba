import { pick, shuffle } from './core/rng';
import type { Ctx } from './ctx';
import { newUnit } from './units';
import type { Stats } from './content/schema';

export function createKeeper(ctx: Ctx): void {
  const stats: Stats = {
    maxHp: 1,
    hpRegen: 0,
    armor: 0,
    resist: 0,
    bladeDmg: 0,
    atkSpeed: 1,
    soulPower: 0,
    moveSpeed: 0,
    cdr: 0,
    range: 0,
    respawnMult: 1,
    incomeMult: 1,
    damageTakenMult: 1,
  };
  const spot = ctx.world.map.keeperSpots[0];
  const u = newUnit(ctx, 'keeper', 'neutral', 'keeper', spot.x, spot.y, stats);
  ctx.s.keeper = { unitId: u.id, spot: spot.id, stock: [] };
}

export function relocateKeeper(ctx: Ctx): void {
  const k = ctx.unit(ctx.s.keeper.unitId);
  if (!k) return;
  const spots = ctx.world.map.keeperSpots.filter((s) => s.id !== ctx.s.keeper.spot);
  const spot = pick(ctx.s.rng, 'keeper', spots);
  k.x = spot.x;
  k.y = spot.y;
  k.px = spot.x;
  k.py = spot.y;
  const pool = ctx.c.items.filter((i) => i.tier === 3).map((i) => i.id);
  const stock = shuffle(ctx.s.rng, 'keeper', pool).slice(0, ctx.t.shop.keeperStock);
  ctx.s.keeper = { unitId: k.id, spot: spot.id, stock };
  ctx.emit('keeperMoved', { spot: spot.id, x: spot.x, y: spot.y, stock });
}
