import type { Match, Unit } from '../../sim';
import { PIECE_ORDER } from '../pieces';

/** A team's five pieces in court order (King, Queen, Rook, Bishop, Knight). */
export function courtUnits(m: Match, team: 'A' | 'B'): Unit[] {
  return m.state.teams[team].heroIds
    .map((id) => m.unitById(id))
    .filter((u): u is Unit => !!u && !!u.hero)
    .sort((a, b) => PIECE_ORDER.indexOf(a.hero!.defId) - PIECE_ORDER.indexOf(b.hero!.defId));
}
