// Phase 0 of SPEC-PIECE-BUILDS-2026-10-18: what items add to a piece, per Act.
// For each piece at the start of every Act after the first (after the break shop) and at match end,
// compares its stats with and without its items (cursed ones included), on the sim's own stat rules.
// Then it finds the Rank growth that would give the same health and main damage with no items.
//   npx tsx tools/item-power.ts --matches 60 --seed 29000
import { loadNodeContent } from './content-node';
import { Match, PLAY_TEAMS, type Unit } from '../src/sim';
import { computeStats } from '../src/sim/stats';
import type { Stats } from '../src/sim/content/schema';

const arg = (name: string, def: number): number => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? Number(process.argv[i + 1]) : def;
};
const N = arg('matches', 60);
const SEED = arg('seed', 29000);
const content = loadNodeContent();

interface Read {
  at: string;
  piece: string;
  rank: number;
  items: number;
  hp: number;
  main: number;
  dps: number;
  ehp: number;
}
const reads: Read[] = [];

/** The AI's own power measures (src/sim/ai/power.ts), on a stat block. */
const dpsOf = (s: Stats): number => s.bladeDmg * s.atkSpeed + s.soulPower * 0.6 + s.bladeDmg * 0.3;
const ehpOf = (s: Stats): number =>
  s.maxHp * (1 + (Math.max(0, s.armor) + Math.max(0, s.resist)) / 200);

function read(m: Match, at: string): void {
  for (const team of PLAY_TEAMS) {
    for (const id of m.state.teams[team].heroIds) {
      const u = m.unitById(id)!;
      const h = u.hero!;
      const bare: Unit = { ...u, mods: [], hero: { ...h, items: [], flaws: {} } };
      const geared: Unit = { ...u, mods: [] };
      const a = computeStats(m.ctx, geared).stats;
      const b = computeStats(m.ctx, bare).stats;
      const soul = b.soulPower > b.bladeDmg;
      reads.push({
        at,
        piece: h.defId,
        rank: h.rank,
        items: h.items.length,
        hp: a.maxHp / b.maxHp,
        main: soul ? a.soulPower / b.soulPower : a.bladeDmg / b.bladeDmg,
        dps: dpsOf(a) / dpsOf(b),
        ehp: ehpOf(a) / ehpOf(b),
      });
    }
  }
}

const minutes: number[] = [];
for (let k = 0; k < N; k++) {
  const m = Match.create(content, {
    seed: SEED + k,
    map: 'long',
    autoGambits: { A: true, B: true },
    autoForks: { A: true, B: true },
  });
  m.issue({ type: 'setupTeam', ...m.defaultSetup() });
  let act = m.state.phase.n;
  while (m.state.phase.kind === 'live' && m.state.phase.n <= 10) {
    if (m.step(20) === 0) break;
    if (m.state.phase.kind === 'live' && m.state.phase.n > act) {
      act = m.state.phase.n;
      read(m, `Act ${act} start`);
    }
  }
  read(m, 'match end');
  minutes.push(m.state.tick / 20 / 60);
}

const q = (xs: number[], p: number): number => {
  const s = xs.slice().sort((x, y) => x - y);
  return s.length ? s[Math.min(s.length - 1, Math.floor(p * s.length))] : NaN;
};
const pct = (x: number): string => `${x >= 1 ? '+' : ''}${Math.round((x - 1) * 100)}%`;
const growth = content.longBoard!.tuning.ranks.growth;
/** The growth per Rank that gives a piece at `rank` the same multiplier as today's growth times `mult`. */
const equiv = (rank: number, mult: number): number =>
  rank <= 1 ? NaN : ((1 + growth * (rank - 1)) * mult - 1) / (rank - 1);

console.log(
  `${N} matches from seed ${SEED}, Long Board, AI vs AI; median ${q(minutes, 0.5).toFixed(1)} min`,
);
console.log(`today's ranks.growth ${growth}`);
const ats = [...new Set(reads.map((r) => r.at))].sort((x, y) =>
  x === 'match end' ? 1 : y === 'match end' ? -1 : x.localeCompare(y, 'en', { numeric: true }),
);
const row = (label: string, rs: Read[]): string => {
  const rank = q(
    rs.map((r) => r.rank),
    0.5,
  );
  const hp = q(
    rs.map((r) => r.hp),
    0.5,
  );
  const main = q(
    rs.map((r) => r.main),
    0.5,
  );
  const eqHp = q(
    rs.map((r) => equiv(r.rank, r.hp)),
    0.5,
  );
  const eqMain = q(
    rs.map((r) => equiv(r.rank, r.main)),
    0.5,
  );
  const eqMean = q(
    rs.map((r) => equiv(r.rank, (r.hp + r.main) / 2)),
    0.5,
  );
  return [
    label.padEnd(16),
    String(rs.length).padStart(5),
    rank.toFixed(0).padStart(5),
    q(
      rs.map((r) => r.items),
      0.5,
    )
      .toFixed(0)
      .padStart(6),
    `${pct(hp)} / ${pct(
      q(
        rs.map((r) => r.hp),
        0.9,
      ),
    )}`.padStart(13),
    `${pct(main)} / ${pct(
      q(
        rs.map((r) => r.main),
        0.9,
      ),
    )}`.padStart(13),
    pct(
      q(
        rs.map((r) => r.dps),
        0.5,
      ),
    ).padStart(7),
    pct(
      q(
        rs.map((r) => r.ehp),
        0.5,
      ),
    ).padStart(7),
    `${(eqHp * 100).toFixed(1)}% ${(eqMain * 100).toFixed(1)}% ${(eqMean * 100).toFixed(1)}%`.padStart(
      22,
    ),
  ].join(' ');
};
console.log(
  'when'.padEnd(16),
  'n'.padStart(5),
  'rank'.padStart(5),
  'items'.padStart(6),
  'hp p50/p90'.padStart(13),
  'main p50/p90'.padStart(13),
  'dps'.padStart(7),
  'ehp'.padStart(7),
  'growth eq hp/main/mean'.padStart(22),
);
for (const at of ats)
  console.log(
    row(
      at,
      reads.filter((r) => r.at === at),
    ),
  );
console.log('\nby piece type (all reads at Act starts):');
for (const p of ['king', 'queen', 'rook', 'bishop', 'knight'])
  console.log(
    row(
      p,
      reads.filter((r) => r.piece === p && r.at !== 'match end'),
    ),
  );
console.log('\nby piece type (match end):');
for (const p of ['king', 'queen', 'rook', 'bishop', 'knight'])
  console.log(
    row(
      p,
      reads.filter((r) => r.piece === p && r.at === 'match end'),
    ),
  );

/** Least-squares growth per Rank over a set of reads: 1 + g'(r - 1) against today's (1 + g(r - 1)) × ratio. */
function fit(rs: Read[], ratio: (r: Read) => number): number {
  let num = 0;
  let den = 0;
  for (const r of rs) {
    const x = r.rank - 1;
    num += x * ((1 + growth * x) * ratio(r) - 1);
    den += x * x;
  }
  return den ? num / den : NaN;
}
const live = reads.filter((r) => r.at !== 'match end');
console.log('\nleast-squares growth per Rank that replaces items (reads at Act starts):');
for (const [name, f] of [
  ['health', (r: Read) => r.hp],
  ['main damage', (r: Read) => r.main],
  ['damage output (dps)', (r: Read) => r.dps],
  ['toughness (ehp)', (r: Read) => r.ehp],
  ['power (sqrt dps x ehp)', (r: Read) => Math.sqrt(r.dps * r.ehp)],
] as [string, (r: Read) => number][])
  console.log(`  ${name.padEnd(24)} ${(fit(live, f) * 100).toFixed(1)}%`);
