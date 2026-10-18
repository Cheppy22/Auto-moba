import { describe, expect, it } from 'vitest';
import { Match } from '../src/sim';
import type { PieceId } from '../src/sim';
import {
  chosenIndex,
  firstMovesToSend,
  lostPicks,
  reasonLine,
  sourceOf,
} from '../src/ui/setup/firstMoves';
import { ledgerRows } from '../src/ui/TechniqueCard';
import { content, piece } from './helpers';

const setupMatch = (seed = 41, heirlooms?: Partial<Record<PieceId, string>>): Match =>
  Match.create(content, {
    seed,
    autoGambits: { A: true, B: true },
    ...(heirlooms ? { relicMax: 5, start: { A: { heirlooms } } } : {}),
  });

describe('First moves page rules', () => {
  const view = setupMatch().firstMoves();
  const row = view.pieces[0];

  it('Pick for me chooses the AI card, your pick overrides it, and off leaves the piece open', () => {
    expect(chosenIndex(row, undefined, true)).toBe(row.suggested);
    expect(sourceOf(row, undefined, true)).toBe('ai');
    const other = row.cards.findIndex((_c, i) => i !== row.suggested);
    expect(chosenIndex(row, row.cards[other].id, true)).toBe(other);
    expect(sourceOf(row, row.cards[other].id, true)).toBe('yours');
    // off: no pre-selection, but an own pick still stands
    expect(chosenIndex(row, undefined, false)).toBeNull();
    expect(sourceOf(row, undefined, false)).toBe('open');
    expect(chosenIndex(row, row.cards[other].id, false)).toBe(other);
  });

  it('sends one card per chosen piece and leaves open pieces out', () => {
    const all = firstMovesToSend(view, {}, true);
    expect(Object.keys(all).sort()).toEqual(view.pieces.map((p) => p.piece).sort());
    for (const p of view.pieces) expect(all[p.piece]).toBe(p.cards[p.suggested!].id);
    expect(firstMovesToSend(view, {}, false)).toEqual({});
    const mine = view.pieces[1];
    const pick = mine.cards.find((_c, i) => i !== mine.suggested)!.id;
    const some = firstMovesToSend(view, { [mine.piece]: pick }, false);
    expect(some).toEqual({ [mine.piece]: pick });
  });

  it('drops a pick that is no longer one of the piece’s cards (the Opening changed the deal)', () => {
    const p = view.pieces[2];
    expect(lostPicks(view, { [p.piece]: p.cards[0].id })).toEqual([]);
    expect(lostPicks(view, { [p.piece]: 'not_a_card' })).toEqual([p.piece]);
    expect(firstMovesToSend(view, { [p.piece]: 'not_a_card' }, false)).toEqual({});
    expect(firstMovesToSend(view, { [p.piece]: 'not_a_card' }, true)[p.piece]).toBe(
      p.cards[p.suggested!].id,
    );
  });

  it('every advice reason has a plain sentence', () => {
    expect(reasonLine(['carry'])).toMatch(/top-damage piece/);
    expect(reasonLine(['combination', 'sharp'])).toMatch(/^A Combination is on offer; /);
    expect(reasonLine([])).not.toBe('');
  });

  it('a pick sent with Begin is the card the piece starts with', () => {
    const m = setupMatch(52);
    const v = m.firstMoves();
    const pieces = m.defaultSetup().pieces;
    const sends = firstMovesToSend(
      v,
      { bishop: v.pieces.find((p) => p.piece === 'bishop')!.cards[2].id },
      true,
    );
    m.issue({
      type: 'setupTeam',
      opening: m.defaultSetup().opening,
      pieces: pieces.map((e) => ({ ...e, firstMove: sends[e.piece] })),
    });
    for (const p of v.pieces) {
      const held = piece(m, 'A', p.piece).hero!.techniques.map((t) => t.id);
      expect(held).toEqual([sends[p.piece]]);
    }
  });
});

describe('First moves cards carry real numbers', () => {
  it('prices each card on the piece: stats before and after equal what the started match shows', () => {
    const m = setupMatch(41);
    const view = m.firstMoves();
    for (const row of view.pieces)
      for (const c of row.cards) {
        expect(c.preview, `${row.piece} ${c.id}`).not.toBeNull();
        expect(c.preview!.estimate).toBeNull();
      }
    // some card changes a stat or a skill, so the page has numbers to show
    const changes = view.pieces
      .flatMap((r) => r.cards)
      .filter((c) => {
        const p = c.preview!;
        return p.ability !== null || JSON.stringify(p.before) !== JSON.stringify(p.after);
      });
    expect(changes.length).toBeGreaterThan(0);
    // the match deals the suggested cards; the piece's stats are the preview's "after"
    m.issue({ type: 'setupTeam', ...m.defaultSetup() });
    for (const row of view.pieces) {
      const u = piece(m, 'A', row.piece);
      const after = row.cards[row.suggested!].preview!.after;
      expect(u.stats.maxHp).toBeCloseTo(after.maxHp, 6);
      expect(u.stats.bladeDmg).toBeCloseTo(after.bladeDmg, 6);
      expect(u.stats.armor).toBeCloseTo(after.armor, 6);
      expect(u.stats.moveSpeed).toBeCloseTo(after.moveSpeed, 6);
    }
  });

  it('the ledger lists the numbers a card changes, and nothing for a rule that changes none', () => {
    const view = setupMatch(41).firstMoves();
    const all = view.pieces.flatMap((r) => r.cards);
    const rows = all.map((c) => ledgerRows(c.preview!));
    expect(rows.some((r) => r.length > 0)).toBe(true);
    expect(rows.some((r) => r.length === 0)).toBe(true);
    for (const list of rows) {
      expect(list.length).toBeLessThanOrEqual(4);
      for (const r of list) {
        expect(r.before).not.toBe(r.after);
        expect(r.label).not.toBe('');
      }
    }
    // a card that only changes a number lists exactly that number, before and after
    const reach = all.find((c) => c.id === 'long_range');
    if (reach)
      expect(ledgerRows(reach.preview!)).toEqual([
        { label: 'Reach', before: '80', after: '100', better: true },
      ]);
  });

  it('reading them leaves the match untouched', () => {
    const m = setupMatch(41);
    const before = JSON.stringify(m.state);
    m.firstMoves();
    m.firstMoves('french');
    expect(JSON.stringify(m.state)).toBe(before);
  });
});

describe('First moves in a run with an heirloom', () => {
  it('shows the cards the match will deal: the first move is drawn for another slot', () => {
    const heir = content.techniqueById.get('deep_breath')!;
    const m = setupMatch(12, { rook: heir.id });
    const view = m.firstMoves();
    const rook = view.pieces.find((p) => p.piece === 'rook')!;
    expect(rook.cards.length).toBeGreaterThan(0);
    for (const c of rook.cards) expect(c.slot).not.toBe(heir.slot);
    // what the page showed is what the match deals
    m.issue({ type: 'setupTeam', ...m.defaultSetup() });
    const held = piece(m, 'A', 'rook').hero!.techniques.map((t) => t.id);
    expect(held).toContain(heir.id);
    expect(held).toContain(rook.cards[rook.suggested!].id);
    expect(held).toHaveLength(2);
  });
});
