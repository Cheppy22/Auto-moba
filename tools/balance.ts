import { mkdirSync, writeFileSync } from 'node:fs';
import { cpus } from 'node:os';
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';
import { loadNodeContent } from './content-node';
import type { MatchSummary } from './simulate';

function arg(name: string, def: number): number {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? Number(process.argv[i + 1]) : def;
}
const flag = (name: string): boolean => process.argv.includes(`--${name}`);

const total = arg('matches', 1000);
const startSeed = arg('seed', 1);
const workers = Math.max(1, Math.min(arg('workers', cpus().length), total));
const content = loadNodeContent();

const pct = (n: number, d: number): string => (d === 0 ? 'n/a' : `${((100 * n) / d).toFixed(1)}%`);
const median = (xs: number[]): number => {
  const s = xs.slice().sort((a, b) => a - b);
  return s.length
    ? s.length % 2
      ? s[(s.length - 1) / 2]
      : (s[s.length / 2 - 1] + s[s.length / 2]) / 2
    : 0;
};
const quant = (xs: number[], q: number): number => {
  const s = xs.slice().sort((a, b) => a - b);
  return s.length ? s[Math.min(s.length - 1, Math.floor(q * s.length))] : 0;
};

export function report(results: MatchSummary[]): { md: string; stats: Record<string, unknown> } {
  const n = results.length;
  const finished = results.filter((r) => r.winner !== null);
  const lengths = finished.map((r) => r.minutes);
  const lines: string[] = [];
  lines.push(`# Balance report`);
  lines.push('');
  lines.push(
    `- Matches: ${n} (seeds ${results[0]?.seed}..${results[n - 1]?.seed}), finished with a winner: ${pct(finished.length, n)}`,
  );
  lines.push(
    `- Team A win rate: ${pct(finished.filter((r) => r.winner === 'A').length, finished.length)}`,
  );
  lines.push(
    `- Match length (min): median ${median(lengths).toFixed(1)}, p10 ${quant(lengths, 0.1).toFixed(1)}, p90 ${quant(lengths, 0.9).toFixed(1)}, max ${Math.max(0, ...lengths).toFixed(1)}`,
  );
  const phaseHist: Record<number, number> = {};
  for (const r of finished) phaseHist[r.phases] = (phaseHist[r.phases] ?? 0) + 1;
  lines.push(
    `- Ended in phase: ${Object.entries(phaseHist)
      .map(([k, v]) => `${k}: ${pct(v, finished.length)}`)
      .join(', ')}`,
  );
  lines.push(
    `- Compute: ${(results.reduce((a, r) => a + r.ms, 0) / n / 1000).toFixed(2)} s per match, ${(results.reduce((a, r) => a + r.ms / Math.max(1, r.ticks), 0) / n).toFixed(3)} ms per tick`,
  );
  lines.push(
    `- Kills per match: ${(results.reduce((a, r) => a + r.kills.A + r.kills.B, 0) / n).toFixed(1)}, towers per match: ${(results.reduce((a, r) => a + r.towers.A + r.towers.B, 0) / n).toFixed(1)}, first tower at ${median(results.map((r) => r.firstTowerMinute ?? 99)).toFixed(1)} min (median)`,
  );
  lines.push('');
  lines.push('## Hero win rates (share of appearances on the winning team)');
  lines.push('');
  lines.push('| Hero | Appearances | Win rate | K | D | A | Gold |');
  lines.push('| --- | --- | --- | --- | --- | --- | --- |');
  const heroStats: Record<
    string,
    { n: number; w: number; k: number; d: number; a: number; g: number }
  > = {};
  const roleStats: Record<string, { n: number; w: number }> = {};
  const heroRole: Record<string, { n: number; w: number }> = {};
  for (const r of finished) {
    for (const h of r.heroes) {
      const s = (heroStats[h.def] ??= { n: 0, w: 0, k: 0, d: 0, a: 0, g: 0 });
      s.n++;
      s.w += h.won ? 1 : 0;
      s.k += h.kills;
      s.d += h.deaths;
      s.a += h.assists;
      s.g += h.goldEarned;
      const rs = (roleStats[h.role] ??= { n: 0, w: 0 });
      rs.n++;
      rs.w += h.won ? 1 : 0;
      const hr = (heroRole[`${h.def}/${h.role}`] ??= { n: 0, w: 0 });
      hr.n++;
      hr.w += h.won ? 1 : 0;
    }
  }
  const heroRates: Record<string, number> = {};
  for (const [id, s] of Object.entries(heroStats)) {
    heroRates[id] = s.w / s.n;
    lines.push(
      `| ${id} | ${s.n} | ${pct(s.w, s.n)} | ${(s.k / s.n).toFixed(1)} | ${(s.d / s.n).toFixed(1)} | ${(s.a / s.n).toFixed(1)} | ${Math.round(s.g / s.n)} |`,
    );
  }
  lines.push('');
  lines.push('## Win rate by lane');
  lines.push('');
  lines.push('| Lane | Appearances | Win rate |');
  lines.push('| --- | --- | --- |');
  for (const [role, s] of Object.entries(roleStats))
    lines.push(`| ${role} | ${s.n} | ${pct(s.w, s.n)} |`);
  lines.push('');
  lines.push('## Hero by lane');
  lines.push('');
  lines.push('| Hero / lane | Appearances | Win rate |');
  lines.push('| --- | --- | --- |');
  for (const [k, s] of Object.entries(heroRole).sort())
    lines.push(`| ${k} | ${s.n} | ${pct(s.w, s.n)} |`);
  lines.push('');
  lines.push('## Items (held at match end)');
  lines.push('');
  lines.push('| Item | Held by | Win rate when held |');
  lines.push('| --- | --- | --- |');
  const itemStats: Record<string, { n: number; w: number }> = {};
  for (const r of finished) {
    for (const h of r.heroes) {
      for (const id of new Set(h.items)) {
        const s = (itemStats[id] ??= { n: 0, w: 0 });
        s.n++;
        s.w += h.won ? 1 : 0;
      }
    }
  }
  for (const [id, s] of Object.entries(itemStats).sort((a, b) => b[1].n - a[1].n)) {
    lines.push(`| ${id} | ${s.n} | ${pct(s.w, s.n)} |`);
  }
  lines.push('');
  lines.push('## Curses, auction, comebacks, obelisks');
  lines.push('');
  const offered = results.reduce((a, r) => a + r.curses.offered, 0);
  const accepted = results.reduce((a, r) => a + r.curses.accepted, 0);
  const refused = results.reduce((a, r) => a + r.curses.refused, 0);
  const acceptedBy = results.flatMap((r) => r.curses.acceptedBy);
  lines.push(
    `- Curse offers: ${offered} (${(offered / n).toFixed(2)} per match); accepted ${pct(accepted, offered)}, refused ${pct(refused, offered)}`,
  );
  lines.push(
    `- Team win rate when its hero accepted a curse: ${pct(acceptedBy.filter((c) => c.won).length, acceptedBy.length)} (${acceptedBy.length} cases)`,
  );
  const byCurse: Record<string, { n: number; w: number }> = {};
  for (const c of acceptedBy) {
    const s = (byCurse[c.item] ??= { n: 0, w: 0 });
    s.n++;
    s.w += c.won ? 1 : 0;
  }
  for (const [id, s] of Object.entries(byCurse))
    lines.push(`  - ${id}: accepted ${s.n}, team won ${pct(s.w, s.n)}`);
  const auctions = finished.filter((r) => r.auction);
  lines.push(
    `- Auction winner also won the match: ${pct(auctions.filter((r) => r.auction!.won).length, auctions.length)} (${auctions.length} auctions)`,
  );
  const lead = finished.filter((r) => r.lead1);
  lines.push(
    `- Team ahead in net worth after phase 1 won: ${pct(lead.filter((r) => !r.comeback).length, lead.length)}; comeback rate ${pct(lead.filter((r) => r.comeback).length, lead.length)}`,
  );
  lines.push(
    `- Obelisks claimed per match: ${(results.reduce((a, r) => a + r.obelisks.A + r.obelisks.B, 0) / n).toFixed(2)}; camps cleared per match: ${(results.reduce((a, r) => a + r.campsCleared, 0) / n).toFixed(0)}`,
  );
  const holy: Record<string, { n: number; w: number }> = {};
  for (const r of auctions) {
    const s = (holy[r.auction!.holy] ??= { n: 0, w: 0 });
    s.n++;
    s.w += r.auction!.won ? 1 : 0;
  }
  for (const [id, s] of Object.entries(holy))
    lines.push(`  - ${id}: awarded ${s.n}, holder team won ${pct(s.w, s.n)}`);
  lines.push('');
  const outOfBand = Object.entries(heroRates).filter(([, r]) => r < 0.4 || r > 0.6);
  lines.push('## Targets');
  lines.push('');
  lines.push(
    `- Every hero within 40-60% win rate: ${outOfBand.length === 0 ? 'yes' : `NO (${outOfBand.map(([k, v]) => `${k} ${(v * 100).toFixed(1)}%`).join(', ')})`}`,
  );
  const med = median(lengths);
  lines.push(
    `- Median match length within 11-14 minutes: ${med >= 11 && med <= 14 ? 'yes' : 'NO'} (${med.toFixed(1)})`,
  );
  return {
    md: lines.join('\n') + '\n',
    stats: { matches: n, medianMinutes: med, heroRates, outOfBand: outOfBand.map(([k]) => k) },
  };
}

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
  void content;
}

void main();
