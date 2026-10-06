import { loadNodeContent } from './content-node';
import { simulateMatch } from './simulate';

const content = loadNodeContent();
const seeds = JSON.parse(process.argv[2] ?? '[]') as number[];
for (const seed of seeds) {
  process.stdout.write(JSON.stringify(simulateMatch(content, seed)) + '\n');
}
