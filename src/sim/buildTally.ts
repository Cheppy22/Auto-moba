// What each Technique did (SPEC-PIECE-BUILDS 4.5 "What it did") and each piece's own counts for
// the cards' "last Act" lines. Runs only in a match with Techniques (`s.builds`); every hook is a
// no-op otherwise, so matches without them are unchanged.
import type { Ctx } from './ctx';
import { kitOf } from './pieces';
import { gradeMult, gradedTechnique, techniqueAbility } from './techniques';
import type { PieceTally, TechTally, Unit } from './types';

/** Trigger instances of a held Technique carry this source prefix (`tech:<id>`). */
export const TECH_SRC = 'tech:';
const TECH_ORIGIN = `item:${TECH_SRC}`;

const freshTech = (): TechTally => ({ damage: 0, heal: 0, shield: 0, procs: 0 });
export const freshPieceTally = (): PieceTally => ({
  hits: 0,
  pieceHits: 0,
  casts: 0,
  damage: 0,
  damageTaken: 0,
});

function techRows(ctx: Ctx, heroId: number, id: string): TechTally[] {
  const b = ctx.s.builds!;
  const key = `${heroId}:${id}`;
  return [(b.act[key] ??= freshTech()), (b.match[key] ??= freshTech())];
}

function pieceRow(ctx: Ctx, heroId: number): PieceTally {
  return (ctx.s.builds!.pieces[String(heroId)] ??= freshPieceTally());
}

/** The Technique an effect's origin belongs to: its own trigger, or its share of a skill it boosts. */
function credit(ctx: Ctx, src: Unit, origin: string, amount: number): [string, number][] {
  if (origin.startsWith(TECH_ORIGIN)) {
    const id = origin.slice(TECH_ORIGIN.length).split(':')[0];
    return [[id, amount]];
  }
  if (!origin.startsWith('ability:')) return [];
  const h = src.hero!;
  const held = h.techniques;
  if (!held || held.length === 0) return [];
  const idx = kitOf(ctx.c, h).findIndex((a) => `ability:${a.id}` === origin);
  if (idx < 0) return [];
  const out: [string, number][] = [];
  for (const t of held) {
    const def = ctx.c.techniqueById.get(t.id);
    if (!def || techniqueAbility(def) !== idx) continue;
    const mul = gradedTechnique(def, gradeMult(ctx.t, t.grade)).powerMul;
    // the share of the skill's power this Technique added
    if (mul > 1) out.push([t.id, amount * (1 - 1 / mul)]);
  }
  return out;
}

export function tallyDamage(
  ctx: Ctx,
  src: Unit | null,
  tgt: Unit,
  amount: number,
  origin: string,
): void {
  if (!ctx.s.builds || amount <= 0) return;
  if (tgt.hero) pieceRow(ctx, tgt.id).damageTaken += amount;
  if (!src?.hero || src.team === tgt.team) return;
  pieceRow(ctx, src.id).damage += amount;
  for (const [id, part] of credit(ctx, src, origin, amount))
    for (const row of techRows(ctx, src.id, id)) row.damage += part;
}

export function tallyHeal(ctx: Ctx, src: Unit | null, amount: number, origin: string): void {
  if (!ctx.s.builds || !src?.hero || amount <= 0) return;
  for (const [id, part] of credit(ctx, src, origin, amount))
    for (const row of techRows(ctx, src.id, id)) row.heal += part;
}

export function tallyShield(ctx: Ctx, src: Unit, amount: number, origin: string): void {
  if (!ctx.s.builds || !src.hero || amount <= 0) return;
  for (const [id, part] of credit(ctx, src, origin, amount))
    for (const row of techRows(ctx, src.id, id)) row.shield += part;
}

/** A held Technique's trigger fired. */
export function tallyProc(ctx: Ctx, u: Unit, src: string): void {
  if (!ctx.s.builds || !src.startsWith(TECH_SRC)) return;
  const id = src.slice(TECH_SRC.length).split(':')[0];
  for (const row of techRows(ctx, u.id, id)) row.procs += 1;
}

export function tallyHit(ctx: Ctx, a: Unit, t: Unit): void {
  if (!ctx.s.builds || !a.hero) return;
  const row = pieceRow(ctx, a.id);
  row.hits += 1;
  if (t.kind === 'hero') row.pieceHits += 1;
}

export function tallyCast(ctx: Ctx, u: Unit): void {
  if (!ctx.s.builds || !u.hero) return;
  pieceRow(ctx, u.id).casts += 1;
}
