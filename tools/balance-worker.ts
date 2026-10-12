import type { RelicMode } from '../src/sim';
import { loadNodeContent } from './content-node';
import { simulateMatch } from './simulate';

const content = loadNodeContent();
const job = JSON.parse(process.argv[2] ?? '{}') as {
  seeds?: number[];
  noGambitsA?: boolean;
  noGambitsB?: boolean;
  relics?: { A?: RelicMode; B?: RelicMode };
  map?: 'long';
};
for (const seed of job.seeds ?? []) {
  const r = simulateMatch(content, seed, {
    noGambitsA: job.noGambitsA,
    noGambitsB: job.noGambitsB,
    relics: job.relics,
    map: job.map,
  });
  process.stdout.write(JSON.stringify(r) + '\n');
}
