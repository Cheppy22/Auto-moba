import { readFileSync } from 'node:fs';
import { PIECE_NAME } from '../src/sim';
import type { MatchSummary } from './simulate';

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

const SCHOOL_OF = new Map<string, string>();
const POOL_OF = new Map<string, string>();

/** Techniques: picks by school, pick and held win rates per card, Combinations. */
function techniqueLines(results: MatchSummary[]): string[] {
  if (SCHOOL_OF.size === 0) {
    const file = JSON.parse(
      readFileSync(new URL('../content/techniques.json', import.meta.url), 'utf8'),
    ) as {
      techniques: { id: string; school: string; pool: string }[];
    };
    for (const d of file.techniques) {
      SCHOOL_OF.set(d.id, d.school);
      POOL_OF.set(d.id, d.pool);
    }
  }
  const out: string[] = ['## Techniques', ''];
  const cards: Record<string, { offered: number; taken: number; held: number; won: number }> = {};
  const row = (id: string) => (cards[id] ??= { offered: 0, taken: 0, held: 0, won: 0 });
  const schools: Record<string, number> = {};
  let picks = 0;
  let passes = 0;
  let rerolls = 0;
  let upgrades = 0;
  let whitePieces = 0;
  let whiteCombo = 0;
  for (const r of results) {
    for (const t of ['A', 'B'] as const) {
      const b = r.builds[t];
      for (const id of b.offered) row(id).offered++;
      for (const id of b.taken) {
        row(id).taken++;
        const sc = SCHOOL_OF.get(id) ?? '?';
        schools[sc] = (schools[sc] ?? 0) + 1;
        picks++;
      }
      passes += b.passes;
      rerolls += b.rerolls;
      upgrades += b.upgrades;
    }
    for (const h of r.heroes) {
      const held = h.techniques.map((x) => x.split(':')[0]);
      for (const id of new Set(held)) {
        row(id).held++;
        if (h.won) row(id).won++;
      }
      if (h.team === 'A') {
        whitePieces++;
        if (held.some((id) => POOL_OF.get(id) === 'combination')) whiteCombo++;
      }
    }
  }
  const n = results.length;
  out.push(
    `- Per match: ${(picks / Math.max(1, n)).toFixed(1)} cards taken, ${(rerolls / Math.max(1, n)).toFixed(1)} rerolls, ${(passes / Math.max(1, n)).toFixed(1)} passes, ${(upgrades / Math.max(1, n)).toFixed(1)} upgrades.`,
  );
  out.push(`- White pieces holding a Combination at match end: ${pct(whiteCombo, whitePieces)}.`);
  out.push(
    `- Picks by school: ${Object.entries(schools)
      .sort((a, b) => b[1] - a[1])
      .map(([k, v]) => `${k} ${pct(v, picks)}`)
      .join(', ')}.`,
  );
  out.push('');
  out.push(
    '| Technique | Pool | School | Offered | Pick rate | Held at end | Win rate when held |',
  );
  out.push('| --- | --- | --- | --- | --- | --- | --- |');
  for (const [id, s] of Object.entries(cards).sort((a, b) => b[1].taken - a[1].taken))
    out.push(
      `| ${id} | ${POOL_OF.get(id) ?? '?'} | ${SCHOOL_OF.get(id) ?? '?'} | ${s.offered} | ${pct(s.taken, s.offered)} | ${s.held} | ${pct(s.won, s.held)} |`,
    );
  return out;
}

export function report(
  results: MatchSummary[],
  opts: {
    noGambitsA?: boolean;
    noGambitsB?: boolean;
    whitePlayer?: boolean;
    whiteEvery?: number;
  } = {},
): { md: string; stats: Record<string, unknown> } {
  const n = results.length;
  const finished = results.filter((r) => r.winner !== null);
  const lengths = finished.map((r) => r.minutes);
  const whiteRate = finished.filter((r) => r.winner === 'A').length / Math.max(1, finished.length);
  const lines: string[] = [];
  lines.push(`# Balance report (chess variant)`);
  lines.push('');
  if (opts.whitePlayer)
    lines.push(
      `- **Player run:** White's pawns come from the standing pawn plan (2 / 2 / 2) as in the browser; ${opts.noGambitsA ? 'White plays no cards' : `a stand-in plays the AI's best-fitting card${opts.whiteEvery ? `, at most one per ${opts.whiteEvery} s` : ' whenever one fits'}`}. Black uses the AI.`,
    );
  else if (opts.noGambitsA)
    lines.push(
      '- **Baseline run:** White plays no gambits and fields no pawns; Black uses the AI.',
    );
  else lines.push('- Both sides use the gambit and pawn AI (`autoGambits` A and B).');
  lines.push(
    `- Matches: ${n} (seeds ${results[0]?.seed}..${results[n - 1]?.seed}), ended in checkmate: ${pct(finished.length, n)}`,
  );
  lines.push(
    `- White win rate: ${pct(finished.filter((r) => r.winner === 'A').length, finished.length)}`,
  );
  const adj = finished.filter((r) => r.adjudicated);
  if (results.some((r) => r.adjudicated)) {
    const mated = finished.filter((r) => !r.adjudicated);
    lines.push(
      `- Adjudicated (no Checkmate when the last Act ended): ${pct(results.filter((r) => r.adjudicated).length, n)} of matches, White won ${pct(adj.filter((r) => r.winner === 'A').length, adj.length)} of those; true Checkmates ${pct(mated.length, n)}, White won ${pct(mated.filter((r) => r.winner === 'A').length, mated.length)} of those`,
    );
  }
  lines.push(
    `- Match length (min): median ${median(lengths).toFixed(1)}, p10 ${quant(lengths, 0.1).toFixed(1)}, p90 ${quant(lengths, 0.9).toFixed(1)}, max ${Math.max(0, ...lengths).toFixed(1)}`,
  );
  const phaseHist: Record<number, number> = {};
  for (const r of finished) phaseHist[r.phases] = (phaseHist[r.phases] ?? 0) + 1;
  lines.push(
    `- Ended in Act: ${Object.entries(phaseHist)
      .map(([k, v]) => `${k}: ${pct(v, finished.length)}`)
      .join(', ')}`,
  );
  const mates = finished.filter((r) => r.mate === 'throneFirst').length;
  lines.push(
    `- Checkmate order: Throne fell, King killed later ${pct(mates, finished.length)}; King already down when the Throne fell ${pct(finished.length - mates, finished.length)}`,
  );
  lines.push(
    `- Compute: ${(results.reduce((a, r) => a + r.ms, 0) / n / 1000).toFixed(2)} s per match, ${(results.reduce((a, r) => a + r.ms / Math.max(1, r.ticks), 0) / n).toFixed(3)} ms per tick`,
  );
  lines.push(
    `- Kills per match: ${(results.reduce((a, r) => a + r.kills.A + r.kills.B, 0) / n).toFixed(1)}, Bastions per match: ${(results.reduce((a, r) => a + r.towers.A + r.towers.B, 0) / n).toFixed(1)}, first Bastion at ${median(results.map((r) => r.firstTowerMinute ?? 99)).toFixed(1)} min (median)`,
  );
  const rankLine = [2, 3, 4, 5, 6, 7, 8]
    .map((k) => {
      const xs = results.map((r) => r.rankMinute[k]).filter((x): x is number => x !== null);
      return `R${k} ${xs.length ? median(xs).toFixed(1) : '-'}`;
    })
    .join(', ');
  lines.push(`- First piece to reach each rank (median minute): ${rankLine}`);
  const finalRank = results.flatMap((r) => r.heroes.map((h) => h.rank));
  lines.push(
    `- Final rank per piece: mean ${(finalRank.reduce((a, b) => a + b, 0) / Math.max(1, finalRank.length)).toFixed(2)}, at Rank 8 ${pct(finalRank.filter((x) => x === 8).length, finalRank.length)}`,
  );
  lines.push('');
  lines.push('## Tempo: gambits and pawns (per match)');
  lines.push('');
  lines.push('| Card | White | Black |');
  lines.push('| --- | --- | --- |');
  const cards = new Set<string>();
  for (const r of results)
    for (const t of ['A', 'B'] as const) Object.keys(r.gambits[t]).forEach((k) => cards.add(k));
  for (const c of [...cards].sort()) {
    const per = (t: 'A' | 'B'): string =>
      (results.reduce((a, r) => a + (r.gambits[t][c] ?? 0), 0) / n).toFixed(2);
    lines.push(`| ${c} | ${per('A')} | ${per('B')} |`);
  }
  lines.push(
    `| pawns fielded | ${(results.reduce((a, r) => a + r.pawns.A, 0) / n).toFixed(1)} | ${(results.reduce((a, r) => a + r.pawns.B, 0) / n).toFixed(1)} |`,
  );
  const spend = (t: 'A' | 'B'): string => {
    const c = results.reduce((a, r) => a + r.tempoSpent[t].cards, 0);
    const p = results.reduce((a, r) => a + r.tempoSpent[t].pawns, 0);
    return `${pct(c, c + p)} cards / ${pct(p, c + p)} pawns`;
  };
  lines.push(`| Tempo spent | ${spend('A')} | ${spend('B')} |`);
  lines.push(
    `| times in Check | ${(results.reduce((a, r) => a + r.checks.A, 0) / n).toFixed(1)} | ${(results.reduce((a, r) => a + r.checks.B, 0) / n).toFixed(1)} |`,
  );
  lines.push('');
  lines.push(...paceLines(results));
  lines.push('');
  lines.push('## Pieces (share of appearances on the winning side)');
  lines.push('');
  lines.push('| Piece | Win rate | K | D | A | Gold |');
  lines.push('| --- | --- | --- | --- | --- | --- |');
  type Agg = { n: number; w: number; k: number; d: number; a: number; g: number };
  const add = (m: Record<string, Agg>, key: string, h: MatchSummary['heroes'][number]): void => {
    const s = (m[key] ??= { n: 0, w: 0, k: 0, d: 0, a: 0, g: 0 });
    s.n++;
    s.w += h.won ? 1 : 0;
    s.k += h.kills;
    s.d += h.deaths;
    s.a += h.assists;
    s.g += h.goldEarned;
  };
  const pieceStats: Record<string, Agg> = {};
  const styleStats: Record<string, Agg> = {};
  const laneStats: Record<string, Agg> = {};
  for (const r of finished) {
    for (const h of r.heroes) {
      add(pieceStats, h.def, h);
      add(styleStats, `${h.def}/${h.style}`, h);
      add(laneStats, h.role, h);
    }
  }
  const row = (s: Agg): string =>
    `${pct(s.w, s.n)} | ${(s.k / s.n).toFixed(1)} | ${(s.d / s.n).toFixed(1)} | ${(s.a / s.n).toFixed(1)} | ${Math.round(s.g / s.n)}`;
  for (const [id, s] of Object.entries(pieceStats).sort())
    lines.push(`| ${(PIECE_NAME as Record<string, string | undefined>)[id] ?? id} | ${row(s)} |`);
  lines.push('');
  lines.push("## Styles (pick rate = share of that piece's appearances)");
  lines.push('');
  lines.push('| Piece / style | Pick rate | Win rate | K | D | A | Gold |');
  lines.push('| --- | --- | --- | --- | --- | --- | --- |');
  const styleRates: Record<string, { pick: number; win: number }> = {};
  for (const [k, s] of Object.entries(styleStats).sort()) {
    const pieceN = pieceStats[k.split('/')[0]]?.n ?? 1;
    styleRates[k] = { pick: s.n / pieceN, win: s.w / s.n };
    lines.push(`| ${k} | ${pct(s.n, pieceN)} | ${row(s)} |`);
  }
  lines.push('');
  lines.push('## Lanes');
  lines.push('');
  lines.push('| Lane | Win rate | K | D | A | Gold |');
  lines.push('| --- | --- | --- | --- | --- | --- |');
  for (const [k, s] of Object.entries(laneStats).sort()) lines.push(`| ${k} | ${row(s)} |`);
  lines.push('');
  lines.push(...techniqueLines(results), '');
  lines.push(...breakLines(results));
  lines.push('');
  lines.push('## Relics');
  lines.push('');
  lines.push('| Relic | Offered | Pick rate | Held at end | Win rate when held |');
  lines.push('| --- | --- | --- | --- | --- |');
  const relicStats: Record<string, { offered: number; taken: number; held: number; won: number }> =
    {};
  for (const r of results) {
    for (const t of ['A', 'B'] as const) {
      const row = (id: string) => (relicStats[id] ??= { offered: 0, taken: 0, held: 0, won: 0 });
      for (const id of r.relics[t].offered) row(id).offered++;
      for (const id of r.relics[t].taken) row(id).taken++;
      for (const id of r.relics[t].held) {
        row(id).held++;
        if (r.winner === t) row(id).won++;
      }
    }
  }
  for (const [id, s] of Object.entries(relicStats).sort((a, b) => b[1].held - a[1].held))
    lines.push(
      `| ${id} | ${s.offered} | ${pct(s.taken, s.offered)} | ${s.held} | ${pct(s.won, s.held)} |`,
    );
  lines.push('');
  lines.push('## Comebacks, obelisks');
  lines.push('');
  const lead = finished.filter((r) => r.lead1);
  lines.push(
    `- Side ahead in gold earned after Act 1 won: ${pct(lead.filter((r) => !r.comeback).length, lead.length)}; comeback rate ${pct(lead.filter((r) => r.comeback).length, lead.length)}`,
  );
  lines.push(
    `- Obelisks claimed per match: ${(results.reduce((a, r) => a + r.obelisks.A + r.obelisks.B, 0) / n).toFixed(2)}; camps cleared per match: ${(results.reduce((a, r) => a + r.campsCleared, 0) / n).toFixed(0)}`,
  );
  lines.push('');
  const med = median(lengths);
  const lowPick = Object.entries(styleRates).filter(([, r]) => r.pick < 0.15);
  lines.push('## Targets');
  lines.push('');
  lines.push(
    `- White win rate 48-52%: ${whiteRate >= 0.48 && whiteRate <= 0.52 ? 'yes' : 'NO'} (${(whiteRate * 100).toFixed(1)}%)`,
  );
  lines.push(
    `- Median match 12-16 minutes: ${med >= 12 && med <= 16 ? 'yes' : 'NO'} (${med.toFixed(1)})`,
  );
  lines.push(
    `- Every style picked at least 15%: ${lowPick.length === 0 ? 'yes' : `NO (${lowPick.map(([k, r]) => `${k} ${(r.pick * 100).toFixed(1)}%`).join(', ')})`}`,
  );
  return {
    md: lines.join('\n') + '\n',
    stats: {
      matches: n,
      whiteRate,
      medianMinutes: med,
      styleRates,
      noGambitsA: !!opts.noGambitsA,
      noGambitsB: !!opts.noGambitsB,
    },
  };
}

/** Gold spent and left, Techniques held and upgrades bought at each Act break (per piece, both sides). */
function breakLines(results: MatchSummary[]): string[] {
  const out: string[] = ['## Gold and Techniques at the Act breaks (per piece, both sides)', ''];
  out.push(
    '| Break after Act | Matches | Spent at the break, median (p90) | Gold left, median (p90) | Techniques held, median | Upgrades bought / piece |',
  );
  out.push('| --- | --- | --- | --- | --- | --- |');
  const all = results.flatMap((r) => r.breaks);
  const acts = [...new Set(all.map((b) => b.act))].sort((a, b) => a - b);
  for (const act of acts) {
    const xs = all.filter((b) => b.act === act);
    const matches = results.filter((r) => r.breaks.some((b) => b.act === act)).length;
    const spent = xs.map((b) => b.spent);
    const left = xs.map((b) => b.goldAfter);
    out.push(
      `| ${act} | ${matches} | ${median(spent).toFixed(0)} (${quant(spent, 0.9).toFixed(0)}) | ${median(left).toFixed(0)} (${quant(left, 0.9).toFixed(0)}) | ${median(xs.map((b) => b.techniques)).toFixed(0)} | ${(xs.reduce((a, b) => a + b.upgrades, 0) / Math.max(1, xs.length)).toFixed(2)} |`,
    );
  }
  return out;
}

/** Tempo pacing (when a card is first playable, cards per Act, gaps) and the eye badge. */
function paceLines(results: MatchSummary[]): string[] {
  const n = results.length;
  const out: string[] = ['## Tempo pacing (seconds of match clock)', ''];
  out.push('| | White | Black |');
  out.push('| --- | --- | --- |');
  const both = (label: string, f: (t: 'A' | 'B') => string): void => {
    out.push(`| ${label} | ${f('A')} | ${f('B')} |`);
  };
  const medOf = (t: 'A' | 'B', get: (p: MatchSummary['pace']['A']) => number | null): string => {
    const xs = results.map((r) => get(r.pace[t])).filter((x): x is number => x !== null);
    return xs.length ? `${median(xs).toFixed(0)} (p90 ${quant(xs, 0.9).toFixed(0)})` : '-';
  };
  both('First playable card, median s', (t) => medOf(t, (p) => p.firstAffordableSec));
  both('First card played, median s', (t) => medOf(t, (p) => p.firstPlaySec));
  const maxAct = Math.min(6, Math.max(0, ...results.map((r) => r.phases)));
  for (let a = 1; a <= maxAct; a++) {
    const reached = results.filter((r) => r.phases >= a);
    both(`Cards played in Act ${a} (${reached.length} matches)`, (t) =>
      (
        reached.reduce((x, r) => x + (r.pace[t].cardsByAct[a - 1] ?? 0), 0) /
        Math.max(1, reached.length)
      ).toFixed(1),
    );
  }
  both('Seconds between card plays, median (p90)', (t) => {
    const xs = results.flatMap((r) => r.pace[t].gaps);
    return xs.length ? `${median(xs).toFixed(0)} (${quant(xs, 0.9).toFixed(0)})` : '-';
  });
  both('Act 1 time with 0 / 1 / 2 / 3 playable cards', (t) => {
    const h = [0, 1, 2, 3].map((k) => results.reduce((x, r) => x + r.pace[t].act1Playable[k], 0));
    const tot = h.reduce((x, y) => x + y, 0);
    return h.map((x) => pct(x, tot)).join(' / ');
  });
  both('Act 1 cards never playable before leaving the hand', (t) =>
    pct(
      results.reduce((x, r) => x + r.pace[t].act1Dead, 0),
      results.reduce((x, r) => x + r.pace[t].act1Dealt, 0),
    ),
  );
  both('Act 1 mean Tempo held', (t) =>
    (results.reduce((x, r) => x + r.pace[t].act1Tempo, 0) / Math.max(1, n)).toFixed(1),
  );
  const e = results.reduce(
    (a, r) => ({
      on: a.on + r.eye.onTicks,
      all: a.all + r.eye.pieceTicks,
      ons: a.ons + r.eye.turnOns,
      ons1: a.ons1 + r.eye.turnOns1s,
      pieces: a.pieces + r.eye.pieces,
    }),
    { on: 0, all: 0, ons: 0, ons1: 0, pieces: 0 },
  );
  out.push('');
  out.push(
    `- High-ground eye badge: on for ${pct(e.on, e.all)} of living piece-time; turns on ${(e.ons / Math.max(1, e.pieces)).toFixed(1)} times per piece per match (${(e.ons1 / Math.max(1, e.pieces)).toFixed(1)} of them lasting 1 s or more); mean showing ${(e.on / Math.max(1, e.ons) / 20).toFixed(1)} s.`,
  );
  return out;
}
