import { loadNodeContent } from './content-node';
import { simulateMatch } from './simulate';

const content = loadNodeContent();
const job = JSON.parse(process.argv[2] ?? '{}') as {
  seeds?: number[];
  noGambitsA?: boolean;
  noGambitsB?: boolean;
};
for (const seed of job.seeds ?? []) {
  const r = simulateMatch(content, seed, {
    noGambitsA: job.noGambitsA,
    noGambitsB: job.noGambitsB,
  });
  process.stdout.write(JSON.stringify(r) + '\n');
}
