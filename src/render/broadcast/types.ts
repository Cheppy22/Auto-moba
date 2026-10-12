import type { GameEvent, Snapshot } from '../../sim';

/**
 * free: the player's camera (the default: pan, zoom, turn and tilt by hand).
 * auto: the director follows the big plays. follow: track one unit. lane: lean in on one lane
 * (drag along it, pinch to zoom).
 */
export type CamMode = 'free' | 'auto' | 'follow' | 'lane';

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
  /** Unit to track in follow mode. */
  followId: number | null;
  /** Lane mode: a sim point (the lane's middle) to lean in on. */
  laneFocus?: { x: number; y: number } | null;
  /** Real milliseconds since the previous frame, for camera easing and visual physics. */
  dtMs: number;
  /** 1 normally; eases to 0 across the bell's halt so walk cycles, effects and water slow with the sim. */
  timeScale: number;
}

/** Events the sim emitted since the previous frame (seq-ordered). */
export type NewEvents = readonly GameEvent[];
export type { GameEvent, Snapshot };
