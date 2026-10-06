import { mkdirSync, writeFileSync } from 'node:fs';
import { cpus } from 'node:os';
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';
import { report } from './report';
import type { MatchSummary } from './simulate';

function arg(name: string, def: number): number {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? Number(process.argv[i + 1]) : def;
}
const flag = (name: string): boolean => process.argv.includes(`--${name}`);

const total = arg('matches', 1000);
const startSeed = arg('seed', 1);
const workers = Math.max(1, Math.min(arg('workers', cpus().length), total));

async function main(): Promise<void> {
  const seeds = Array.from({ length: total }, (_, i) => startSeed + i);
  const results: MatchSummary[] = [];
  const t0 = Date.now();
  const workerPath = fileURLToPath(new URL('./balance-worker.ts', import.meta.url));
  await Promise.all(
    Array.from({ length: workers }, (_, w) => {
      const mine = seeds.filter((_s, i) => i % workers === w);
      return new Promise<void>((resolve, reject) => {
        const child = spawn(
          process.execPath,
          ['--import', 'tsx', workerPath, JSON.stringify(mine)],
          {
            stdio: ['ignore', 'pipe', 'inherit'],
          },
        );
        createInterface({ input: child.stdout }).on('line', (line) => {
          if (!line.trim()) return;
          results.push(JSON.parse(line) as MatchSummary);
          if (!flag('quiet') && results.length % 25 === 0)
            process.stderr.write(`${results.length}/${total}\r`);
        });
        child.on('error', reject);
        child.on('close', (code) =>
          code === 0 ? resolve() : reject(new Error(`worker exited ${code}`)),
        );
      });
    }),
  );
  results.sort((a, b) => a.seed - b.seed);
  const { md, stats } = report(results);
  const dir = new URL('../out/', import.meta.url);
  mkdirSync(dir, { recursive: true });
  writeFileSync(new URL('balance.json', dir), JSON.stringify({ stats, results }, null, 1));
  writeFileSync(new URL('balance.md', dir), md);
  process.stdout.write(md);
  process.stderr.write(
    `\n${total} matches in ${((Date.now() - t0) / 1000).toFixed(0)} s on ${workers} workers\n`,
  );
}

void main();
