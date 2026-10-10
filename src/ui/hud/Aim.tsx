import type { Snapshot } from '../../sim';
import { LANES, LANE_LABEL } from '../pieces';
import { useEscape, useSession } from '../session';

/** What the next tap does: three lane buttons, or a hint to tap the 3D view. */
export function Aim(props: { snap: Snapshot }) {
  const s = useSession();
  const aim = s.ui.aim;
  useEscape(!!aim, () => s.cancelAim());
  if (!aim) return null;
  let title = 'Field a Pawn';
  let desc = 'It spawns at your base and marches the lane you pick.';
  let kind: 'lane' | 'point' | 'enemy' | 'ally' = 'lane';
  if (aim.kind === 'gambit') {
    const c = props.snap.hand[aim.slot];
    if (!c || c.cardId !== aim.cardId) return null;
    title = c.name;
    desc = c.desc;
    kind = c.target === 'none' ? 'lane' : c.target;
  }
  const hint =
    kind === 'point'
      ? 'Tap the board to choose a spot'
      : kind === 'ally'
        ? 'Tap one of your pieces'
        : kind === 'enemy'
          ? aim.kind === 'gambit' && aim.cardId === 'siege'
            ? 'Tap a Black Bastion or the Black Throne'
            : 'Tap a Black piece'
          : 'Choose a lane';
  return (
    <div class={`aim glass ${kind}`} data-testid="aim" role="group" aria-label={`Aim ${title}`}>
      <div class="aim-head">
        <b class="aim-title">{title}</b>
        <span class="aim-hint" data-testid="aim-hint">
          {hint}
        </span>
        <button class="chip cancel" data-testid="aim-cancel" onClick={() => s.cancelAim()}>
          Cancel
        </button>
      </div>
      <p class="aim-desc dim tiny">{desc}</p>
      {kind === 'lane' && (
        <div class="aim-lanes">
          {LANES.map((lane) => (
            <button
              key={lane}
              class="btn aim-lane"
              data-testid={`aim-${lane}`}
              onClick={() => s.aimLane(lane)}
            >
              {LANE_LABEL[lane]}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
