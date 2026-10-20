// What each gambit card did per play and per Tempo, from balance-run files (`out/*.json`), set
// against what a pawn does for its 15 Tempo. Read-only; prints a table.
//
//   npx tsx tools/card-impact.ts out/balance-long-data0.json [more.json ...]
import { readFileSync } from 'node:fs';
import { loadNodeContent } from './content-node';
import type { CardImpact, MatchSummary } from './simulate';

const content = loadNodeContent();
const files = process.argv.slice(2);
const results: MatchSummary[] = files.flatMap(
  (f) => (JSON.parse(readFileSync(f, 'utf8')) as { results: MatchSummary[] }).results,
);
const sum: Record<string, CardImpact & { won: number }> = {};
for (const r of results) {
  for (const team of ['A', 'B'] as const) {
    for (const [id, x] of Object.entries(r.cardImpact?.[team] ?? {})) {
      const row = (sum[id] ??= {
        n: 0,
        bonus: 0,
        prevented: 0,
        healed: 0,
        structure: 0,
        kills: 0,
        deaths: 0,
        drained: 0,
        won: 0,
      });
      row.n += x.n;
      row.bonus += x.bonus;
      row.prevented += x.prevented;
      row.healed += x.healed;
      row.structure += x.structure;
      row.kills += x.kills;
      row.deaths += x.deaths;
      row.drained += x.drained;
      if (r.winner === team) row.won += x.n;
    }
  }
}
const lines = ['card | plays | cost | effect/play | effect/Tempo | kills-deaths/play | win% of plays'];
for (const [id, s] of Object.entries(sum).sort((a, b) => b[1].n - a[1].n)) {
  const cost = content.gambitById.get(id)?.cost ?? 0;
  const eff = (s.bonus + s.prevented + s.healed) / s.n;
  lines.push(
    `${id} | ${s.n} | ${cost} | ${eff.toFixed(0)} | ${(eff / Math.max(1, cost)).toFixed(1)} | ${((s.kills - s.deaths) / s.n).toFixed(2)} | ${((100 * s.won) / s.n).toFixed(1)}`,
  );
}
process.stdout.write(lines.join('\n') + '\n');
