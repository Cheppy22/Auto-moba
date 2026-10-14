// Headless Tournament runs (spec 1B): plays whole runs on the Long Board and prints how far each
// got. `npm run tournament -- --runs 20 --seed 29000 [--white-player]`. White picks rewards by
// the AI rule and keeps its archetypes. With `--white-player` White plays as the browser's
// stand-in player (standing pawn plan 2/2/2, the AI's best card at most once a second) instead of
// the full AI. A sanity tool for now; phase 4 adds the balance runs.
import { loadNodeContent } from './content-node';
import {
  aiReward,
  applyReward,
  beginMatch,
  Match,
  nextMatchConfig,
  newRun,
  outcomeOf,
  recordResult,
  roundName,
  type RunState,
} from '../src/sim';
import { aiCardPick } from '../src/sim/gambits';

const arg = (name: string, fallback: number): number => {
  const i = process.argv.indexOf(name);
  return i >= 0 ? Number(process.argv[i + 1]) : fallback;
};
const runs = arg('--runs', 20);
const seed0 = arg('--seed', 29000);
const whitePlayer = process.argv.includes('--white-player');
const content = loadNodeContent();
const TPS = content.tuning.tickRate;

function playMatch(run: RunState): Match {
  const cfg = nextMatchConfig(content, run, true);
  const m = Match.create(content, {
    ...cfg,
    map: 'long',
    autoGambits: { A: !whitePlayer, B: true },
    autoForks: { A: true, B: true },
  });
  if (whitePlayer) m.issue({ type: 'setPawnPlan', quota: { top: 2, mid: 2, bot: 2 } });
  const act = content.tuning.phaseSeconds * TPS;
  while (m.state.phase.kind === 'live' && m.state.phase.n <= 12) {
    if (!whitePlayer) {
      if (m.step(act) === 0) break;
      continue;
    }
    if (m.state.tick % TPS === 5) {
      const best = aiCardPick(m.ctx, 'A');
      if (best) m.issue({ type: 'playGambit', slot: best.slot, ...best.plan.target });
    }
    if (m.step(1) === 0) break;
  }
  return m;
}

const perRound = [0, 1, 2, 3].map(() => ({ played: 0, won: 0, adjudicated: 0, minutes: 0 }));
let champions = 0;
const t0 = Date.now();
for (let k = 0; k < runs; k++) {
  let run = newRun(content, seed0 + k);
  const line: string[] = [];
  while (run.status === 'between') {
    const begun = beginMatch(content, run, run.court);
    if (!begun.ok) throw new Error(begun.reason);
    const round = begun.run.round;
    const m = playMatch(begun.run);
    run = recordResult(content, begun.run, outcomeOf(m));
    const r = run.results[run.results.length - 1];
    const pr = perRound[round];
    pr.played++;
    if (r.won) pr.won++;
    if (r.adjudicated) pr.adjudicated++;
    pr.minutes += r.minutes;
    line.push(`${roundName(content, round)} ${r.won ? 'W' : 'L'}${r.adjudicated ? '*' : ''}`);
    if (run.offers) {
      const pick = aiReward(content, run);
      if (!pick) throw new Error('no reward to pick');
      const next = applyReward(content, run, pick);
      if (!next.ok) throw new Error(next.reason);
      run = next.run;
    }
  }
  if (run.status === 'champion') champions++;
  console.log(
    `run ${seed0 + k}: ${line.join(', ')} -> ${run.status}; relics ${run.relics.length}, heirlooms ${Object.keys(run.heirlooms).length}, books ${run.books.length}`,
  );
}
console.log(`\n${runs} runs, ${whitePlayer ? 'stand-in player' : 'AI'} White, seeds from ${seed0}`);
for (const [i, r] of perRound.entries()) {
  if (r.played === 0) continue;
  console.log(
    `${roundName(content, i).padEnd(9)} played ${r.played}, won ${r.won} (${((100 * r.won) / r.played).toFixed(0)}%), adjudicated ${r.adjudicated}, mean ${(r.minutes / r.played).toFixed(1)} min`,
  );
}
console.log(`champions ${champions} of ${runs}; ${((Date.now() - t0) / 1000).toFixed(0)} s`);
