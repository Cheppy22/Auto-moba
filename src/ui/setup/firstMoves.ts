import type { AdviceReason, FirstMoveView, PieceId } from '../../sim';

export type FirstMoveRow = FirstMoveView['pieces'][number];

/** The piece's own picks on the First moves page (a card id each); "Pick for me" fills the rest. */
export type Picks = Partial<Record<PieceId, string>>;

/** Index of the card a piece will start with, or null when it is left open (Pick for me off). */
export function chosenIndex(row: FirstMoveRow, pick: string | undefined, pickForMe: boolean) {
  const own = pick === undefined ? -1 : row.cards.findIndex((c) => c.id === pick);
  if (own >= 0) return own;
  return pickForMe ? row.suggested : null;
}

/** Whose choice it is: yours, the AI's (Pick for me) or still open (the AI takes it at Begin). */
export type Source = 'yours' | 'ai' | 'open';

export function sourceOf(row: FirstMoveRow, pick: string | undefined, pickForMe: boolean): Source {
  if (pick !== undefined && row.cards.some((c) => c.id === pick)) return 'yours';
  return pickForMe ? 'ai' : 'open';
}

/**
 * What `setupTeam` carries for each piece: the card it starts with. A piece left open is left
 * out, and the match deals it the card "AI suggests" showed.
 */
export function firstMovesToSend(
  view: FirstMoveView,
  picks: Picks,
  pickForMe: boolean,
): Partial<Record<PieceId, string>> {
  const out: Partial<Record<PieceId, string>> = {};
  for (const row of view.pieces) {
    const i = chosenIndex(row, picks[row.piece], pickForMe);
    if (i !== null) out[row.piece] = row.cards[i].id;
  }
  return out;
}

/** Pieces whose earlier pick is no longer one of their cards (the Opening changed the deal). */
export function lostPicks(view: FirstMoveView, picks: Picks): PieceId[] {
  return view.pieces
    .filter((r) => picks[r.piece] !== undefined && !r.cards.some((c) => c.id === picks[r.piece]))
    .map((r) => r.piece);
}

/** Why "Pick for me" points at a piece, in plain words. */
export const REASON_TEXT: Record<AdviceReason, string> = {
  combination: 'One card completes a Combination.',
  sharp: 'The offer is Sharp, so every number is bigger.',
  brilliant: 'The offer is Brilliant, so every number is bigger.',
  carry: 'This piece will deal most of your damage.',
  spread: 'The three cards are far apart in value.',
};

export function reasonLine(reasons: readonly AdviceReason[]): string {
  return reasons.length > 0 ? REASON_TEXT[reasons[0]] : 'The cards here differ the most.';
}
