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

const PIECE_NAME: Record<string, string> = {
  king: 'King',
  queen: 'Queen',
  rook: 'Rook',
  bishop: 'Bishop',
  knight: 'Knight',
};

export function report(
  results: MatchSummary[],
  opts: { noGambitsA?: boolean; noGambitsB?: boolean } = {},
): { md: string; stats: Record<string, unknown> } {
  const n = results.length;
  const finished = results.filter((r) => r.winner !== null);
  const lengths = finished.map((r) => r.minutes);
  const whiteRate = finished.filter((r) => r.winner === 'A').length / Math.max(1, finished.length);
  const lines: string[] = [];
  lines.push(`# Balance report (chess variant)`);
  lines.push('');
  if (opts.noGambitsA)
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
  const pathStats: Record<string, Agg> = {};
  const laneStats: Record<string, Agg> = {};
  for (const r of finished) {
    for (const h of r.heroes) {
      add(pieceStats, h.def, h);
      add(styleStats, `${h.def}/${h.style}`, h);
      add(pathStats, `${h.def}/${h.path}`, h);
      add(laneStats, h.role, h);
    }
  }
  const row = (s: Agg): string =>
    `${pct(s.w, s.n)} | ${(s.k / s.n).toFixed(1)} | ${(s.d / s.n).toFixed(1)} | ${(s.a / s.n).toFixed(1)} | ${Math.round(s.g / s.n)}`;
  for (const [id, s] of Object.entries(pieceStats).sort())
    lines.push(`| ${PIECE_NAME[id] ?? id} | ${row(s)} |`);
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
  lines.push('## Build paths');
  lines.push('');
  lines.push('| Piece / path | Pick rate | Win rate | K | D | A | Gold |');
  lines.push('| --- | --- | --- | --- | --- | --- | --- |');
  for (const [k, s] of Object.entries(pathStats).sort())
    lines.push(`| ${k} | ${pct(s.n, pieceStats[k.split('/')[0]]?.n ?? 1)} | ${row(s)} |`);
  lines.push('');
  lines.push('## Lanes');
  lines.push('');
  lines.push('| Lane | Win rate | K | D | A | Gold |');
  lines.push('| --- | --- | --- | --- | --- | --- |');
  for (const [k, s] of Object.entries(laneStats).sort()) lines.push(`| ${k} | ${row(s)} |`);
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
  for (const [id, s] of Object.entries(itemStats).sort((a, b) => b[1].n - a[1].n))
    lines.push(`| ${id} | ${s.n} | ${pct(s.w, s.n)} |`);
  lines.push('');
  lines.push('## Curses, comebacks, obelisks');
  lines.push('');
  const offered = results.reduce((a, r) => a + r.curses.offered, 0);
  const accepted = results.reduce((a, r) => a + r.curses.accepted, 0);
  const acceptedBy = results.flatMap((r) => r.curses.acceptedBy);
  lines.push(
    `- Curse offers: ${offered} (${(offered / n).toFixed(2)} per match); accepted ${pct(accepted, offered)}; side won after accepting ${pct(acceptedBy.filter((c) => c.won).length, acceptedBy.length)}`,
  );
  const lead = finished.filter((r) => r.lead1);
  lines.push(
    `- Side ahead in net worth after Act 1 won: ${pct(lead.filter((r) => !r.comeback).length, lead.length)}; comeback rate ${pct(lead.filter((r) => r.comeback).length, lead.length)}`,
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
