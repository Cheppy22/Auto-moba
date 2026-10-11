// Determinism baseline: fixed seeds, AI vs AI, default White setup, relics on and off.
// `npm run baseline` compares against tests/baseline.expected.json and exits 1 on any difference.
// `npm run baseline -- --write` rewrites the expected file (only for an intentional behaviour change).
import { readFileSync, writeFileSync } from 'node:fs';
import { loadNodeContent } from './content-node';
import { Match, hashContent } from '../src/sim';
import type { MatchConfig } from '../src/sim';

const EXPECTED = new URL('../tests/baseline.expected.json', import.meta.url);

interface Row {
  variant: string;
  seed: number;
  winner: string | null;
  act: number;
  tick: number;
  events: number;
  samples: number;
  logHash: string;
  stateHash: string;
  snapHash: string;
}

const SEEDS = [1, 2, 3, 11, 29000];
const VARIANTS: { name: string; cfg: Partial<MatchConfig> }[] = [
  { name: 'default', cfg: {} },
  { name: 'relicsOff', cfg: { relics: { A: 'none', B: 'none' } } },
];

/**
 * The state and snapshot hashes ignore `auction` (state) and `holy` (snapshot units): both are
 * removed in cleanup Phase 2, and nothing else may change. The log hash covers every event.
 */
function withoutKeys(value: unknown, drop: (copy: Record<string, unknown>) => void): unknown {
  const copy = JSON.parse(JSON.stringify(value)) as Record<string, unknown>;
  drop(copy);
  return copy;
}
const coreState = (state: unknown): unknown =>
  withoutKeys(state, (c) => {
    delete c.auction;
  });
const coreSnapshot = (snap: unknown): unknown =>
  withoutKeys(snap, (c) => {
    for (const u of c.units as Record<string, unknown>[]) delete u.holy;
  });

const content = loadNodeContent();
const rows: Row[] = [];
const msPerTick: number[] = [];
for (const v of VARIANTS) {
  for (const seed of SEEDS) {
    const t0 = process.hrtime.bigint();
    const m = Match.create(content, { seed, autoGambits: { A: true, B: true }, ...v.cfg });
    if (m.state.phase.kind === 'setup') m.issue({ type: 'setupTeam', ...m.defaultSetup() });
    m.runToEnd(12);
    msPerTick.push(Number(process.hrtime.bigint() - t0) / 1e6 / m.state.tick);
    rows.push({
      variant: v.name,
      seed,
      winner: m.state.winner,
      act: m.state.phase.n,
      tick: m.state.tick,
      events: m.events.length,
      samples: m.samples.length,
      logHash: hashContent({ e: m.events, s: m.samples }),
      stateHash: hashContent(coreState(m.state)),
      snapHash: hashContent(coreSnapshot(m.snapshot())),
    });
  }
}

if (process.argv.includes('--write')) {
  writeFileSync(EXPECTED, JSON.stringify(rows, null, 2) + '\n');
  console.log(`wrote ${rows.length} rows to tests/baseline.expected.json`);
  process.exit(0);
}

const expected = JSON.parse(readFileSync(EXPECTED, 'utf8')) as Row[];
let bad = expected.length === rows.length ? 0 : 1;
rows.forEach((r, i) => {
  const same = JSON.stringify(r) === JSON.stringify(expected[i]);
  if (!same) bad++;
  console.log(
    `${same ? 'ok  ' : 'DIFF'} ${r.variant.padEnd(9)} seed ${String(r.seed).padEnd(5)} ` +
      `winner ${r.winner} act ${r.act} tick ${r.tick} log ${r.logHash} state ${r.stateHash} ` +
      `snap ${r.snapHash} (${msPerTick[i].toFixed(3)} ms/tick)`,
  );
  if (!same) console.log(`     expected ${JSON.stringify(expected[i])}`);
});
console.log(bad === 0 ? 'baseline: identical' : `baseline: ${bad} difference(s)`);
process.exit(bad === 0 ? 0 : 1);
