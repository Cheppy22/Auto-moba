import type { Content } from './content/loader';
import type { AbilityDef, PerkDef, PieceDef, StyleDef } from './content/schema';
import type { HeroState, PerkRef, PlayTeam, Unit } from './types';
import type { Ctx } from './ctx';

export function pieceDef(c: Content, h: HeroState): PieceDef {
  return c.pieceById.get(h.defId)!;
}

export function styleDef(c: Content, h: HeroState): StyleDef {
  return c.styleByKey.get(`${h.defId}/${h.style}`)!;
}

/** The piece's four abilities: three base skills plus its style's signature. */
export function kitOf(c: Content, h: HeroState): AbilityDef[] {
  return c.kitByKey.get(`${h.defId}/${h.style}`)!;
}

/** The build list for the piece's current path (its style's list when the style has one). */
export function buildListOf(c: Content, h: HeroState): string[] {
  return styleDef(c, h).paths?.[h.path] ?? pieceDef(c, h).paths[h.path];
}

export function attackKindOf(c: Content, h: HeroState): 'melee' | 'ranged' {
  return styleDef(c, h).attackKind ?? pieceDef(c, h).attackKind;
}

export function perkOf(style: StyleDef, ref: PerkRef): PerkDef | undefined {
  if (ref.optionId !== null) {
    const opts = ref.rank === 4 ? style.forks['4'] : ref.rank === 8 ? style.forks['8'] : [];
    return opts.find((o) => o.id === ref.optionId);
  }
  const key = String(ref.rank) as keyof StyleDef['ranks'];
  return style.ranks[key];
}

export function perksOf(c: Content, h: HeroState): PerkDef[] {
  const st = styleDef(c, h);
  const out: PerkDef[] = [];
  for (const ref of h.perks) {
    const p = perkOf(st, ref);
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
