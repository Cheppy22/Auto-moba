import type { Content } from './content/loader';
import type { AbilityDef, PerkDef, PieceDef, StyleDef } from './content/schema';
import type { HeroState, PerkRef, PlayTeam, Unit } from './types';
import type { Ctx } from './ctx';

export function pieceDef(c: Content, h: HeroState): PieceDef {
  return c.pieceById.get(h.defId)!;
}

/** The piece's chosen archetype, or undefined while it is still generic (before Rank 4). */
export function styleDef(c: Content, h: HeroState): StyleDef | undefined {
  return h.style === null ? undefined : c.styleByKey.get(`${h.defId}/${h.style}`);
}

/** The piece's abilities: three base skills, plus its style's signature once it has one. */
export function kitOf(c: Content, h: HeroState): AbilityDef[] {
  return h.style === null ? pieceDef(c, h).abilities : c.kitByKey.get(`${h.defId}/${h.style}`)!;
}

/** The build list for the piece's current path (its style's list when the style has one). */
export function buildListOf(c: Content, h: HeroState): string[] {
  return styleDef(c, h)?.paths?.[h.path] ?? pieceDef(c, h).paths[h.path];
}

export function attackKindOf(c: Content, h: HeroState): 'melee' | 'ranged' {
  return styleDef(c, h)?.attackKind ?? pieceDef(c, h).attackKind;
}

/**
 * The bonus a perk reference stands for: the piece's generic bonus (Ranks 2-3), the style's rank
 * bonus (5-7) or the chosen Rank 8 option. Rank 4 is the archetype choice and has no bonus of its
 * own. Style bonuses are undefined until the style exists.
 */
export function perkOf(
  piece: PieceDef,
  style: StyleDef | undefined,
  ref: PerkRef,
): PerkDef | undefined {
  if (ref.rank === 2 || ref.rank === 3) return piece.generic[String(ref.rank) as '2' | '3'];
  if (!style || ref.rank === 4) return undefined;
  if (ref.optionId !== null)
    return ref.rank === 8 ? style.forks['8'].find((o) => o.id === ref.optionId) : undefined;
  return style.ranks[String(ref.rank) as keyof StyleDef['ranks']];
}

export function perksOf(c: Content, h: HeroState): PerkDef[] {
  const piece = pieceDef(c, h);
  const st = styleDef(c, h);
  const out: PerkDef[] = [];
  for (const ref of h.perks) {
    const p = perkOf(piece, st, ref);
    if (p) out.push(p);
  }
  return out;
}

/** The living (or dead) piece of a team, by piece id. */
export function teamPiece(ctx: Ctx, team: PlayTeam, piece: string): Unit | null {
  for (const id of ctx.s.teams[team].heroIds) {
    const u = ctx.unit(id);
    if (u?.hero && u.hero.defId === piece) return u;
  }
  return null;
}

const TEAM_NAME: Record<PlayTeam, string> = { A: 'White', B: 'Black' };

export function teamName(team: PlayTeam): string {
  return TEAM_NAME[team];
}
