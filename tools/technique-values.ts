// Measures what each Technique is worth and writes `content/technique-values.json`, which the AI's
// card score reads (`builds.ai.value`). Input: one or more balance-run files (`out/*.json`, written
// by `npm run balance`). For every Technique and grade it compares how often the side of a piece
// that held it at the end won against what that grade usually wins (a Brilliant card is held more
// by winners, so each grade is measured against its own average), and shrinks the edge toward the
// Technique's own edge, and that toward 0, when few pieces held it.
//
//   npx tsx tools/technique-values.ts out/balance-long-data0.json [more.json ...] [--k 150]
import { readFileSync, writeFileSync } from 'node:fs';
import type { MatchSummary } from './simulate';

const GRADES = ['plain', 'sharp', 'brilliant'] as const;
/** Pieces of prior weight: an edge measured on K holders counts half. */
const kIdx = process.argv.indexOf('--k');
const K = kIdx >= 0 ? Number(process.argv[kIdx + 1]) : 150;
/** Value units: one unit is 10 win-rate points. */
const UNIT = 0.1;
/** No card is worth more than this either way, however lopsided its sample. */
const CAP = 2;

const files = process.argv
  .slice(2)
  .filter((a, i, all) => !a.startsWith('--') && all[i - 1] !== '--k');
if (files.length === 0) throw new Error('give one or more balance-run JSON files (out/*.json)');

const results: MatchSummary[] = files.flatMap(
  (f) => (JSON.parse(readFileSync(f, 'utf8')) as { results: MatchSummary[] }).results,
);
const finished = results.filter((r) => r.winner !== null);

type Row = { held: number[]; won: number[]; effect: number };
const rows = new Map<string, Row>();
const gradeHeld = [0, 0, 0];
const gradeWon = [0, 0, 0];
for (const r of finished) {
  for (const h of r.heroes) {
    for (const x of h.techniques) {
      const [id, grade] = x.split(':');
      const g = GRADES.indexOf(grade as (typeof GRADES)[number]);
      if (g < 0) continue;
      const row = rows.get(id) ?? { held: [0, 0, 0], won: [0, 0, 0], effect: 0 };
      rows.set(id, row);
      row.held[g]++;
      gradeHeld[g]++;
      if (h.won) {
        row.won[g]++;
        gradeWon[g]++;
      }
      row.effect += h.techEffect?.[id] ?? 0;
    }
  }
}
const base = gradeHeld.map((n, g) => (n > 0 ? gradeWon[g] / n : 0.5));
const round = (x: number): number => Math.round(x * 100) / 100;
const clamp = (x: number): number => Math.max(-CAP, Math.min(CAP, x));

const out: Record<string, { held: number; winRate: number; value: [number, number, number] }> = {};
const lines: string[] = [];
for (const id of [...rows.keys()].sort()) {
  const row = rows.get(id)!;
  const held = row.held.reduce((a, b) => a + b, 0);
  const won = row.won.reduce((a, b) => a + b, 0);
  // the win share its grade mix predicts, then the edge over it, shrunk toward 0
  const expected = row.held.reduce((a, n, g) => a + n * base[g], 0);
  const edge = (won - expected) / (held + K);
  const value = GRADES.map((_g, g) =>
    round(clamp((row.won[g] - row.held[g] * base[g] + K * edge) / (row.held[g] + K) / UNIT)),
  ) as [number, number, number];
  out[id] = { held, winRate: round(won / Math.max(1, held)), value };
  lines.push(
    `${id.padEnd(24)} held ${String(held).padStart(5)}  win ${((100 * won) / Math.max(1, held)).toFixed(1)}%  value ${value.join(' / ')}  effect/holder ${Math.round(row.effect / Math.max(1, held))}`,
  );
}
const source = `${finished.length} AI-vs-AI matches (${files.map((f) => f.split('/').pop()).join(', ')}), K ${K}; grade baselines ${base.map((b) => (100 * b).toFixed(1) + '%').join(' / ')}`;
writeFileSync(
  new URL('../content/technique-values.json', import.meta.url),
  JSON.stringify({ source, techniques: out }, null, 2) + '\n',
);
process.stdout.write(lines.join('\n') + `\n\n${source}\n`);
