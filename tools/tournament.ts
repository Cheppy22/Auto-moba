// Headless Tournament runs (spec 1B): plays whole runs on the Long Board and prints how far each
// got. `npm run tournament -- --runs 200 --seed 29000 --white-player --white-every 60 --workers 3`.
// White picks rewards by the AI rule and keeps its archetypes. With `--white-player` White plays
// as the browser's stand-in player (standing pawn plan 2/2/2; the AI's best card at most once a
// second, or once per `--white-every S` seconds; `--no-cards` plays none) instead of the full AI.
// Prints win rates per round, champions, and how fast the relic row fills (the snowball check).
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';
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
const workers = Math.max(1, Math.min(arg('--workers', 1), runs));
const whitePlayer = process.argv.includes('--white-player');
const every = arg('--white-every', 0);
const noCards = process.argv.includes('--no-cards');
const quiet = process.argv.includes('--quiet');
// --ladder: a loss does not end the run; White carries on as if it had won (Spoils included), so
// every round is played by every run. The real run (up to its first loss) is reported as well.
const ladder = process.argv.includes('--ladder');
const content = loadNodeContent();
const TPS = content.tuning.tickRate;

/** One match of a run, as the report reads it. */
interface MatchRead {
  round: number;
  won: boolean;
  adjudicated: boolean;
  minutes: number;
  /** White's relics at the start and end of the match; Black's at the end. */
  relicsStartA: number;
  relicsEndA: number;
  relicsEndB: number;
  /** The Act in which White first held the run's cap (null: never this match). */
  capActA: number | null;
}
interface RunRead {
  seed: number;
  status: RunState['status'];
  matches: MatchRead[];
  picks: string[];
}

function playMatch(run: RunState): { m: Match; capAct: number | null } {
  const cfg = nextMatchConfig(content, run, true);
  const cap = cfg.relicMax ?? content.tuning.relics.max;
  const m = Match.create(content, {
    ...cfg,
    map: 'long',
    autoGambits: { A: !whitePlayer, B: true },
    autoForks: { A: true, B: true },
  });
  if (whitePlayer) m.issue({ type: 'setPawnPlan', quota: { top: 2, mid: 2, bot: 2 } });
  const act = content.tuning.phaseSeconds * TPS;
  let capAct: number | null = null;
  let lastPlay = -Infinity;
  while (m.state.phase.kind === 'live' && m.state.phase.n <= 12) {
    if (capAct === null && m.state.relics.held.A.length >= cap) capAct = m.state.phase.n;
    if (!whitePlayer || noCards) {
      if (m.step(act) === 0) break;
      continue;
    }
    const s = m.state;
    if (s.tick % TPS === 5 && s.tick - lastPlay >= every * TPS) {
      const best = aiCardPick(m.ctx, 'A');
      if (best && m.issue({ type: 'playGambit', slot: best.slot, ...best.plan.target }).ok)
        lastPlay = s.tick;
    }
    if (m.step(1) === 0) break;
  }
  return { m, capAct };
}

function playRun(seed: number): RunRead {
  let run = newRun(content, seed);
  const matches: MatchRead[] = [];
  const picks: string[] = [];
  while (run.status === 'between') {
    const begun = beginMatch(content, run, run.court);
    if (!begun.ok) throw new Error(begun.reason);
    const round = begun.run.round;
    const relicsStartA = begun.run.relics.length;
    const { m, capAct } = playMatch(begun.run);
    const relicsEndB = m.state.relics.held.B.length;
    const out = outcomeOf(m);
    const won = out.winner === 'A';
    run = recordResult(content, begun.run, ladder && !won ? { ...out, winner: 'A' } : out);
    const r = run.results[run.results.length - 1];
    matches.push({
      round,
      won,
      adjudicated: r.adjudicated,
      minutes: r.minutes,
      relicsStartA,
      relicsEndA: run.relics.length,
      relicsEndB,
      capActA: capAct,
    });
    if (run.offers) {
      const pick = aiReward(content, run);
      if (!pick) throw new Error('no reward to pick');
      const next = applyReward(content, run, pick);
      if (!next.ok) throw new Error(next.reason);
      run = next.run;
      picks.push(pick.kind);
    }
  }
  const lost = matches.findIndex((x) => !x.won);
  return { seed, status: lost >= 0 ? 'out' : 'champion', matches, picks };
}

const pct = (n: number, d: number): string => (d ? `${((100 * n) / d).toFixed(1)}%` : '—');
const mean = (xs: number[]): string =>
  xs.length ? (xs.reduce((a, b) => a + b, 0) / xs.length).toFixed(2) : '—';

/** The real run: its matches up to and including the first loss. */
const realMatches = (r: RunRead): MatchRead[] => {
  const lost = r.matches.findIndex((x) => !x.won);
  return lost >= 0 ? r.matches.slice(0, lost + 1) : r.matches;
};

function report(all: RunRead[], secs: number): void {
  all.sort((a, b) => a.seed - b.seed);
  const cap = content.tournament?.relicMax ?? 5;
  const who = !whitePlayer
    ? 'AI'
    : noCards
      ? 'idle stand-in (no cards)'
      : `stand-in (a card at most every ${every || 1} s)`;
  console.log(`\n${all.length} runs, ${who} White, seeds from ${seed0}`);
  roundTable(
    all.map((r) => realMatches(r)),
    cap,
    'Real runs (a loss ends the run)',
  );
  if (ladder)
    roundTable(
      all.map((r) => r.matches),
      cap,
      'Ladder (every run plays every round)',
    );
  const champs = all.filter((r) => r.status === 'champion').length;
  console.log(`\nChampions: ${champs} of ${all.length} (${pct(champs, all.length)})`);
  // Snowball: of the runs that reached round 2 (County), how many held the cap at its start, and
  // how many reached the cap during the Club or County match.
  const real = all.map((r) => ({ ...r, matches: realMatches(r) }));
  const county = real.filter((r) => r.matches.length >= 2);
  const capBy = (r: RunRead, round: number): boolean =>
    r.matches.some((x) => x.round <= round && (x.capActA !== null || x.relicsEndA >= cap));
  console.log(
    `Snowball (runs that reached County: ${county.length}): at the cap when County starts ${pct(county.filter((r) => r.matches[1].relicsStartA >= cap).length, county.length)}; cap reached during Club ${pct(county.filter((r) => capBy(r, 0)).length, county.length)}, by the end of County ${pct(county.filter((r) => capBy(r, 1)).length, county.length)}`,
  );
  const capActs = real.flatMap((r) => r.matches.filter((x) => x.round === 1 && x.capActA !== null));
  console.log(
    `County matches where White hits the cap mid-match: ${capActs.length}; Act (mean) ${mean(capActs.map((x) => x.capActA!))}`,
  );
  const picks = all.flatMap((r) => r.picks.slice(0, realMatches(r).length - 1));
  const kinds = ['relic', 'heirloom', 'book'].map(
    (k) => `${k} ${picks.filter((p) => p === k).length}`,
  );
  console.log(`Rewards picked (real runs): ${kinds.join(', ')}`);
  console.log(`${secs.toFixed(0)} s on ${workers} workers`);
}

function roundTable(runsMatches: MatchRead[][], cap: number, title: string): void {
  console.log(`\n${title}`);
  console.log(
    '\n| Round | Played | Won | Win % | Adjudicated | Mean min | White relics at start (mean / at cap) | White relics at end | Black relics at end |',
  );
  console.log('| --- | --- | --- | --- | --- | --- | --- | --- | --- |');
  for (let i = 0; i < 4; i++) {
    const ms = runsMatches.flatMap((ms) => ms.filter((x) => x.round === i));
    if (ms.length === 0) continue;
    const won = ms.filter((x) => x.won).length;
    console.log(
      `| ${roundName(content, i)} | ${ms.length} | ${won} | ${pct(won, ms.length)} | ${ms.filter((x) => x.adjudicated).length} | ${mean(ms.map((x) => x.minutes))} | ${mean(ms.map((x) => x.relicsStartA))} / ${pct(ms.filter((x) => x.relicsStartA >= cap).length, ms.length)} | ${mean(ms.map((x) => x.relicsEndA))} | ${mean(ms.map((x) => x.relicsEndB))} |`,
    );
  }
}

async function main(): Promise<void> {
  const workerArg = process.argv.indexOf('--worker-seeds');
  if (workerArg >= 0) {
    for (const seed of JSON.parse(process.argv[workerArg + 1]) as number[])
      process.stdout.write(JSON.stringify(playRun(seed)) + '\n');
    return;
  }
  const t0 = Date.now();
  const seeds = Array.from({ length: runs }, (_, i) => seed0 + i);
  const all: RunRead[] = [];
  const self = fileURLToPath(import.meta.url);
  const passOn = process.argv
    .slice(2)
    .filter((a, i, xs) => a !== '--workers' && xs[i - 1] !== '--workers');
  await Promise.all(
    Array.from({ length: workers }, (_, w) => {
      const mine = seeds.filter((_s, i) => i % workers === w);
      return new Promise<void>((resolve, reject) => {
        const child = spawn(
          process.execPath,
          ['--import', 'tsx', self, ...passOn, '--worker-seeds', JSON.stringify(mine)],
          { stdio: ['ignore', 'pipe', 'inherit'] },
        );
        createInterface({ input: child.stdout }).on('line', (line) => {
          if (!line.trim()) return;
          const r = JSON.parse(line) as RunRead;
          all.push(r);
          if (!quiet)
            console.log(
              `run ${r.seed}: ${r.matches.map((x) => `${roundName(content, x.round)} ${x.won ? 'W' : 'L'}${x.adjudicated ? '*' : ''}`).join(', ')} -> ${r.status}; picks ${r.picks.join(' ') || '—'}`,
            );
        });
        child.on('error', reject);
        child.on('close', (code) =>
          code === 0 ? resolve() : reject(new Error(`worker exited ${code}`)),
        );
      });
    }),
  );
  report(all, (Date.now() - t0) / 1000);
}

main().catch((e: unknown) => {
  console.error('tournament run failed:', e);
  process.exit(1);
});
