import { describe, expect, it } from 'vitest';
import { NUDGES, TUTORIAL_KEY, Tutorial, captureLine, firstSentence } from '../src/ui/tutorial';

/** A stand-in for localStorage. */
function fakeStore(initial?: string) {
  const data = new Map<string, string>();
  if (initial !== undefined) data.set(TUTORIAL_KEY, initial);
  return {
    data,
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
  };
}

describe('Tutorial', () => {
  it('shows each nudge once, remembers it, and survives a reload', () => {
    const store = fakeStore();
    const t = new Tutorial(true, store);
    expect(NUDGES.every((id) => t.canShow(id))).toBe(true);
    t.seen('tempo');
    expect(t.canShow('tempo')).toBe(false);
    expect(t.canShow('fork')).toBe(true);
    // a new page load reads the same store
    const again = new Tutorial(true, store);
    expect(again.canShow('tempo')).toBe(false);
    expect(again.canShow('break')).toBe(true);
  });

  it('skip turns everything off for good, replay turns it back on', () => {
    const store = fakeStore();
    const t = new Tutorial(true, store);
    t.skipAll();
    expect(NUDGES.some((id) => t.canShow(id))).toBe(false);
    expect(t.active).toBe(false);
    expect(new Tutorial(true, store).active).toBe(false);
    t.replay();
    expect(NUDGES.every((id) => t.canShow(id))).toBe(true);
    expect(new Tutorial(true, store).canShow('tempo')).toBe(true);
  });

  it('is inactive when disabled (end-to-end tests)', () => {
    const t = new Tutorial(false, fakeStore());
    expect(t.active).toBe(false);
    expect(t.canShow('tempo')).toBe(false);
  });

  it('is done once every nudge was shown', () => {
    const t = new Tutorial(true, fakeStore());
    for (const id of NUDGES) t.seen(id);
    expect(t.active).toBe(false);
  });

  it('starts over from a bad or old save, and never throws without storage or on a blocked write', () => {
    expect(new Tutorial(true, fakeStore('{not json')).canShow('tempo')).toBe(true);
    expect(new Tutorial(true, fakeStore('{"v":2,"seen":["tempo"]}')).canShow('tempo')).toBe(true);
    expect(
      new Tutorial(true, fakeStore('{"v":1,"seen":["tempo","bogus"],"off":false}')).canShow(
        'tempo',
      ),
    ).toBe(false);
    const none = new Tutorial(true, null);
    none.seen('tempo');
    none.skipAll();
    none.replay();
    const blocked = new Tutorial(true, {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
    });
    expect(blocked.canShow('tempo')).toBe(true);
    expect(() => blocked.seen('tempo')).not.toThrow();
    expect(blocked.canShow('tempo')).toBe(false);
  });
});

describe('nudge text', () => {
  it('firstSentence keeps one short sentence', () => {
    expect(firstSentence("That lane's pawns hit harder. They also move faster for 15 s.")).toBe(
      "That lane's pawns hit harder.",
    );
    expect(firstSentence('No full stop here')).toBe('No full stop here');
    const long = firstSentence(`${'word '.repeat(60)}end.`);
    expect(long.length).toBeLessThanOrEqual(110);
    expect(long.endsWith('…')).toBe(true);
  });

  it('captureLine says who took whom, when it returns and why it matters', () => {
    const line = captureLine({
      taker: 'A',
      takerName: 'Knight',
      victimName: 'Rook',
      backIn: 45,
      courtB: 'Black',
      tempo: 5,
    });
    expect(line).toContain("Your Knight took Black's Rook.");
    expect(line).toContain('out for 0:45');
    expect(line).toContain('You gain 5 Tempo');
    const theirs = captureLine({
      taker: 'B',
      takerName: 'camp creature',
      victimName: 'Bishop',
      backIn: null,
      courtB: 'Black',
      tempo: 5,
    });
    expect(theirs).toContain("Black's camp creature took your Bishop.");
    expect(theirs).toContain('cannot come back');
    expect(theirs).toContain('Black gains Tempo');
  });
});
