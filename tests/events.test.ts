import { describe, expect, it } from 'vitest';
import { Match } from '../src/sim';
import type { GameEvent } from '../src/sim';
import { content, logHash, runAi } from './helpers';

const evEvents = (m: Match): GameEvent[] => m.events.filter((e) => e.type.startsWith('event'));

describe('jungle events', () => {
  it('content defines the four events', () => {
    expect(content.events.map((e) => e.kind).sort()).toEqual([
      'oni',
      'parade',
      'procession',
      'well',
    ]);
  });

  it('are announced before they appear and end cleanly', () => {
    const m = runAi(11);
    const evs = evEvents(m);
    expect(evs.length).toBeGreaterThan(0);
    const warned = new Map<number, number>();
    const started = new Map<number, number>();
    const ended = new Set<number>();
    for (const e of evs) {
      if (e.type === 'eventWarning') {
        warned.set(e.payload.id, e.tick);
        expect(e.payload.inTicks).toBeGreaterThanOrEqual(150);
      } else if (e.type === 'eventStart') {
        const w = warned.get(e.payload.id);
        expect(w).toBeDefined();
        expect(e.tick - w!).toBeGreaterThanOrEqual(150);
        started.set(e.payload.id, e.tick);
      } else if (e.type === 'eventEnd') {
        expect(warned.has(e.payload.id)).toBe(true);
        ended.add(e.payload.id);
      }
    }
    for (const id of warned.keys()) expect(ended.has(id)).toBe(true);
  });

  it('do not exist outside live phases and leave no event units behind', () => {
    const m = Match.create(content, { seed: 5, player: null });
    let sawEvent = false;
    for (let guard = 0; guard < 60 && m.state.phase.kind !== 'end'; guard++) {
      if (m.state.phase.kind === 'live') {
        m.step(20 * 20);
        if (m.snapshot().events.length) sawEvent = true;
        m.step(240 * 20);
      } else m.autoAdvance();
      if (m.state.phase.kind !== 'live') {
        expect(m.snapshot().events).toEqual([]);
        expect(m.state.units.filter((u) => u.ev && u.alive)).toEqual([]);
      }
      if (m.state.phase.n >= 3) break;
    }
    expect(sawEvent || evEvents(m).length > 0).toBe(true);
  });

  it('snapshot exposes warning then active with ticksLeft', () => {
    const seen = new Set<string>();
    const m = Match.create(content, { seed: 21, player: null });
    m.autoAdvance();
    for (let i = 0; i < 240 * 20 && m.state.phase.kind === 'live'; i++) {
      m.step(1);
      for (const e of m.snapshot().events) {
        seen.add(e.phase);
        expect(e.ticksLeft).toBeGreaterThanOrEqual(0);
        expect(typeof e.x).toBe('number');
        expect(e.radius).toBeGreaterThan(0);
      }
    }
    expect(seen.has('warning')).toBe(true);
    expect(seen.has('active')).toBe(true);
  });

  it('rewards are logged and applied', () => {
    let rewards = 0;
    let kills = 0;
    for (const seed of [1, 2, 3, 4, 5, 6]) {
      const m = runAi(seed);
      for (const e of evEvents(m)) {
        if (e.type === 'eventReward') {
          rewards++;
          expect(e.payload.gold + e.payload.points).toBeGreaterThan(0);
        }
        if (e.type === 'eventKill' && e.payload.team !== 'neutral') kills++;
      }
    }
    expect(kills).toBeGreaterThan(0);
    expect(rewards).toBeGreaterThan(0);
  });

  it('same seed gives the same event log hash', () => {
    expect(logHash(runAi(33))).toBe(logHash(runAi(33)));
    const a = evEvents(runAi(33));
    const b = evEvents(runAi(33));
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    expect(JSON.stringify(evEvents(runAi(34)))).not.toBe(JSON.stringify(a));
  });

  it('well and oni sit only on the symmetry axis (equidistant from both bases)', () => {
    for (const seed of [1, 2, 3, 4]) {
      for (const e of evEvents(runAi(seed))) {
        if (e.type !== 'eventWarning') continue;
        if (e.payload.kind === 'well' || e.payload.kind === 'oni')
          expect(Math.abs(e.payload.x - e.payload.y)).toBeLessThan(1.5);
      }
    }
  });
});
