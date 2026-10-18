import type { Content, PieceId, School, TechTally } from '../../sim';

/** One Technique's counts for one piece, from a tally map (key `${heroId}:${techniqueId}`). */
export interface TallyRow {
  heroId: number;
  piece: PieceId;
  id: string;
  name: string;
  school: School;
  tally: TechTally;
}

export const zeroTally = (): TechTally => ({ damage: 0, heal: 0, shield: 0, procs: 0 });

/** What a Technique added in total: damage, healing and shields together. */
export const effectOf = (t: TechTally): number => t.damage + t.heal + t.shield;

/** True when the tally holds anything to show. */
export const counted = (t: TechTally): boolean => effectOf(t) >= 1 || t.procs > 0;

const n0 = (v: number): string => Math.round(v).toLocaleString('en-US');

/**
 * A tally in plain words: "1,840 damage · 320 healed · fired 9 times". A Technique that only
 * changes stats counts nothing, and says so.
 */
export function tallyText(t: TechTally, none = 'Nothing to count yet'): string {
  const parts: string[] = [];
  if (t.damage >= 1) parts.push(`${n0(t.damage)} damage`);
  if (t.heal >= 1) parts.push(`${n0(t.heal)} healed`);
  if (t.shield >= 1) parts.push(`${n0(t.shield)} shielded`);
  if (t.procs > 0) parts.push(t.procs === 1 ? 'fired once' : `fired ${n0(t.procs)} times`);
  return parts.length > 0 ? parts.join(' · ') : none;
}

/**
 * The rows of a tally map for the given pieces, strongest effect first. `pieceOf` says which piece
 * a hero id is (null for a unit that is not one of the pieces wanted).
 */
export function tallyRows(
  c: Content,
  map: Record<string, TechTally>,
  pieceOf: (heroId: number) => PieceId | null,
): TallyRow[] {
  const out: TallyRow[] = [];
  for (const [key, tally] of Object.entries(map)) {
    const [h, id] = key.split(':');
    const heroId = Number(h);
    const piece = pieceOf(heroId);
    const def = c.techniqueById.get(id);
    if (piece === null || !def) continue;
    out.push({ heroId, piece, id, name: def.name, school: def.school, tally });
  }
  return out.sort((a, b) => effectOf(b.tally) - effectOf(a.tally) || b.tally.procs - a.tally.procs);
}

/** The top `n` Techniques that counted anything. */
export const topRows = (rows: readonly TallyRow[], n = 3): TallyRow[] =>
  rows.filter((r) => counted(r.tally)).slice(0, n);
