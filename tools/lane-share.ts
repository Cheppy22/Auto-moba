// Lane-share measurement: where (nearest lane) do hero fights, kills, tower damage, hero time and
// minion combat happen? Usage: tsx tools/lane-share.ts [--matches 100] [--seed 1] [--workers 4] [--json]
import { spawn } from 'node:child_process';
import { cpus } from 'node:os';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';
import { Match, type Content } from '../src/sim';
import { closestLane } from '../src/sim/ai/lanes';
import { loadNodeContent } from './content-node';

const LANE_IDS = ['top', 'mid', 'bot'] as const;
type Lane = (typeof LANE_IDS)[number];
export const METRICS = [
  'heroDamage',
  'heroKills',
  'towerDamage',
  'heroTime',
  'minionFight',
] as const;
export type Metric = (typeof METRICS)[number];
export type LaneShare = Record<Metric, Record<Lane, number>>;

const zero = (): LaneShare => {
  const o = {} as LaneShare;
  for (const m of METRICS) o[m] = { top: 0, mid: 0, bot: 0 };
  return o;
};

export function measureLaneShare(content: Content, seed: number, maxPhases = 10): LaneShare {
  const out = zero();
  const m = Match.create(content, { seed, autoGambits: { A: true, B: true } });
  const ctx = m.ctx;
  const tps = content.tuning.tickRate;
  let seen = 0;
  // Positions within 220 of either base (all lanes converge there) belong to no lane.
  const laneOf = (u: { x: number; y: number }): Lane | null => {
    for (const b of [ctx.world.basePos.A, ctx.world.basePos.B])
      if (Math.hypot(u.x - b.x, u.y - b.y) < 220) return null;
    return closestLane(ctx, u as never);
  };
  const at = (id: number): Lane | null => {
    const u = m.unitById(id);
    return u ? laneOf(u) : null;
  };
  const drain = (): void => {
    const ev = m.events;
    for (; seen < ev.length; seen++) {
      const e = ev[seen];
      if (e.type === 'damage') {
        const p = e.payload;
        if (p.srcKind === 'hero' && p.tgtKind === 'hero') {
          const l = at(p.tgt);
          if (l) out.heroDamage[l] += p.amount;
        } else if (p.srcKind === 'hero' && p.tgtKind === 'tower') {
          const l = at(p.tgt);
          if (l) out.towerDamage[l] += p.amount;
        }
      } else if (e.type === 'death' && e.payload.kind === 'hero') {
        const l = at(e.payload.id);
        if (l) out.heroKills[l] += 1;
      }
    }
  };
  for (let guard = 0; guard < maxPhases * 3 + 6; guard++) {
    const s = m.state;
    if (s.phase.kind === 'end') break;
    if (s.phase.kind === 'live') {
      const total = content.tuning.phaseSeconds * tps + 5;
      for (let t = 0; t < total && m.state.phase.kind === 'live'; t += tps) {
        m.step(tps);
        drain();
        for (const u of m.state.units) {
          if (!u.alive || u.team === 'neutral') continue;
          if (u.kind === 'hero') {
            const l = laneOf(u);
            if (l) out.heroTime[l] += 1;
          } else if (u.kind === 'minion' && u.targetId !== null) {
            const l = laneOf(u);
            if (l) out.minionFight[l] += 1;
          }
        }
      }
      continue;
    }
    if (s.phase.n > maxPhases) break;
    if (!m.issue({ type: 'setupTeam', pieces: m.defaultSetup() }).ok) break;
  }
  drain();
  return out;
}

const arg = (name: string, def: number): number => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? Number(process.argv[i + 1]) : def;
};

async function main(): Promise<void> {
  const total = arg('matches', 100);
  const start = arg('seed', 1);
  const workers = Math.max(1, Math.min(arg('workers', cpus().length), total));
  const sum = zero();
  const self = fileURLToPath(import.meta.url);
  await Promise.all(
    Array.from({ length: workers }, (_, w) => {
      const mine = Array.from({ length: total }, (_x, i) => start + i).filter(
        (_s, i) => i % workers === w,
      );
      return new Promise<void>((resolve, reject) => {
        const child = spawn(
          process.execPath,
          ['--import', 'tsx', self, '--worker', JSON.stringify(mine)],
          {
            stdio: ['ignore', 'pipe', 'inherit'],
          },
        );
        createInterface({ input: child.stdout }).on('line', (line) => {
          if (!line.trim()) return;
          const r = JSON.parse(line) as LaneShare;
          for (const k of METRICS) for (const l of LANE_IDS) sum[k][l] += r[k][l];
        });
        child.on('error', reject);
        child.on('close', (c) => (c === 0 ? resolve() : reject(new Error(`worker ${c}`))));
      });
    }),
  );
  console.log(`Lane share over ${total} matches (seeds ${start}..${start + total - 1})`);
  console.log('| metric | top | mid | bot |\n| --- | --- | --- | --- |');
  for (const k of METRICS) {
    const t = LANE_IDS.reduce((a, l) => a + sum[k][l], 0) || 1;
    console.log(
      `| ${k} | ${LANE_IDS.map((l) => ((100 * sum[k][l]) / t).toFixed(1) + '%').join(' | ')} |`,
    );
  }
}

if (process.argv[2] === '--worker') {
  const content = loadNodeContent();
  for (const seed of JSON.parse(process.argv[3]) as number[])
    process.stdout.write(JSON.stringify(measureLaneShare(content, seed)) + '\n');
} else if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  void main();
}
