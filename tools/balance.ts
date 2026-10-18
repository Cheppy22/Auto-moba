import { mkdirSync, writeFileSync } from 'node:fs';
import { cpus } from 'node:os';
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';
import { report } from './report';
import type { RelicMode } from '../src/sim';
import { PLAN_PRESETS, type MatchSummary, type PlanPreset } from './simulate';

function arg(name: string, def: number): number {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? Number(process.argv[i + 1]) : def;
}
const flag = (name: string): boolean => process.argv.includes(`--${name}`);

const total = arg('matches', 1000);
const startSeed = arg('seed', 1);
const workers = Math.max(1, Math.min(arg('workers', cpus().length), total));
// --no-gambits-A: White never plays gambits or fields pawns (measures what the Tempo system is worth).
const noGambitsA = flag('no-gambits-A');
// --no-gambits-B: the same for Black (both flags = a Tempo-free control run).
const noGambitsB = flag('no-gambits-B');
// --schools a,b: restrict both decks to the cards of those schools (march, initiative, fortress,
// sacrifice, position, clock). Workers read it from the environment.
const schoolsIdx = process.argv.indexOf('--schools');
const schools = schoolsIdx >= 0 ? process.argv[schoolsIdx + 1] : '';
if (schools) process.env.BALANCE_SCHOOLS = schools;
// --relics A=ai|none|random,B=...: how each side drafts relics at the Act breaks (default both ai).
const relicsIdx = process.argv.indexOf('--relics');
const relicsSpec = relicsIdx >= 0 ? process.argv[relicsIdx + 1] : '';
const relics: { A?: RelicMode; B?: RelicMode } = {};
for (const part of relicsSpec.split(',').filter(Boolean)) {
  const [side, mode] = part.split('=');
  if ((side !== 'A' && side !== 'B') || !['ai', 'none', 'random'].includes(mode))
    throw new Error(`--relics expects A=ai|none|random,B=...: got "${part}"`);
  relics[side] = mode as RelicMode;
}
// --relic-pool lane|carry|pawns|siege|orders: the draft offers only that family's relics.
const poolIdx = process.argv.indexOf('--relic-pool');
const relicPool = poolIdx >= 0 ? process.argv[poolIdx + 1] : '';
if (relicPool) process.env.BALANCE_RELIC_POOL = relicPool;

// --white-player: White plays like the browser's player (standing pawn plan 2 / 2 / 2 fields its
// pawns; a stand-in plays the AI's best card each second). With --no-gambits-A it plays no cards.
const whitePlayer = flag('white-player');
// --white-every S: with --white-player, the stand-in plays at most one card per S seconds (a
// person who checks the hand now and then; default 0 = whenever a card fits).
const whiteEvery = arg('white-every', 0);

// --map long: play every match on the Long Board (output files get a -long suffix).
const mapIdx = process.argv.indexOf('--map');
const map = mapIdx >= 0 && process.argv[mapIdx + 1] === 'long' ? ('long' as const) : undefined;

// --pace blitz: every match plays Blitz (at most 3 Acts, adjudicated; output files get a -blitz suffix).
const paceIdx = process.argv.indexOf('--pace');
const pace = paceIdx >= 0 && process.argv[paceIdx + 1] === 'blitz' ? ('blitz' as const) : undefined;

// --plans A=mind-queen|body-rook|stack: White's pieces buy by a fixed greedy plan (Black stays AI).
const plansIdx = process.argv.indexOf('--plans');
const plansSpec = plansIdx >= 0 ? process.argv[plansIdx + 1] : '';
const plans = plansSpec ? (plansSpec.replace(/^A=/, '') as PlanPreset) : undefined;
if (plans && !PLAN_PRESETS.includes(plans))
  throw new Error(`--plans expects A=${PLAN_PRESETS.join('|')}: got "${plansSpec}"`);

// --techniques: both sides play piece builds (SPEC-PIECE-BUILDS-2026-10-18; items stay on).
// --no-items: nothing is bought and Ranks grow by `builds.rankGrowth` (the items-retired curve).
const techniques = flag('techniques');
const noItems = flag('no-items');

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
          [
            '--import',
            'tsx',
            workerPath,
            JSON.stringify({
              seeds: mine,
              noGambitsA,
              noGambitsB,
              relics,
              map,
              whitePlayer,
              whiteEvery,
              plans,
              pace,
              techniques,
              noItems,
            }),
          ],
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
  const { md, stats } = report(results, { noGambitsA, noGambitsB, whitePlayer, whiteEvery });
  const dir = new URL('../out/', import.meta.url);
  mkdirSync(dir, { recursive: true });
  const base0 =
    noGambitsA || noGambitsB
      ? `balance-no-gambits-${noGambitsA ? 'A' : ''}${noGambitsB ? 'B' : ''}`
      : 'balance';
  const base = whitePlayer ? `${base0}-player${whiteEvery ? whiteEvery : ''}` : base0;
  const withSchools = schools
    ? `${base}-${schools.replace(/[^a-z,]/g, '').replace(/,/g, '-')}`
    : base;
  const withPool = relicPool ? `${withSchools}-pool-${relicPool}` : withSchools;
  const withRelics = relicsSpec
    ? `${withPool}-relics-${relicsSpec.replace(/[^A-Za-z]/g, '')}`
    : withPool;
  const withPlans = plans ? `${withRelics}-plans-${plans}` : withRelics;
  const withMap0 = map ? `${withPlans}-long` : withPlans;
  const withMap1 = pace ? `${withMap0}-blitz` : withMap0;
  const withMap = `${withMap1}${techniques ? '-techniques' : ''}${noItems ? '-no-items' : ''}`;
  // --tag NAME: appended to the output file name, so parallel runs do not overwrite each other.
  const tagIdx = process.argv.indexOf('--tag');
  const name = tagIdx >= 0 ? `${withMap}-${process.argv[tagIdx + 1]}` : withMap;
  writeFileSync(new URL(`${name}.json`, dir), JSON.stringify({ stats, results }, null, 1));
  writeFileSync(new URL(`${name}.md`, dir), md);
  process.stdout.write(md);
  process.stderr.write(
    `\n${total} matches in ${((Date.now() - t0) / 1000).toFixed(0)} s on ${workers} workers\n`,
  );
}

void main();
