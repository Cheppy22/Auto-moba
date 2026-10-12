import { useEffect, useRef, useState } from 'preact/hooks';
import type { Snapshot } from '../../sim';
import { courtName } from '../../analysis/text';
import { clockSec } from '../format';
import { useSession } from '../session';

/** How long the Act clock is held (ms) to toggle pause; the ring fills over this time. */
const CLOCK_HOLD_MS = 450;

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

/**
 * The Auto switch: on, the director camera follows the big plays; off (the default) the camera is
 * the player's own. Any drag, pinch or twist on the board turns it off.
 */
export function AutoToggle() {
  const s = useSession();
  const on = s.ui.cam === 'auto';
  return (
    <button
      class={`btn small chip-ctl auto-btn glass ${on ? 'on' : ''}`}
      data-testid="auto-btn"
      aria-pressed={on}
      aria-label={
        on ? 'Auto camera is on. Tap to turn it off.' : 'Auto camera is off. Tap to turn it on.'
      }
      title={
        on
          ? 'Auto camera: following the big plays (tap to stop)'
          : 'Auto camera: follow the big plays'
      }
      onClick={() => s.setAuto(!on)}
    >
      <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
        <rect
          x="1.5"
          y="4"
          width="9"
          height="8"
          rx="1.5"
          stroke="currentColor"
          stroke-width="1.4"
        />
        <path d="M10.5 7.2 14.5 5v6l-4-2.2z" fill="currentColor" />
      </svg>
      <span>Auto</span>
    </button>
  );
}

/**
 * The compass: shows while the camera is turned or tilted away from its default angle; its needle
 * points to White's end of the board. Tap to ease back to the default angle.
 */
export function Compass() {
  const s = useSession();
  if (!s.ui.camTurned || s.ui.cam === 'lane') return null;
  return (
    <button
      class="compass glass"
      data-testid="compass"
      aria-label="Camera turned. Tap to face the board again."
      title="Face the board again"
      onClick={() => s.resetAngle()}
    >
      <svg viewBox="0 0 40 40" width="40" height="40" aria-hidden="true">
        <circle cx="20" cy="20" r="17" class="compass-ring" />
        <g class="compass-needle">
          <path d="M20 5 24.5 20h-9z" class="needle-home" />
          <path d="M20 35 15.5 20h9z" class="needle-far" />
          <circle cx="20" cy="20" r="2.2" class="needle-pin" />
        </g>
      </svg>
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
  // a long press on the clock toggles pause like the Pause button; a ring fills while it is held
  const [holding, setHolding] = useState(false);
  const timer = useRef(0);
  const stop = (): void => {
    window.clearTimeout(timer.current);
    setHolding(false);
  };
  const start = (): void => {
    window.clearTimeout(timer.current);
    setHolding(true);
    timer.current = window.setTimeout(() => {
      setHolding(false);
      s.togglePause();
    }, CLOCK_HOLD_MS);
  };
  useEffect(() => () => window.clearTimeout(timer.current), []);
  return (
    <div class="clock" data-testid="score">
      <Side team="A" snap={snap} counts={counts} />
      <div
        class="clockface"
        data-held={props.held}
        data-bell={snap.act.bell}
        data-fx={fx.fx}
        data-holding={holding}
        title="Hold to pause or resume"
        onPointerDown={start}
        onPointerUp={stop}
        onPointerLeave={stop}
        onPointerCancel={stop}
        onContextMenu={(e) => e.preventDefault()}
      >
        <svg class="hold-ring" aria-hidden="true">
          <rect x="1" y="1" rx="7" ry="7" pathLength="1" />
        </svg>
        <b data-testid="phase">Act {snap.act.n}</b>
        <span key={fx.key} data-testid="clock" data-fx={fx.fx} style={{ '--k': fx.k }}>
          {clockSec(snap.act.remainingSec)}
        </span>
      </div>
      <Side team="B" snap={snap} counts={counts} />
    </div>
  );
}

/** Speed (and pause), the Auto camera switch and Adjourn. */
export function TopControls(props: { held: boolean }) {
  const s = useSession();
  return (
    <div class="top-ctl v2-ctl">
      <SpeedChip held={props.held} />
      <AutoToggle />
      <button class="btn adjourn" data-testid="adjourn" onClick={() => s.adjourn()}>
        Adjourn
      </button>
    </div>
  );
}
