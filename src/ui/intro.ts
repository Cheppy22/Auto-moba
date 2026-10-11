import type { LaneId, PieceId, PlayTeam } from '../sim';

/** One piece as placed at the start: its team, kind and assigned lane. */
export interface IntroPiece {
  id: number;
  team: PlayTeam;
  piece: PieceId;
  lane: LaneId;
}

/** `wait`: the board is still being built; `show`: the versus card plays; `out`: it dissolves. */
export type IntroPhase = 'wait' | 'show' | 'out';

/** The match intro, which holds the sim while it plays. */
export interface IntroState {
  startedAt: number;
  reduced: boolean;
  phase: IntroPhase;
  pieces: IntroPiece[];
  /** Portraits of the pieces' own 3D models (data URLs by `piece:team`); null while drawing or if they could not be drawn. */
  portraits: ReadonlyMap<string, string> | null;
  /** True once the portraits are drawn or have failed: the clock waits for it. */
  portraitsDone: boolean;
}

/**
 * When the card starts to dissolve and when the intro ends, in ms after its clock starts (the
 * 3D view's first frame). Motion: the header and pieces fade and settle in together by 1.5 s, the
 * dividers draw until 1.8 s, then it holds before a 0.8 s dissolve into the board. Reduced
 * motion: a plain fade in, a longer still hold, a short fade out.
 */
const TIMING = {
  motion: { outAt: 5900, endAt: 6700 },
  reduced: { outAt: 3500, endAt: 4000 },
} as const;

export const introTiming = (reduced: boolean): { outAt: number; endAt: number } =>
  reduced ? TIMING.reduced : TIMING.motion;

/** The phase `elapsed` ms into the intro, or null once it is over. */
export function phaseAt(elapsed: number, reduced: boolean): 'show' | 'out' | null {
  const t = introTiming(reduced);
  if (elapsed >= t.endAt) return null;
  return elapsed >= t.outAt ? 'out' : 'show';
}
