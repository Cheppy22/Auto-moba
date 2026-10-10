// Archetype check: for one piece, force White to each archetype at Rank 4 in turn (Black keeps its
// AI pick) and report White's win rate per style. Usage: tsx tools/pairwise.ts <piece> [matches per style]
import { loadNodeContent } from './content-node';
import type { PieceId } from '../src/sim';
import { simulateMatch } from './simulate';

const piece = (process.argv[2] ?? 'knight') as PieceId;
const per = Number(process.argv[3] ?? 40);
const content = loadNodeContent();
const def = content.pieceById.get(piece);
if (!def) throw new Error(`unknown piece ${piece}`);
console.log(`| ${def.name} style (White) | Matches | White win rate | Median min |`);
console.log('| --- | --- | --- | --- |');
for (const style of def.styles) {
  let w = 0;
  let n = 0;
  const mins: number[] = [];
  for (let k = 0; k < per; k++) {
    const seed = 9000 + k;
    const r = simulateMatch(content, seed, { forceStyles: { A: { [piece]: style.id } } });
    if (r.winner) {
      n++;
      if (r.winner === 'A') w++;
    }
    mins.push(r.minutes);
  }
  mins.sort((a, b) => a - b);
  console.log(
    `| ${style.name} | ${per} | ${((100 * w) / Math.max(1, n)).toFixed(1)}% | ${mins[Math.floor(mins.length / 2)].toFixed(1)} |`,
  );
}
