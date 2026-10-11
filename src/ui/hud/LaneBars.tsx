import type { LaneId } from '../../sim';
import { laneName } from '../../analysis/text';
import { LANES, LANE_TAG } from '../pieces';

function words(v: number): string {
  if (v > 0.15) return 'White pushing';
  if (v < -0.15) return 'Black pushing';
  return 'even';
}

/**
 * Three tug-of-war bars, Left / Mid / Right: the ivory side is White's push, the slate side
 * Black's, and the seam sits where the lane is being held. No numbers; the seam glides.
 */
export function LaneBars(props: {
  lanes: Record<LaneId, number>;
  big?: boolean;
  testid?: string;
  /** Live strip: each lane is a button that leans the board camera in on it. */
  onPick?: (lane: LaneId) => void;
  active?: LaneId | null;
}) {
  const label = LANES.map((l) => `${laneName(l)} ${words(props.lanes[l])}`).join(', ');
  return (
    <div
      class={`lanebars ${props.big ? 'big' : ''}`}
      data-testid={props.testid ?? 'lane-strip'}
      role="img"
      aria-label={`Lane momentum: ${label}`}
      title={label}
    >
      {LANES.map((l) => {
        const v = Math.max(-1, Math.min(1, props.lanes[l]));
        const inner = (
          <>
            <i class="lane-letter">{props.big ? laneName(l) : LANE_TAG[l]}</i>
            <span class="lane-track">
              <span class="lane-white" style={{ width: `${((1 + v) / 2) * 100}%` }} />
              <span class="lane-mid" />
            </span>
          </>
        );
        const pick = props.onPick;
        return pick ? (
          <button
            class={`lanebar pick ${props.active === l ? 'on' : ''}`}
            key={l}
            data-testid={`lane-bar-${l}`}
            data-lane={l}
            aria-pressed={props.active === l}
            aria-label={`${laneName(l)} lane: ${words(props.lanes[l])}. Tap to ${props.active === l ? 'sit back' : 'lean in'}.`}
            onClick={() => pick(l)}
          >
            {inner}
          </button>
        ) : (
          <div class="lanebar" key={l} data-testid={`lane-bar-${l}`} data-lane={l}>
            {inner}
          </div>
        );
      })}
    </div>
  );
}
