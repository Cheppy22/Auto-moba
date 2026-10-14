import { describe, expect, it } from 'vitest';
import { shownItems } from '../src/ui/hud/blackItems';
import { liveMatch, piece, toBell } from './helpers';
import type { PieceId } from '../src/sim';

const PIECES: PieceId[] = ['king', 'queen', 'rook', 'bishop', 'knight'];

describe('Black’s hidden break purchases', () => {
  it('shows Black’s bag as it was when the bell rang until the next Act starts', () => {
    const m = liveMatch(5, { pauseForBreak: true, relics: { A: 'ai' } });
    toBell(m, 'halt');
    // the bag of every Black piece just before the break shop runs
    const before = PIECES.map((p) => piece(m, 'B', p).hero!.items.slice());
    toBell(m, 'break');
    let bought = 0;
    PIECES.forEach((p, i) => {
      const u = piece(m, 'B', p);
      bought += u.hero!.items.length === before[i].length ? 0 : 1;
      expect(shownItems(m, u).sort(), p).toEqual(before[i].slice().sort());
    });
    expect(bought, 'Black bought something at this break').toBeGreaterThan(0);
    // White's own bags are never hidden
    const q = piece(m, 'A', 'queen');
    expect(shownItems(m, q)).toEqual(q.hero!.items);
    // Resume: the new items show
    m.issue({ type: 'resumeAct' });
    for (const p of PIECES) {
      const u = piece(m, 'B', p);
      expect(shownItems(m, u)).toEqual(u.hero!.items);
    }
  });
});
