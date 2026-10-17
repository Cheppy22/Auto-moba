import { abilityMods } from './combat';
import type { Stats } from './content/schema';
import type { Ctx } from './ctx';
import { kitOf, styleDef } from './pieces';
import { computeStats } from './stats';
import type { HeroState, Unit } from './types';

/** One ability's numbers as the piece would cast it now (Ranks, perks and cooldown reduction in). */
export interface AbilityNumbers {
  name: string;
  cooldownSec: number;
  range: number;
  radius: number;
  /** Damage, heal and shield multiplier from Rank bonuses (1 = none). */
  power: number;
}

/** What a fork option would change on a piece: its stats and the ability it adds or tweaks. */
export interface ForkPreview {
  before: Stats;
  after: Stats;
  /** Rank 4: the style's signature skill, the piece's new 4th ability. */
  signature: (AbilityNumbers & { desc: string }) | null;
  /** Rank 8: the ability the option tweaks, before and after (null when it tweaks none). */
  ability: { before: AbilityNumbers; after: AbilityNumbers } | null;
}

function numbers(ctx: Ctx, u: Unit, stats: Stats, idx: number): AbilityNumbers | null {
  const def = kitOf(ctx.c, u.hero!)[idx];
  if (!def) return null;
  const m = abilityMods(ctx, u, idx);
  return {
    name: def.name,
    cooldownSec: def.cooldownSec * m.cooldownMul * (1 - stats.cdr),
    range: def.range * m.rangeMul,
    radius: def.radius * m.radiusMul,
    power: m.powerMul,
  };
}

/**
 * Read-only: what taking one option of a pending fork would do to a piece, computed on a copy of
 * the piece with the option applied, so it uses exactly the sim's own stat rules. Null when the
 * piece has no such option.
 */
export function forkPreview(ctx: Ctx, heroId: number, optionId: string): ForkPreview | null {
  const u = ctx.unit(heroId);
  const h = u?.hero;
  if (!u || !h) return null;
  const fork = ctx.s.forks.find((f) => f.heroId === heroId);
  const rank = fork?.rank ?? (h.style === null ? 4 : 8);
  if (rank === 4 && !ctx.c.styleByKey.has(`${h.defId}/${optionId}`)) return null;
  if (rank === 8 && !styleDef(ctx.c, h)?.forks['8'].some((o) => o.id === optionId)) return null;
  const hero: HeroState = {
    ...h,
    style: rank === 4 ? optionId : h.style,
    perks: [...h.perks, { rank, optionId }],
  };
  const copy: Unit = { ...u, hero };
  const before = computeStats(ctx, u).stats;
  const after = computeStats(ctx, copy).stats;
  let signature: ForkPreview['signature'] = null;
  let ability: ForkPreview['ability'] = null;
  if (rank === 4) {
    const sig = styleDef(ctx.c, hero)!.ability;
    const n = numbers(ctx, copy, after, 3);
    if (n) signature = { ...n, desc: sig.desc };
  } else {
    const opt = styleDef(ctx.c, h)!.forks['8'].find((o) => o.id === optionId)!;
    if (opt.ability !== undefined) {
      const b = numbers(ctx, u, before, opt.ability);
      const a = numbers(ctx, copy, after, opt.ability);
      if (b && a) ability = { before: b, after: a };
    }
  }
  return { before, after, signature, ability };
}
