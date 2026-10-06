import { loadNodeContent } from './content-node';
import { simulateMatch } from './simulate';

const per = Number(process.argv[2] ?? 20);
const content = loadNodeContent();
const ids = content.heroes.map((h) => h.id);
const wins: Record<string, Record<string, { w: number; n: number; minutes: number }>> = {};
for (const a of ids) {
  wins[a] = {};
  for (const b of ids) wins[a][b] = { w: 0, n: 0, minutes: 0 };
}
let seed = 9000;
for (let i = 0; i < ids.length; i++) {
  for (let j = i + 1; j < ids.length; j++) {
    for (let k = 0; k < per; k++) {
      const swap = k % 2 === 1;
      const A = Array(5).fill(swap ? ids[j] : ids[i]);
      const B = Array(5).fill(swap ? ids[i] : ids[j]);
      const r = simulateMatch(content, seed++, 10, { A, B });
      const winnerHero = r.winner === 'A' ? A[0] : B[0];
      const loserHero = r.winner === 'A' ? B[0] : A[0];
      if (r.winner) {
        wins[winnerHero][loserHero].w++;
        wins[winnerHero][loserHero].n++;
        wins[loserHero][winnerHero].n++;
      }
      wins[ids[i]][ids[j]].minutes += r.minutes;
      wins[ids[j]][ids[i]].minutes += r.minutes;
    }
  }
}
console.log('| Row beats column | ' + ids.join(' | ') + ' |');
console.log('| --- | ' + ids.map(() => '---').join(' | ') + ' |');
for (const a of ids) {
  console.log(
    `| ${a} | ` +
      ids
        .map((b) =>
          a === b ? '-' : `${((100 * wins[a][b].w) / Math.max(1, wins[a][b].n)).toFixed(0)}%`,
        )
        .join(' | ') +
      ' |',
  );
}
