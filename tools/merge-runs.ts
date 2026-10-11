import { readFileSync, writeFileSync } from 'node:fs';
import { report } from './report';
import type { MatchSummary } from './simulate';

// Merges JSON-lines match summaries (one `balance-worker.ts` output per file) into a balance report.
// Usage: tsx tools/merge-runs.ts out.json file1.jsonl file2.jsonl ...  (prints the markdown report)
const [outPath, ...files] = process.argv.slice(2);
const results: MatchSummary[] = [];
for (const f of files)
  for (const line of readFileSync(f, 'utf8').split('\n'))
    if (line.trim().startsWith('{')) results.push(JSON.parse(line) as MatchSummary);
results.sort((a, b) => a.seed - b.seed);
const { md, stats } = report(results, {});
writeFileSync(outPath, JSON.stringify({ stats, results }, null, 1));
process.stdout.write(md);
