import { describe, expect, it, vi } from 'vitest';
import {
  aiReward,
  applyReward,
  beginMatch,
  newRun,
  recordResult,
  type CarriedRelic,
  type MatchOutcome,
  type RunState,
} from '../src/sim';
import { loadBest, loadRun, RUN_KEY, saveBest, saveRun, type SaveStore } from '../src/ui/run/save';
import { content } from './helpers';

const plain = content.relics.filter((r) => r.bind === 'none' && !r.rally).map((r) => r.id);
const carried = (id: string): CarriedRelic => ({
  id,
  lane: null,
  piece: null,
  card: null,
  trigger: null,
  quota: null,
  reserve: null,
});
function step(run: RunState, won: boolean, o: Partial<MatchOutcome> = {}): RunState {
  const b = beginMatch(content, run, run.court);
  if (!b.ok) throw new Error(b.reason);
  const out: MatchOutcome = {
    winner: won ? 'A' : 'B',
    minutes: 12,
    adjudicated: false,
    mvp: null,
    relics: [],
    styles: {},
    items: {},
    ...o,
  };
  return recordResult(content, b.run, out);
}
function take(run: RunState): RunState {
  const r = applyReward(content, run, aiReward(content, run)!);
  if (!r.ok) throw new Error(r.reason);
  return r.run;
}

describe('Tournament run: save on the device', () => {
  const memory = (): SaveStore & { map: Map<string, string> } => {
    const map = new Map<string, string>();
    return {
      map,
      getItem: (k) => map.get(k) ?? null,
      setItem: (k, v) => void map.set(k, v),
      removeItem: (k) => void map.delete(k),
    };
  };

  it('round-trips a run; an ended run deletes the save; best finish stays', () => {
    const at = memory();
    const run = take(step(newRun(content, 71), true, { relics: [carried(plain[0])] }));
    saveRun(run, at);
    expect(loadRun(content, at)).toEqual(run);
    saveRun(step(run, false), at);
    expect(at.map.has(RUN_KEY)).toBe(false);
    expect(loadRun(content, at)).toBeNull();
    saveBest({ v: 1, round: 1, champion: false }, at);
    expect(loadBest(at)).toEqual({ v: 1, round: 1, champion: false });
  });

  it('drops a bad or old save with a warning, never a crash', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const at = memory();
    at.setItem(RUN_KEY, '{not json');
    expect(loadRun(content, at)).toBeNull();
    at.setItem(RUN_KEY, JSON.stringify({ ...newRun(content, 1), v: 2 }));
    expect(loadRun(content, at)).toBeNull();
    expect(at.map.has(RUN_KEY)).toBe(false);
    at.setItem(RUN_KEY, JSON.stringify({ ...newRun(content, 1), books: ['gone'] }));
    expect(loadRun(content, at)).toBeNull();
    const broken: SaveStore = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
      removeItem: () => {},
    };
    expect(loadRun(content, broken)).toBeNull();
    expect(() => saveRun(newRun(content, 2), broken)).not.toThrow();
    expect(loadRun(content, null)).toBeNull();
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});
