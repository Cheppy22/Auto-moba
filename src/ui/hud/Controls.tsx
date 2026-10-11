import type { CamMode } from '../../render/broadcast/types';
import type { Snapshot } from '../../sim';
import { courtName } from '../../analysis/text';
import { clockSec } from '../format';
import { useSession } from '../session';

/** One chip for the run speed: 1x, 2x, 4x, 8x, then paused; tap to step to the next. */
export function SpeedChip(props: { held: boolean }) {
  const s = useSession();
  const v = s.ui.speed;
  const label = props.held ? 'Paused for a fork' : v === 0 ? 'Paused' : `${v} times speed`;
  return (
    <button
      class={`btn small chip-ctl speed-chip glass ${v === 0 ? 'paused' : ''}`}
      data-testid="speed-chip"
      data-speed={v}
      aria-label={`${label}. Tap to change speed.`}
      title={`${v === 0 ? 'Paused' : `${v}x speed`} (tap to change)`}
      onClick={() => s.cycleSpeed()}
    >
      {v === 0 ? (
        <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor" aria-hidden="true">
          <rect x="2" y="1" width="3" height="10" rx="0.5" />
          <rect x="7" y="1" width="3" height="10" rx="0.5" />
        </svg>
      ) : (
        `${v}x`
      )}
    </button>
  );
}

const CAM_LABEL: Record<CamMode, string> = {
  board: 'Board',
  auto: 'Auto',
  follow: 'Follow',
  free: 'Free',
};
const CAM_TIP: Record<CamMode, string> = {
  board: 'The whole board, fixed (tap a lane to lean in)',
  auto: 'The camera follows the big plays',
  follow: 'Tracking one piece (tap a portrait to switch)',
  free: 'Drag to pan, scroll or pinch to zoom, right-drag to turn',
};

/** One button for the camera: Board, Auto, Follow, Free; tap to step to the next. */
export function CamButton() {
  const s = useSession();
  const mode = s.ui.cam;
  return (
    <button
      class="btn small chip-ctl cam-btn glass"
      data-testid="cam-btn"
      data-mode={mode}
      aria-label={`Camera: ${CAM_LABEL[mode]}. Tap to change.`}
      title={`${CAM_TIP[mode]} (tap to change)`}
      onClick={() => s.cycleCam()}
    >
      {CAM_LABEL[mode]}
    </button>
  );
}

/** `counts`: the new HUD names what the numeral counts ("White pts": camp and event points). */
export function Side(props: { team: 'A' | 'B'; snap: Snapshot; counts?: boolean }) {
  const { team, snap, counts } = props;
  const state = snap.check[team] ? 'check' : snap.throneDown[team] ? 'throne' : '';
  const name = counts ? `${courtName(team)} pts` : courtName(team);
  const label = state === 'check' ? 'Check' : state === 'throne' ? 'No Throne' : name;
  return (
    <div
      class={`side ${team === 'A' ? 'a' : 'b'}`}
      data-testid={`status-${team}`}
      data-state={state}
      title={
        counts
          ? `${courtName(team)}: ${snap.points[team]} points, scored from camps and events`
          : `${courtName(team)}: ${snap.points[team]} points`
      }
    >
      <b class={`pts ${team === 'A' ? 'a' : 'b'} ${state}`} data-testid={`points-${team}`}>
        {snap.points[team]}
      </b>
      <span class={`pts-label ${state}`}>{label}</span>
    </div>
  );
}

const FLASH_MS = 900;

/** How the clock digits move: an alert flash, a growing pulse in the last seconds, or a toll. */
export function clockFx(
  s: ReturnType<typeof useSession>,
  act: Snapshot['act'],
): { fx: string; key: string; k: number } {
  const last = s.content.tuning.bell.pulseLastSec;
  const sec = Math.ceil(act.remainingSec - 1e-6);
  if (act.bell === 'tolling' || act.bell === 'halt') {
    const toll = act.toll ?? 1;
    return { fx: 'toll', key: `t${toll}`, k: toll / s.content.tuning.bell.tolls };
  }
  if (act.bell === 'none' && sec >= 1 && sec <= last)
    return { fx: 'pulse', key: `p${sec}`, k: (last + 1 - sec) / last };
  if (s.ui.clockFlash > 0 && performance.now() - s.ui.clockFlash < FLASH_MS)
    return { fx: 'flash', key: `f${s.ui.clockFlash}`, k: 0.5 };
  return { fx: '', key: 'n', k: 0 };
}

/** Act clock between the two scores: White's points, the chess clock face, Black's points. */
export function ClockBlock(props: { snap: Snapshot; held: boolean; counts?: boolean }) {
  const s = useSession();
  const { snap, counts } = props;
  const fx = clockFx(s, snap.act);
  return (
    <div class="clock" data-testid="score">
      <Side team="A" snap={snap} counts={counts} />
      <div class="clockface" data-held={props.held} data-bell={snap.act.bell} data-fx={fx.fx}>
        <b data-testid="phase">Act {snap.act.n}</b>
        <span key={fx.key} data-testid="clock" data-fx={fx.fx} style={{ '--k': fx.k }}>
          {clockSec(snap.act.remainingSec)}
        </span>
      </div>
      <Side team="B" snap={snap} counts={counts} />
    </div>
  );
}

/** Speed (and pause), camera and Adjourn. */
export function TopControls(props: { held: boolean }) {
  const s = useSession();
  return (
    <div class="top-ctl v2-ctl">
      <SpeedChip held={props.held} />
      <CamButton />
      <button class="btn adjourn" data-testid="adjourn" onClick={() => s.adjourn()}>
        Adjourn
      </button>
    </div>
  );
}
