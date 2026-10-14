import type { School } from './content/schema';

/** Which schools beat each school through their effects (docs/CHESS.md, "Gambit schools"). */
export const COUNTERED_BY: Record<School, School[]> = {
  march: ['fortress', 'position'],
  initiative: ['fortress'],
  fortress: ['sacrifice', 'initiative'],
  sacrifice: ['clock', 'position'],
  position: ['initiative'],
  clock: ['march'],
};

/**
 * How well one Opening's schools do against another's, by the setup page's verdicts
 * (`openingMatchups`): each of their schools counts +1 when more of ours counter it than it
 * counters, -1 the other way round, 0 when even. Positive: good against it.
 */
export function openingEdge(mine: readonly School[], theirs: readonly School[]): number {
  let n = 0;
  for (const t of theirs) {
    const wins = mine.filter((m) => COUNTERED_BY[t].includes(m)).length;
    const losses = mine.filter((m) => COUNTERED_BY[m].includes(t)).length;
    n += Math.sign(wins - losses);
  }
  return n;
}
