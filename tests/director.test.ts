import { describe, expect, it } from 'vitest';
import type { GameEvent, SnapEvent, SnapUnit, Snapshot } from '../src/sim';
import { Director } from '../src/render/broadcast/director';
import type { Shot } from '../src/render/broadcast/types';
import { content, liveMatch } from './helpers';

/** The test positions below are on a map 1000 across; the map is bigger now. */
const K = content.map.size / 1000;

const unit = (id: number, team: 'A' | 'B', x: number, y: number, o: Partial<SnapUnit> = {}) =>
  ({
    id,
    kind: 'hero',
    team,
    defId: 'hero',
    x: x * K,
    y: y * K,
    px: x * K,
    py: y * K,
    hp: 100,
    maxHp: 100,
    shield: 0,
    alive: true,
    piece: null,
    style: null,
    path: null,
    rank: 1,
    forkPending: false,
    pawn: false,
    lane: null,
    role: null,
    marked: false,
    stunned: false,
    attackKind: null,
    recalling: false,
    goal: null,
    slot: 0,
    range: 100,
    claim: 0,
    curse: false,
    holy: false,
    target: null,
    flash: false,
    inCombat: false,
    ...o,
  }) satisfies SnapUnit;

const snap = (tick: number, units: SnapUnit[] = [], o: Partial<Snapshot> = {}): Snapshot => ({
  tick,
  phase: { kind: 'live', n: 1, startTick: 0 },
  winner: null,
  units,
  slots: [],
  pressure: [],
  points: { A: 0, B: 0 },
  keeper: null,
  phaseTicksLeft: 0,
  events: [],
  act: 1,
  tempo: { A: 0, B: 0 },
  hand: [],
  pawns: { A: { alive: 0, cap: 8, cost: 15 }, B: { alive: 0, cap: 8, cost: 15 } },
  forks: [],
  check: { A: false, B: false },
  throneDown: { A: false, B: false },
  zones: [],
  ...o,
});

let seq = 0;
const death = (tick: number, id: number, x: number, y: number): GameEvent => ({
  tick,
  seq: ++seq,
  type: 'death',
  payload: {
    id,
    kind: 'hero',
    team: 'A',
    killer: 90,
    killerKind: 'hero',
    assists: [],
    x: x * K,
    y: y * K,
  },
});
const towerDown = (tick: number, x: number, y: number): GameEvent => ({
  tick,
  seq: ++seq,
  type: 'structureDown',
  payload: { kind: 'tower', team: 'B', lane: 'top', index: 0, killer: 90, x: x * K, y: y * K },
});
const guardianHit = (tick: number, tgt: number): GameEvent => ({
  tick,
  seq: ++seq,
  type: 'damage',
  payload: {
    src: 90,
    tgt,
    srcKind: 'hero',
    tgtKind: 'guardian',
    srcTeam: 'A',
    tgtTeam: 'B',
    amount: 10,
    dtype: 'blade',
    origin: 'attack',
    lethal: false,
  },
});

const fightUnits = (cx: number, cy: number, perSide = 3): SnapUnit[] => {
  const us: SnapUnit[] = [];
  for (let i = 0; i < perSide; i++) {
    us.push(unit(1 + i, 'A', cx - 30, cy + i * 20));
    us.push(unit(11 + i, 'B', cx + 30, cy + i * 20));
  }
  return us;
};

const captionAt = (x: number, y: number): string | null => {
  const d = new Director(content);
  return d.update(snap(1000), [death(1000, 1, x, y)]).caption;
};

describe('Director', () => {
  it('shows the wide shot when nothing is happening', () => {
    const d = new Director(content);
    const size = content.map.size;
    const quiet = [unit(1, 'A', 120, 880), unit(11, 'B', 880, 120)];
    for (const units of [[], quiet]) {
      const s = d.update(snap(100, units), []);
      expect(s).toMatchObject({
        kind: 'wide',
        x: size / 2,
        y: size / 2,
        caption: null,
        cut: false,
      });
      expect(s.radius).toBeCloseTo(size * 0.6);
      expect(s.subjects).toEqual([]);
      expect(s.priority).toBe(0);
    }
  });

  it('turns a hero death into a kill shot held for at least 60 ticks', () => {
    const d = new Director(content);
    const s = d.update(snap(1000), [death(1000, 1, 110, 500)]);
    expect(s).toMatchObject({
      kind: 'kill',
      priority: 60,
      caption: 'Hero down · Left',
      x: 110 * K,
      y: 500 * K,
      since: 1000,
    });
    expect(s.subjects).toEqual([1, 90]);
    for (const t of [1001, 1030, 1059, 1060, 1099]) {
      const next = d.update(snap(t), []);
      expect(next.kind).toBe('kill');
      expect(next.since).toBe(1000);
    }
    expect(d.update(snap(1100), []).kind).toBe('wide');
  });

  it('only lets a play 15 priority higher preempt within the hold', () => {
    const d = new Director(content);
    d.update(snap(1000), [death(1000, 1, 110, 500)]);
    const cluster = fightUnits(500, 500);
    expect(d.update(snap(1010, cluster), []).kind).toBe('kill');
    const guardian = unit(50, 'B', 880, 120, { kind: 'guardian', hp: 50, maxHp: 100 });
    const hit = guardianHit(1020, 50);
    const s = d.update(snap(1020, [...cluster, guardian]), [hit]);
    expect(s).toMatchObject({ kind: 'guardian', since: 1020, priority: 90 });
  });

  it('moves on to a lower play once the hold is over', () => {
    const d = new Director(content);
    d.update(snap(1000), [death(1000, 1, 110, 500)]);
    const cluster = fightUnits(500, 500);
    expect(d.update(snap(1059, cluster), []).kind).toBe('kill');
    expect(d.update(snap(1060, cluster), []).kind).toBe('teamfight');
  });

  it('cuts hard on a structure fall and holds the rubble', () => {
    const d = new Director(content);
    const s = d.update(snap(2000), [towerDown(2000, 110, 350)]);
    expect(s).toMatchObject({ kind: 'structure', caption: 'Tower falls · Left', cut: true });
    expect(s.radius).toBeGreaterThanOrEqual(140 * K);
    expect(d.update(snap(2000), []).cut).toBe(true);
    const later = d.update(snap(2001), []);
    expect(later).toMatchObject({ kind: 'structure', cut: false, since: 2000 });
    expect(d.update(snap(2079), []).kind).toBe('structure');
    expect(d.update(snap(2080), []).kind).toBe('structure');
    expect(d.update(snap(2120), []).kind).toBe('wide');
  });

  it('cuts only when the focus jumps far', () => {
    const near = new Director(content);
    near.update(snap(1000), [death(1000, 1, 110, 500)]);
    expect(near.update(snap(1070), [death(1070, 2, 150, 500)]).cut).toBe(false);

    const far = new Director(content);
    far.update(snap(1000), [death(1000, 1, 110, 500)]);
    const s = far.update(snap(1070), [death(1070, 2, 890, 500)]);
    expect(s).toMatchObject({ kind: 'kill', cut: true });
    expect(far.update(snap(1071), []).cut).toBe(false);
  });

  it('frames a team fight and follows it without resetting since', () => {
    const d = new Director(content);
    const s = d.update(snap(1000, fightUnits(500, 500)), []);
    expect(s).toMatchObject({ kind: 'teamfight', priority: 70, caption: 'Team fight · Mid' });
    expect(s.subjects).toEqual([1, 2, 3, 11, 12, 13]);
    expect(s.x).toBeCloseTo(500 * K);
    expect(s.radius).toBeGreaterThanOrEqual(140 * K);
    expect(s.radius).toBeLessThanOrEqual(520 * K);
    const moved = d.update(snap(1030, fightUnits(540, 520)), []);
    expect(moved.since).toBe(1000);
    expect(moved.x).toBeCloseTo(540 * K);
    expect(moved.cut).toBe(false);
  });

  it('ignores dead heroes and thin or scattered sides when clustering', () => {
    const dead = fightUnits(500, 500).map((u) => (u.id === 1 ? { ...u, alive: false } : u));
    expect(new Director(content).update(snap(1000, dead), []).kind).not.toBe('teamfight');
    expect(new Director(content).update(snap(1000, fightUnits(500, 500, 2)), []).kind).not.toBe(
      'teamfight',
    );
    const scattered = [
      ...fightUnits(200, 200).filter((u) => u.team === 'A'),
      ...fightUnits(800, 800).filter((u) => u.team === 'B'),
    ];
    expect(new Director(content).update(snap(1000, scattered), []).kind).not.toBe('teamfight');
  });

  it('calls a small fight a skirmish', () => {
    const us = [unit(1, 'A', 300, 700, { target: 11 }), unit(11, 'B', 340, 700)];
    const s = new Director(content).update(snap(1000, us), []);
    expect(s).toMatchObject({ kind: 'skirmish', priority: 40, subjects: [1, 11] });
    expect(s.caption).toMatch(/^Skirmish · /);
  });

  it('names kills by the nearest lane, jungle and base', () => {
    expect(captionAt(110, 500)).toBe('Hero down · Left');
    expect(captionAt(300, 700)).toBe('Hero down · Mid');
    expect(captionAt(890, 500)).toBe('Hero down · Right');
    expect(captionAt(500, 300)).toBe('Hero down · Mid jungle');
    expect(captionAt(330, 330)).toBe('Hero down · Left jungle');
    expect(captionAt(670, 670)).toBe('Hero down · Right jungle');
    expect(captionAt(150, 850)).toBe('Hero down · Base');
    expect(captionAt(880, 120)).toBe('Hero down · Base');
  });

  it('escalates nearby deaths to a double and triple kill', () => {
    const d = new Director(content);
    expect(d.update(snap(1000), [death(1000, 1, 890, 400)]).kind).toBe('kill');
    const dbl = d.update(snap(1050), [death(1050, 2, 890, 460)]);
    expect(dbl).toMatchObject({ kind: 'multikill', priority: 80, since: 1050 });
    expect(dbl.caption).toBe('Double kill · Right');
    expect(dbl.subjects).toEqual([1, 2]);
    const tpl = d.update(snap(1100), [death(1100, 3, 890, 430)]);
    expect(tpl).toMatchObject({ kind: 'multikill', caption: 'Triple kill · Right', since: 1050 });
    expect(d.update(snap(1179), []).kind).toBe('multikill');
  });

  it('does not link deaths that are far apart in time or space', () => {
    const slow = new Director(content);
    slow.update(snap(1000), [death(1000, 1, 890, 400)]);
    expect(slow.update(snap(1200), [death(1200, 2, 890, 420)]).kind).toBe('kill');
    const apart = new Director(content);
    apart.update(snap(1000), [death(1000, 1, 110, 500)]);
    expect(apart.update(snap(1050), [death(1050, 2, 890, 500)]).kind).toBe('kill');
  });

  it('uses the event name for an active jungle event with heroes inside', () => {
    const oni: SnapEvent = {
      id: 'hungry_oni#2',
      kind: 'hungry_oni',
      type: 'oni',
      name: 'Hungry Oni',
      slot: 'tlc',
      x: 330 * K,
      y: 330 * K,
      radius: 90,
      phase: 'active',
      ticksLeft: 400,
    };
    const near = [unit(1, 'A', 350, 330), unit(11, 'B', 800, 800)];
    const d = new Director(content);
    expect(d.update(snap(1000, near, { events: [{ ...oni, phase: 'warning' }] }), []).kind).toBe(
      'wide',
    );
    expect(d.update(snap(1001, [near[1]!], { events: [oni] }), []).kind).toBe('wide');
    const s = d.update(snap(1002, near, { events: [oni] }), []);
    expect(s).toMatchObject({ kind: 'event', caption: 'Hungry Oni', priority: 50, subjects: [1] });
    expect([s.x, s.y]).toEqual([330 * K, 330 * K]);
  });

  it('watches a guardian under siege or on the march', () => {
    const g = unit(50, 'B', 880, 120, { kind: 'guardian', hp: 60, maxHp: 100 });
    const d = new Director(content);
    expect(d.update(snap(1000, [g]), []).kind).toBe('wide');
    const siege = d.update(snap(1010, [g]), [guardianHit(1010, 50)]);
    expect(siege).toMatchObject({ kind: 'guardian', caption: 'King under siege' });
    expect(d.update(snap(1100, [g]), []).kind).toBe('guardian');
    expect(d.update(snap(1140, [g]), []).kind).toBe('wide');

    const roamer = { ...g, x: 700 * K, y: 300 * K };
    const late = { phase: { kind: 'live', n: 7, startTick: 0 } } as const;
    const march = new Director(content).update(snap(5000, [roamer], late), []);
    expect(march).toMatchObject({ kind: 'guardian', caption: 'The King marches' });
    const home = new Director(content).update(snap(5000, [g], late), []);
    expect(home.kind).toBe('wide');
  });

  it('resets when time goes backwards or the phase is not live', () => {
    const d = new Director(content);
    expect(d.update(snap(5000), [death(5000, 1, 110, 500)]).kind).toBe('kill');
    expect(d.update(snap(10), []).kind).toBe('wide');
    d.update(snap(6000), [death(6000, 2, 110, 500)]);
    const prep = snap(6001, [], { phase: { kind: 'setup', n: 0, startTick: 6001 } });
    expect(d.update(prep, []).kind).toBe('wide');
  });

  it('is deterministic and repeatable within a tick', () => {
    const script = (): Shot[] => {
      const d = new Director(content);
      const out: Shot[] = [];
      for (let t = 0; t < 400; t += 10) {
        const evs: GameEvent[] = [];
        if (t === 50) evs.push(death(t, 1, 300, 700));
        if (t === 90) evs.push(death(t, 2, 320, 690));
        if (t === 200) evs.push(towerDown(t, 110, 350));
        const units = t >= 250 ? fightUnits(500 + t / 10, 500) : [];
        out.push(d.update(snap(t, units), evs), d.update(snap(t, units), []));
      }
      return out;
    };
    const a = script();
    expect(a).toEqual(script());
    for (let i = 0; i < a.length; i += 2) expect(a[i]).toEqual(a[i + 1]);
    expect(new Set(a.map((s) => s.kind))).toEqual(
      new Set(['wide', 'kill', 'multikill', 'structure', 'teamfight']),
    );
  });

  it('survives a real headless match with valid shots', () => {
    const m = liveMatch(7);
    const d = new Director(content);
    const size = content.map.size;
    const kinds = new Set<string>();
    let fed = 0;
    for (let guard = 0; guard < 400 && m.state.tick < 6000; guard++) {
      if (m.state.phase.kind !== 'live') break;
      m.step(10);
      const events = m.events.slice(fed);
      fed = m.events.length;
      const snapshot = m.snapshot();
      const s = d.update(snapshot, events);
      kinds.add(s.kind);
      for (const n of [s.x, s.y, s.radius, s.since, s.priority])
        expect(Number.isFinite(n)).toBe(true);
      expect(s.x).toBeGreaterThanOrEqual(0);
      expect(s.x).toBeLessThanOrEqual(size);
      expect(s.y).toBeGreaterThanOrEqual(0);
      expect(s.y).toBeLessThanOrEqual(size);
      expect(s.radius).toBeGreaterThanOrEqual(140 * K);
      expect(s.radius).toBeLessThanOrEqual(size * 0.6);
      expect(s.since).toBeLessThanOrEqual(snapshot.tick);
      expect(s.caption === null).toBe(s.kind === 'wide');
      if (s.kind !== 'wide') expect(s.radius).toBeLessThanOrEqual(520 * K);
    }
    expect(m.state.tick).toBeGreaterThan(2000);
    expect([...kinds].filter((k) => k !== 'wide').length).toBeGreaterThan(0);
  });
});
