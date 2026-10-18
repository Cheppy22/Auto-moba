import { abilityMods } from './combat';
import type { Grade, Stats } from './content/schema';
import type { Ctx } from './ctx';
import { kitOf, styleDef } from './pieces';
import { computeStats } from './stats';
import { replacedBy, techniqueAbility, withTechnique } from './techniques';
import type { HeroState, TechniquePreview, Unit } from './types';

/** One ability's numbers as the piece would cast it now (Ranks, perks and cooldown reduction in). */
export interface AbilityNumbers {
  name: string;
  cooldownSec: number;
  range: number;
  radius: number;
  /** Damage, heal and shield multiplier from Rank bonuses (1 = none). */
  power: number;
}

/** What an archetype (the Rank 4 fork) would change on a piece: its stats and its new 4th skill. */
export interface ForkPreview {
  before: Stats;
  after: Stats;
  /** The style's signature skill, the piece's new 4th ability. */
  signature: (AbilityNumbers & { desc: string }) | null;
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
 * Read-only: what taking one archetype at the Rank 4 fork would do to a piece, computed on a copy
 * of the piece with the style applied, so it uses exactly the sim's own stat rules. Null when the
 * piece has no such style or already has one.
 */
export function forkPreview(ctx: Ctx, heroId: number, optionId: string): ForkPreview | null {
  const u = ctx.unit(heroId);
  const h = u?.hero;
  if (!u || !h || h.style !== null) return null;
  if (!ctx.c.styleByKey.has(`${h.defId}/${optionId}`)) return null;
  const hero: HeroState = { ...h, style: optionId, perks: [...h.perks, { rank: 4, optionId }] };
  const copy: Unit = { ...u, hero };
  const before = computeStats(ctx, u).stats;
  const after = computeStats(ctx, copy).stats;
  const sig = styleDef(ctx.c, hero)!.ability;
  const n = numbers(ctx, copy, after, 3);
  return { before, after, signature: n ? { ...n, desc: sig.desc } : null };
}

/**
 * Read-only: what taking a Technique at a grade would do to a piece, computed on a copy of the
 * piece holding it (the slot's old Technique gone), with the sim's own stat and skill rules. Null
 * when the id is not a piece or not a Technique.
 */
export function techniquePreview(
  ctx: Ctx,
  heroId: number,
  techniqueId: string,
  grade: Grade,
): TechniquePreview | null {
  const u = ctx.unit(heroId);
  const h = u?.hero;
  const def = ctx.c.techniqueById.get(techniqueId);
  if (!u || !h || !def) return null;
  const held = h.techniques;
  const old = replacedBy(ctx.c, held, techniqueId);
  const hero: HeroState = { ...h, techniques: withTechnique(ctx.c, held, techniqueId, grade) };
  const copy: Unit = { ...u, hero };
  const before = computeStats(ctx, u).stats;
  const after = computeStats(ctx, copy).stats;
  const idx = techniqueAbility(def);
  let ability: TechniquePreview['ability'] = null;
  if (idx !== null) {
    const b = numbers(ctx, u, before, idx);
    const a = numbers(ctx, copy, after, idx);
    if (b && a) ability = { before: b, after: a };
  }
  let estimate: TechniquePreview['estimate'] = null;
  const est = def.estimate;
  if (est) {
    const last = ctx.s.builds.lastPieces[String(heroId)]?.[est.count] ?? 0;
    estimate = { count: est.count, last, value: Math.round(last / est.per), label: est.label };
  }
  return { before, after, ability, replaces: old ? old.id : null, estimate };
}
