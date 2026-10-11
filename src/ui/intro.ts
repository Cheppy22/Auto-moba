import type { LaneId, PieceId, PlayTeam } from '../sim';

/** One piece as placed at the start: its team, kind and assigned lane. */
export interface IntroPiece {
  id: number;
  team: PlayTeam;
  piece: PieceId;
  lane: LaneId;
}

/** `show`: the versus card holds until the player starts; `out`: it dissolves into the board. */
export type IntroPhase = 'show' | 'out';

/** The match intro, which holds the sim until the player starts the match. */
export interface IntroState {
  /** When the card went up (a tap in its first moments is the Begin tap finishing, not a start). */
  startedAt: number;
  reduced: boolean;
  phase: IntroPhase;
  /** When the dissolve began, or null while the card holds. */
  outAt: number | null;
  pieces: IntroPiece[];
  /** Portraits of the pieces' own 3D models (data URLs by `piece:team`); null until drawn (the glyph stands in) or if they could not be drawn. */
  portraits: ReadonlyMap<string, string> | null;
}

/**
 * The card has no timer: it plays its 1.8 s entrance (fade and settle, dividers drawn; a plain
 * fade with reduced motion) and then holds until the player taps, presses Begin, Enter or Space.
 * Then it dissolves for this long and the match starts.
 */
export const introOutMs = (reduced: boolean): number => (reduced ? 300 : 700);
