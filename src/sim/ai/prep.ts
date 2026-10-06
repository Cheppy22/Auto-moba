import { shuffle, pick } from '../core/rng';
import type { Ctx } from '../ctx';
import { aiBids } from '../auction';
import type { PlayTeam, Unit } from '../types';
import { aiShop } from './shopping';

export function offerUpgrades(ctx: Ctx, u: Unit): string[] {
  const h = u.hero!;
  const pool = (ctx.c.upgradesByHero.get(h.defId) ?? []).filter((x) => !h.upgrades.includes(x.id));
  return shuffle(ctx.s.rng, 'loot', pool)
    .slice(0, 3)
    .map((x) => x.id);
}

export function aiPickUpgrade(ctx: Ctx, u: Unit): void {
  const h = u.hero!;
  const pool = (ctx.c.upgradesByHero.get(h.defId) ?? []).filter((x) => !h.upgrades.includes(x.id));
  if (pool.length === 0) return;
  const up = pick(ctx.s.rng, 'ai', pool);
  h.upgrades.push(up.id);
  ctx.emit('upgradePick', { id: u.id, upgrade: up.id });
}

export function aiPrep(ctx: Ctx): void {
  const playerTeam = ctx.s.playerHeroId !== null ? ctx.unit(ctx.s.playerHeroId)?.team : null;
  for (const team of ['A', 'B'] as PlayTeam[]) {
    if (team !== playerTeam) aiBids(ctx, team);
  }
  for (const team of ['A', 'B'] as PlayTeam[]) {
    for (const id of ctx.s.teams[team].heroIds) {
      const u = ctx.unit(id);
      if (!u || !u.hero || u.hero.isPlayer) continue;
      aiPickUpgrade(ctx, u);
      aiShop(ctx, u);
    }
  }
}
