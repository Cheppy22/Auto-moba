import { describe, expect, it } from 'vitest';
import {
  MVP_WEIGHTS,
  SERIES_STEP_SEC,
  buildReport,
  buildSummary,
  inputFromMatch,
  type AnalysisInput,
} from '../src/analysis';
import { content, runAi } from './helpers';

const m = runAi(3, 9);
const input = inputFromMatch(m, content);
const s = buildSummary(input);
const TEAMS = ['A', 'B'] as const;
const deathEvents = m.events.flatMap((e) => (e.type === 'death' ? [e.payload] : []));
const sum = (xs: number[]): number => xs.reduce((a, b) => a + b, 0);
const last = <T>(xs: T[]): T => xs[xs.length - 1];

describe('match summary: shape and names', () => {
  it('has one row per piece with names from content', () => {
    expect(s.rows).toHaveLength(10);
    expect(s.rows.filter((r) => r.team === 'A')).toHaveLength(5);
    for (const r of s.rows) {
      const piece = content.pieceById.get(r.piece as 'king')!;
      expect(r.pieceName).toBe(piece.name);
      expect(r.name).toBe(`${r.team === 'A' ? 'White' : 'Black'} ${piece.name}`);
      expect(r.styleName).toBe(content.styleByKey.get(`${r.piece}/${r.style}`)!.name);
      expect(r.rank).toBeGreaterThanOrEqual(1);
      expect(r.rank).toBeLessThanOrEqual(8);
      expect(r.finalItems.length).toBeLessThanOrEqual(content.tuning.shop.slots);
      expect(r.finalItemNames).toHaveLength(r.finalItems.length);
      for (const id of r.finalItems)
        expect(content.itemById.has(id) || content.cursedById.has(id)).toBe(true);
      expect(['top', 'mid', 'bot']).toContain(r.lane);
      expect(['top', 'mid', 'bot']).toContain(r.startLane);
    }
  });

  it('is deterministic and reads the result from the log', () => {
    expect(buildSummary(input)).toEqual(s);
    const end = m.events.find((e) => e.type === 'matchEnd');
    expect(end && end.type === 'matchEnd' ? end.payload.winner : null).toBe(s.winner);
    expect(s.endTick).toBe(last(m.events).tick);
    expect(s.minutes).toBeCloseTo(s.endTick / input.tickRate / 60, 9);
    const acts = Math.max(
      ...m.events.flatMap((e) =>
        e.type === 'phaseStart' && e.payload.kind === 'live' ? [e.payload.phase] : [],
      ),
    );
    expect(s.acts).toBe(acts);
  });

  it('checkmate: loser, and whether the Throne fell before the final King death', () => {
    const mate = m.events.find((e) => e.type === 'checkmate');
    if (!mate || mate.type !== 'checkmate') {
      expect(s.checkmate).toBeNull();
      return;
    }
    const loser = mate.payload.winner === 'A' ? 'B' : 'A';
    expect(s.checkmate!.loser).toBe(loser);
    expect(s.winner).toBe(mate.payload.winner);
    const throne = m.events.find((e) => e.type === 'throneDown' && e.payload.team === loser)!;
    const king = s.rows.find((r) => r.team === loser && r.piece === 'king')!;
    const kingDeaths = m.events.filter((e) => e.type === 'death' && e.payload.id === king.id);
    expect(s.checkmate!.throneFirst).toBe(throne.seq < last(kingDeaths).seq);
  });
});

describe('match summary: numbers trace back to the log', () => {
  it('team kills and deaths match piece-death events', () => {
    expect(sum(TEAMS.map((t) => s.teams[t].deaths))).toBe(deathEvents.length);
    for (const t of TEAMS) {
      const mine = s.rows.filter((r) => r.team === t);
      expect(s.teams[t].deaths).toBe(deathEvents.filter((d) => d.team === t).length);
      expect(sum(mine.map((r) => r.deaths))).toBe(s.teams[t].deaths);
      // A piece kill is a kill for its team.
      expect(s.teams[t].kills).toBeGreaterThanOrEqual(sum(mine.map((r) => r.kills)));
    }
    // Every death is credited to the other team, or counted as a neutral death.
    expect(
      s.teams.A.kills + s.teams.B.kills + sum(TEAMS.map((t) => s.teams[t].deathsToNeutral ?? 0)),
    ).toBe(deathEvents.length);
    expect(s.teams.A.kills).toBeLessThanOrEqual(s.teams.B.deaths);
    expect(s.teams.B.kills).toBeLessThanOrEqual(s.teams.A.deaths);
    // A piece-credited death event lands in the killing piece's row.
    const pieceIds = new Set(s.rows.map((r) => r.id));
    expect(sum(s.rows.map((r) => r.kills))).toBe(
      deathEvents.filter((d) => pieceIds.has(d.killer)).length,
    );
  });

  it('gold: last sample equals the sum of goldEarned equals the gold events', () => {
    for (const t of TEAMS) {
      const events = sum(
        m.events.flatMap((e) =>
          e.type === 'gold' && s.rows.find((r) => r.id === e.payload.id)?.team === t
            ? [e.payload.amount]
            : [],
        ),
      );
      expect(s.teams[t].goldEarned).toBe(events);
      expect(sum(s.rows.filter((r) => r.team === t).map((r) => r.goldEarned))).toBe(events);
      expect(last(s.series.gold[t]).total).toBe(events);
    }
    expect(last(s.series.goldLead).diff).toBe(s.teams.A.goldEarned - s.teams.B.goldEarned);
  });

  it('damage: rows sum to team damage and to the damage events and the last sample', () => {
    const ids = new Map(s.rows.map((r) => [r.id, r.team]));
    for (const t of TEAMS) {
      const events = sum(
        m.events.flatMap((e) =>
          e.type === 'damage' && ids.get(e.payload.src) === t && e.payload.tgtKind === 'hero'
            ? [e.payload.amount]
            : [],
        ),
      );
      const rows = sum(s.rows.filter((r) => r.team === t).map((r) => r.damageDealt));
      expect(s.teams[t].damageToPieces).toBeCloseTo(rows, 6);
      expect(rows).toBeCloseTo(events, 6);
      expect(last(s.series.damage[t]).total).toBeCloseTo(events, 6);
    }
  });

  it('objectives, Checks, pawns and Tempo come from the log', () => {
    const towers = m.events.filter((e) => e.type === 'structureDown' && e.payload.kind === 'tower');
    expect(s.objectives.bastions).toHaveLength(towers.length);
    expect(s.teams.A.bastionsDestroyed + s.teams.B.bastionsDestroyed).toBe(towers.length);
    for (const b of s.objectives.bastions) expect(b.by).not.toBe(b.team);
    const thrones = m.events.filter((e) => e.type === 'throneDown');
    expect(s.objectives.throne).toHaveLength(thrones.length);
    for (const t of TEAMS) {
      const checks = m.events.filter((e) => e.type === 'check' && e.payload.team === t);
      expect(s.teams[t].checks).toBe(checks.length);
      expect(s.objectives.checks.filter((c) => c.team === t)).toHaveLength(checks.length);
      const pawns = m.events.filter((e) => e.type === 'pawnFielded' && e.payload.team === t);
      expect(s.teams[t].pawnsFielded).toBe(pawns.length);
      expect(last(s.series.pawnsFielded[t]).count).toBe(pawns.length);
      expect(s.teams[t].tempoOnPawns).toBe(pawns.length * content.tuning.pawns.cost);
      const cards = m.events.flatMap((e) =>
        e.type === 'gambit' && e.payload.team === t ? [e.payload.cardId] : [],
      );
      expect(s.teams[t].tempoOnGambits).toBe(
        sum(cards.map((c) => content.gambitById.get(c)!.cost)),
      );
      expect(sum(Object.values(s.teams[t].gambitsPlayed))).toBe(cards.length);
    }
    for (const c of s.objectives.checks) expect(c.toTick).toBeGreaterThanOrEqual(c.fromTick);
    expect(sum(s.rows.map((r) => r.structureKills))).toBeLessThanOrEqual(
      towers.length + thrones.length,
    );
  });

  it('final items replay purchases, components and sells', () => {
    for (const r of s.rows) {
      const bought = m.events.filter((e) => e.type === 'purchase' && e.payload.id === r.id).length;
      expect(r.finalItems.length).toBeLessThanOrEqual(bought);
    }
  });
});

describe('match summary: series', () => {
  it('every series shares one x-axis, steps every 10 s and ends at the last tick', () => {
    const { ticks } = s.series;
    const step = SERIES_STEP_SEC * input.tickRate;
    expect(ticks[0]).toBe(0);
    expect(last(ticks)).toBe(s.endTick);
    for (let i = 1; i < ticks.length - 1; i++) expect(ticks[i] - ticks[i - 1]).toBe(step);
    const same = (xs: { tick: number }[]): void => {
      expect(xs.map((p) => p.tick)).toEqual(ticks);
    };
    for (const t of TEAMS) {
      same(s.series.gold[t]);
      same(s.series.damage[t]);
      same(s.series.kills[t]);
      same(s.series.alive[t]);
      same(s.series.pawnsFielded[t]);
    }
    same(s.series.goldLead);
    expect(s.series.rank).toHaveLength(10);
    for (const r of s.series.rank) same(r.points);
  });

  it('cumulative series never fall and rank/alive stay in range', () => {
    for (const t of TEAMS) {
      for (const series of [s.series.gold[t], s.series.damage[t], s.series.kills[t]])
        for (let i = 1; i < series.length; i++)
          expect(series[i].total).toBeGreaterThanOrEqual(series[i - 1].total);
      for (let i = 1; i < s.series.pawnsFielded[t].length; i++)
        expect(s.series.pawnsFielded[t][i].count).toBeGreaterThanOrEqual(
          s.series.pawnsFielded[t][i - 1].count,
        );
      expect(last(s.series.kills[t]).total).toBe(s.teams[t].kills);
      for (const p of s.series.alive[t]) {
        expect(p.count).toBeGreaterThanOrEqual(0);
        expect(p.count).toBeLessThanOrEqual(5);
      }
      expect(s.series.alive[t][0].count).toBe(5);
    }
    for (const r of s.series.rank) {
      for (let i = 1; i < r.points.length; i++)
        expect(r.points[i].rank).toBeGreaterThanOrEqual(r.points[i - 1].rank);
      expect(last(r.points).rank).toBe(s.rows.find((x) => x.id === r.id)!.rank);
    }
    // Alive at the end follows the final death/respawn state of the log.
    for (const t of TEAMS) {
      const down = new Set<number>();
      for (const e of m.events) {
        if (e.type === 'death' && e.payload.team === t) down.add(e.payload.id);
        if (e.type === 'respawn') down.delete(e.payload.id);
      }
      expect(last(s.series.alive[t]).count).toBe(5 - down.size);
    }
  });
});

describe('match summary: MVP and awards', () => {
  it('the score follows the documented weighted sum', () => {
    const totals = {
      damage: sum(s.rows.map((r) => r.damageDealt)),
      healing: sum(s.rows.map((r) => r.healingDone)),
      objective: sum(s.rows.map((r) => r.objectiveDamage)),
    };
    for (const r of s.rows) {
      const expected =
        MVP_WEIGHTS.kill * r.kills +
        MVP_WEIGHTS.assist * r.assists +
        MVP_WEIGHTS.damageShare * (r.damageDealt / totals.damage) +
        MVP_WEIGHTS.healingShare * (totals.healing ? r.healingDone / totals.healing : 0) +
        MVP_WEIGHTS.objectiveShare * (totals.objective ? r.objectiveDamage / totals.objective : 0) -
        MVP_WEIGHTS.death * r.deaths;
      expect(r.score).toBeCloseTo(expected, 9);
    }
  });

  it('picks the top score for the match and for each side, with a factual reason', () => {
    const top = (rows: typeof s.rows): number => Math.max(...rows.map((r) => r.score));
    expect(s.mvp.match!.row.score).toBe(top(s.rows));
    expect(s.mvp.White!.row.team).toBe('A');
    expect(s.mvp.White!.row.score).toBe(top(s.rows.filter((r) => r.team === 'A')));
    expect(s.mvp.Black!.row.team).toBe('B');
    expect(s.mvp.Black!.row.score).toBe(top(s.rows.filter((r) => r.team === 'B')));
    for (const p of [s.mvp.match!, s.mvp.White!, s.mvp.Black!]) {
      expect(p.reason).toContain(`${p.row.kills}/${p.row.deaths}/${p.row.assists} K/D/A`);
      expect(p.reason).not.toMatch(/should|better|worse|best/i);
    }
  });

  it('awards state a metric, point at real pieces and match the rows', () => {
    const ids = new Set(s.awards.map((a) => a.id));
    for (const id of ['mostDamage', 'mostKills', 'mostAssists', 'firstBlood', 'longestLife'])
      expect(ids.has(id), id).toBe(true);
    for (const a of s.awards) {
      expect(a.title).toMatch(/^(Most|Fewest|Top|First|Longest|Biggest) /);
      expect(a.title).not.toMatch(/best|worst|mvp|hero|carry|feeder/i);
      if (a.pieceId !== null) expect(s.rows.some((r) => r.id === a.pieceId)).toBe(true);
    }
    const pick = (id: string) => s.awards.find((a) => a.id === id)!;
    const mostDamage = s.rows.reduce((a, b) => (b.damageDealt > a.damageDealt ? b : a));
    expect(pick('mostDamage').pieceId).toBe(mostDamage.id);
    expect(pick('mostDamage').value).toBeCloseTo(mostDamage.damageDealt, 0);
    const fewest = s.awards.find((a) => a.id === 'fewestDeaths');
    if (fewest) {
      const row = s.rows.find((r) => r.id === fewest.pieceId)!;
      expect(row.kills).toBeGreaterThanOrEqual(1);
      expect(row.deaths).toBe(fewest.value);
      for (const r of s.rows.filter((x) => x.kills >= 1))
        expect(r.deaths).toBeGreaterThanOrEqual(row.deaths);
    }
    const firstDeath = deathEvents[0];
    const fb = pick('firstBlood');
    expect(fb.pieceId).toBe(firstDeath.killer);
    const lead = pick('biggestGoldLead');
    expect(lead.pieceId).toBeNull();
    expect(lead.value).toBeGreaterThanOrEqual(
      Math.max(...s.series.goldLead.map((p) => Math.abs(p.diff))),
    );
    const life = pick('longestLife');
    const best = Math.max(...s.rows.map((r) => r.longestLifeTicks));
    expect(life.value).toBe(Math.round(best / input.tickRate));
  });
});

describe('match summary: timeline', () => {
  it('is sorted, in plain words, and covers kills, Bastions and the Throne', () => {
    for (let i = 1; i < s.timeline.length; i++)
      expect(s.timeline[i].tick).toBeGreaterThanOrEqual(s.timeline[i - 1].tick);
    const count = (k: string): number => s.timeline.filter((t) => t.kind === k).length;
    expect(count('kill')).toBe(deathEvents.length);
    expect(count('bastion')).toBe(s.objectives.bastions.length);
    expect(count('throne')).toBe(s.objectives.throne.length);
    expect(count('check')).toBe(s.teams.A.checks + s.teams.B.checks);
    expect(count('act')).toBe(s.acts);
    expect(count('rank')).toBe(m.events.filter((e) => e.type === 'rankUp').length);
    expect(count('fork')).toBe(m.events.filter((e) => e.type === 'fork').length);
    expect(count('gambit')).toBe(m.events.filter((e) => e.type === 'gambit').length);
    for (const t of s.timeline) {
      expect(t.label.length).toBeGreaterThan(0);
      expect(t.label).not.toMatch(/undefined|\[object|_/);
    }
    expect(
      s.timeline.some((t) => /^(White|Black) \w+ killed (White|Black) \w+/.test(t.label)),
    ).toBe(true);
    expect(
      s.timeline.some((t) => /^(White|Black) Bastion fell \((Left|Mid|Right)\)$/.test(t.label)),
    ).toBe(true);
  });
});

describe('match summary: edge cases and the hero view', () => {
  it('handles an empty log and input without content', () => {
    const empty: AnalysisInput = {
      events: [],
      samples: [],
      tickRate: 20,
      fightGapSec: 5,
      fightRadius: 30,
      badges: [],
    };
    const e = buildSummary(empty);
    expect(e.rows).toEqual([]);
    expect(e.winner).toBeNull();
    expect(e.checkmate).toBeNull();
    expect(e.series.ticks).toEqual([0]);
    expect(e.mvp.match).toBeNull();
    const bare = buildSummary({ ...input, content: undefined });
    expect(bare.rows).toHaveLength(10);
    expect(bare.rows[0].pieceName.length).toBeGreaterThan(0);
    expect(bare.teams.A.kills).toBe(s.teams.A.kills);
  });

  it('buildReport still serves the hero view (ranks, forks, purchases, damage types)', () => {
    const r = buildReport(input, { kind: 'match' });
    expect(r.heroes).toHaveLength(10);
    for (const h of r.heroes) {
      expect(h.ranks.length).toBeGreaterThan(0);
      expect(h.ranks.length).toBeLessThanOrEqual(7);
      expect(h.purchases.length).toBeGreaterThan(0);
      const row = s.rows.find((x) => x.id === h.id)!;
      expect(row.rank).toBe(h.ranks.length ? Math.max(...h.ranks.map((x) => x.rank)) : 1);
      expect(row.damageTaken).toBe(h.damageTaken);
      expect(h.taken.blade + h.taken.soul + h.taken.true).toBeCloseTo(h.damageTaken, 6);
    }
  });
});
