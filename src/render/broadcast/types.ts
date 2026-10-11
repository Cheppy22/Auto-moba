import type { GameEvent, Snapshot } from '../../sim';

/**
 * board: the fixed war-table view of the whole board (the default; a lane focus leans in).
 * auto: the director picks plays. follow: track one hero. free: drag/zoom by hand.
 */
export type CamMode = 'board' | 'auto' | 'follow' | 'free';

export type PlayKind =
  | 'wide'
  | 'player'
  | 'skirmish'
  | 'teamfight'
  | 'kill'
  | 'multikill'
  | 'structure'
  | 'guardian'
  | 'event';

/** What the camera should be looking at. World coordinates are sim coordinates (0..map size). */
export interface Shot {
  kind: PlayKind;
  x: number;
  y: number;
  /** World radius the frame must contain. */
  radius: number;
  /** Lower-third text, e.g. "Team fight · Mid". Null on the wide shot. */
  caption: string | null;
  /** Hard cut instead of a dolly move. */
  cut: boolean;
  /** Unit ids the shot is about. */
  subjects: number[];
  priority: number;
  /** Tick the shot began. */
  since: number;
}

export interface BroadcastFrame {
  alpha: number;
  shot: Shot;
  mode: CamMode;
  /** Hero to track in follow mode. */
  followId: number | null;
  /** Board mode: a sim point (a lane's middle) to lean in on; null keeps the whole board in view. */
  laneFocus?: { x: number; y: number } | null;
  /** Real milliseconds since the previous frame, for camera easing and visual physics. */
  dtMs: number;
  /** 1 normally; eases to 0 across the bell's halt so walk cycles, effects and water slow with the sim. */
  timeScale: number;
}

/** Events the sim emitted since the previous frame (seq-ordered). */
export type NewEvents = readonly GameEvent[];
export type { GameEvent, Snapshot };
