import type { Content, LaneId, PieceId, PlayTeam } from '../sim';
import type { Shot } from '../render/broadcast/types';

/** One piece as placed at the start: where it stands (map units) and its assigned lane. */
export interface IntroPiece {
  id: number;
  team: PlayTeam;
  piece: PieceId;
  lane: LaneId;
  x: number;
  y: number;
}

export type IntroStage = { ms: number } & (
  | { kind: 'card' }
  | { kind: 'court'; team: PlayTeam }
  | { kind: 'lane'; lane: LaneId }
  | { kind: 'roll' }
);

/** The match intro, which holds the sim while it plays. `stage` indexes `introStages`. */
export interface IntroState {
  startedAt: number;
  reduced: boolean;
  stage: number;
  pieces: IntroPiece[];
}

const MOTION: IntroStage[] = [
  { kind: 'card', ms: 2000 },
  { kind: 'court', team: 'A', ms: 1300 },
  { kind: 'court', team: 'B', ms: 1300 },
  { kind: 'lane', lane: 'top', ms: 1000 },
  { kind: 'lane', lane: 'mid', ms: 1000 },
  { kind: 'lane', lane: 'bot', ms: 1000 },
];
/** Reduced motion: the Openings, then every tag and lane at once on a still overview. */
const STILL: IntroStage[] = [
  { kind: 'card', ms: 1600 },
  { kind: 'roll', ms: 2200 },
];

const COURT_RADIUS = 190;
const LANE_RADIUS = 520;

export const introStages = (reduced: boolean): IntroStage[] => (reduced ? STILL : MOTION);

/** The stage playing `elapsed` ms in, or -1 once the intro is over. */
export function stageAt(elapsed: number, reduced: boolean): number {
  let t = 0;
  const stages = introStages(reduced);
  for (let i = 0; i < stages.length; i++) {
    t += stages[i].ms;
    if (elapsed < t) return i;
  }
  return -1;
}

/** The point halfway along a lane's centre line. */
export function laneMid(poly: readonly (readonly number[])[]): { x: number; y: number } {
  let total = 0;
  for (let i = 1; i < poly.length; i++)
    total += Math.hypot(poly[i][0] - poly[i - 1][0], poly[i][1] - poly[i - 1][1]);
  let left = total / 2;
  for (let i = 1; i < poly.length; i++) {
    const len = Math.hypot(poly[i][0] - poly[i - 1][0], poly[i][1] - poly[i - 1][1]);
    if (left <= len && len > 0) {
      const k = left / len;
      return {
        x: poly[i - 1][0] + (poly[i][0] - poly[i - 1][0]) * k,
        y: poly[i - 1][1] + (poly[i][1] - poly[i - 1][1]) * k,
      };
    }
    left -= len;
  }
  const last = poly[poly.length - 1];
  return { x: last[0], y: last[1] };
}

/** What the camera should look at during the current stage (the whole board when it is not zoomed). */
export function introShot(c: Content, intro: IntroState): Shot {
  const stage = introStages(intro.reduced)[intro.stage];
  const half = c.map.size / 2;
  const shot: Shot = {
    kind: 'wide',
    x: half,
    y: half,
    radius: c.map.size * 0.6,
    caption: null,
    cut: false,
    subjects: [],
    priority: 100,
    since: 0,
  };
  if (stage?.kind === 'court') {
    const mine = intro.pieces.filter((p) => p.team === stage.team);
    const n = Math.max(1, mine.length);
    return {
      ...shot,
      kind: 'event',
      x: mine.reduce((a, p) => a + p.x, 0) / n,
      y: mine.reduce((a, p) => a + p.y, 0) / n,
      radius: COURT_RADIUS,
    };
  }
  if (stage?.kind === 'lane')
    return { ...shot, kind: 'event', ...laneMid(c.map.lanes[stage.lane]), radius: LANE_RADIUS };
  return shot;
}
