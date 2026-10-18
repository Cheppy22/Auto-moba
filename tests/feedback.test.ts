import { describe, expect, it } from 'vitest';
import { Match } from '../src/sim';
import type { ActReport, DeathCause, PieceId, Unit } from '../src/sim';
import { dealDamage } from '../src/sim/combat';
import { classifyFall } from '../src/sim/feedback';
import { lanePoint } from '../src/sim/world/map';
import { actCallouts } from '../src/analysis/callouts';
import { cardResult, fightLine } from '../src/analysis/feedback';
import { content, liveMatch, logHash, piece, toBell } from './helpers';

const FAR = { x: 60, y: 60 };

/** Parks every piece in a corner, clears the structures, then puts the victim in the middle. */
function scene(m: Match): {
  victim: Unit;
  place: (id: PieceId, dx: number, team?: 'A' | 'B') => Unit;
} {
  for (const u of m.state.units) {
    if (u.kind === 'tower' || u.kind === 'guardian') u.alive = false;
    if (u.hero) {
      u.x = u.px = FAR.x;
      u.y = u.py = FAR.y;
    }
  }
  const victim = piece(m, 'A', 'rook');
  victim.hero!.lane = null;
  victim.x = victim.px = 1200;
  victim.y = victim.py = 1200;
  const place = (id: PieceId, dx: number, team: 'A' | 'B' = 'B'): Unit => {
    const u = piece(m, team, id);
    u.x = u.px = 1200 + dx;
    u.y = u.py = 1200;
    return u;
  };
  return { victim, place };
}

const hit = (m: Match, victim: Unit, from: Unit, share: number, back = 0): void => {
  victim.hero!.hits.push({
    tick: m.state.tick - back,
    src: from.id,
    kind: 'hero',
    amount: share * victim.stats.maxHp,
  });
};

describe('why a piece fell', () => {
  const cause = (setup: (m: Match, s: ReturnType<typeof scene>) => void): DeathCause => {
    const m = liveMatch(5, { autoGambits: { A: false, B: false } });
    const s = scene(m);
    setup(m, s);
    return classifyFall(m.ctx, s.victim, null).cause;
  };

  it('reads burst, focus, out of position, outnumbered and an even trade', () => {
    expect(cause((m, s) => hit(m, s.victim, s.place('queen', 150), 0.7))).toBe('burst');
    expect(
      cause((m, s) => {
        for (const [i, id] of (['queen', 'knight', 'bishop'] as PieceId[]).entries())
          hit(m, s.victim, s.place(id, 150 + i * 20), 0.1, i * 20);
      }),
    ).toBe('focus');
    expect(cause((m, s) => hit(m, s.victim, s.place('queen', 150), 0.1))).toBe('outOfPosition');
    expect(
      cause((m, s) => {
        s.place('bishop', 100, 'A');
        for (const id of ['queen', 'knight', 'king'] as PieceId[]) s.place(id, 200);
        hit(m, s.victim, piece(m, 'B', 'queen'), 0.1);
        hit(m, s.victim, piece(m, 'B', 'knight'), 0.1);
      }),
    ).toBe('outnumbered');
    expect(
      cause((m, s) => {
        s.place('bishop', 100, 'A');
        hit(m, s.victim, s.place('queen', 200), 0.2);
      }),
    ).toBe('traded');
  });

  it('records the killer piece and the cause on the death event', () => {
    const m = liveMatch(5, { autoGambits: { A: false, B: false } });
    const qa = piece(m, 'A', 'queen');
    const qb = piece(m, 'B', 'queen');
    qb.x = qb.px = qa.x + 40;
    qb.y = qb.py = qa.y;
    dealDamage(m.ctx, qa, qb, 99999, 'true', 'test');
    m.step(1);
    const death = m.events.find((e) => e.type === 'death' && e.payload.id === qb.id);
    expect(death?.type === 'death' && death.payload.fall).toMatchObject({
      cause: 'burst',
      killer: 'queen',
    });
    expect(qb.hero!.fall?.cause).toBe('burst');
    expect(qb.hero!.hits).toEqual([]);
  });
});

describe('fight verdicts', () => {
  it('a duel that ends in one kill emits exactly one fightEnd with the right counts', () => {
    const m = liveMatch(21, { autoGambits: { A: false, B: false } });
    const qa = piece(m, 'A', 'queen');
    const qb = piece(m, 'B', 'queen');
    const p = lanePoint(m.ctx.world.lanes.top, 0.5);
    for (const [u, dx] of [
      [qa, 0],
      [qb, 60],
    ] as [Unit, number][]) {
      u.x = u.px = p.x + dx;
      u.y = u.py = p.y;
    }
    dealDamage(m.ctx, qa, qb, 40, 'true', 'test');
    dealDamage(m.ctx, qb, qa, 40, 'true', 'test');
    m.step(10);
    expect(m.state.feedback.fights).toHaveLength(1);
    dealDamage(m.ctx, qa, qb, 99999, 'true', 'test');
    m.step(200);
    const ends = m.events.filter((e) => e.type === 'fightEnd');
    expect(ends).toHaveLength(1);
    const f = ends[0].type === 'fightEnd' ? ends[0].payload : null;
    expect(f).toMatchObject({
      zone: 'top',
      lost: { A: 0, B: 1 },
      pieces: { A: ['queen'], B: ['queen'] },
    });
    expect(fightLine(f!)).toBe('Left lane — won 1 for 0');
    expect(m.state.feedback.fights).toHaveLength(0);
  });

  it('every fight in a played match holds both sides, and replays reproduce the new events', () => {
    const m = liveMatch(9, { pauseForBreak: true });
    toBell(m, 'break');
    const ends = m.events.flatMap((e) => (e.type === 'fightEnd' ? [e.payload] : []));
    expect(ends.length).toBeGreaterThan(0);
    for (const f of ends) {
      expect(f.pieces.A.length).toBeGreaterThan(0);
      expect(f.pieces.B.length).toBeGreaterThan(0);
      expect(f.endTick).toBeGreaterThanOrEqual(f.startTick);
    }
    const deaths = (team: 'A' | 'B'): number =>
      m.events.filter(
        (e) => e.type === 'death' && e.payload.kind === 'hero' && e.payload.team === team,
      ).length;
    for (const team of ['A', 'B'] as const)
      expect(ends.reduce((a, f) => a + f.lost[team], 0)).toBeLessThanOrEqual(deaths(team));
    const report = m.snapshot().act.report!;
    expect(report.fights.every((f) => f.lost.A + f.lost.B > 0)).toBe(true);
    for (const team of ['A', 'B'] as const)
      expect(report.teams[team].cards.reduce((a, c) => a + c.plays, 0)).toBe(
        report.teams[team].gambits,
      );
    const again = Match.fromReplay(content, JSON.parse(JSON.stringify(m.exportReplay())));
    expect(logHash(again)).toBe(logHash(m));
  });

  it('coach callouts name a lane lost every time and a piece caught out of position', () => {
    const m = liveMatch(9, { pauseForBreak: true });
    toBell(m, 'break');
    const report: ActReport = structuredClone(m.snapshot().act.report!);
    const me = report.teams.A;
    me.throneLost = false;
    me.bastionsLost = [];
    for (const p of me.pieces) p.deaths = 0;
    me.pieces[0].deaths = 3;
    me.pieces[0].falls = { outOfPosition: 3 };
    const lost = { ...report.fights[0], zone: 'bot' as const, lost: { A: 2, B: 0 } };
    report.fights = [lost, { ...lost, id: 99 }];
    const texts = actCallouts(report).map((c) => c.text);
    expect(texts).toContain('You lost every fight on the Right lane.');
    expect(texts.some((t) => /out of position — consider moving it (Left|Mid|Right)/.test(t))).toBe(
      true,
    );
  });

  it('gambit results say what the sim measured and nothing more', () => {
    const none = {
      dealt: 0,
      structure: 0,
      taken: 0,
      bonus: 0,
      prevented: 0,
      healed: 0,
      kills: 0,
      deaths: 0,
      met: 0,
      drained: 0,
      refund: 0,
      cards: 0,
    };
    expect(cardResult('hold_the_file', { ...none, prevented: 340.4 }, 20)).toBe(
      'turned away about 340 damage',
    );
    expect(cardResult('regroup', { ...none, kills: 2, deaths: 1 }, 15)).toBe(
      'ran 15 s; nearby: 2 pieces felled, 1 lost',
    );
    expect(cardResult('barricade', { ...none, met: 1 }, 20)).toBe('1 enemy unit reached the wall');
  });
});
