import type { Snapshot } from '../sim';
import type { CamMode } from '../render/broadcast/types';
import { Aim } from './hud/Aim';
import { Command } from './hud/Command';
import { ForkSheet } from './hud/ForkSheet';
import { GambitSheet, Hand } from './hud/Hand';
import { PieceCard } from './hud/PieceCard';
import { Roster } from './hud/Roster';
import { courtName } from '../analysis/text';
import { mmss } from './format';
import { useSession } from './session';

/** One chip for the run speed: 1x, 2x, 4x, 8x, then paused; tap to step to the next. */
function SpeedChip(props: { held: boolean }) {
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

const CAM_LABEL: Record<CamMode, string> = { auto: 'Auto', follow: 'Follow', free: 'Free' };
const CAM_TIP: Record<CamMode, string> = {
  auto: 'The camera follows the big plays',
  follow: 'Tracking one piece (tap a portrait to switch)',
  free: 'Drag to pan, scroll or pinch to zoom, right-drag to turn',
};

/** One button for the camera: Auto, Follow, Free; tap to step to the next. */
function CamButton() {
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

function Side(props: { team: 'A' | 'B'; snap: Snapshot }) {
  const { team, snap } = props;
  const state = snap.check[team] ? 'check' : snap.throneDown[team] ? 'throne' : '';
  const label = state === 'check' ? 'Check' : state === 'throne' ? 'No Throne' : courtName(team);
  return (
    <div
      class={`side ${team === 'A' ? 'a' : 'b'}`}
      data-testid={`status-${team}`}
      data-state={state}
      title={`${courtName(team)}: ${snap.points[team]} points`}
    >
      <b class={`pts ${team === 'A' ? 'a' : 'b'} ${state}`} data-testid={`points-${team}`}>
        {snap.points[team]}
      </b>
      <span class={`pts-label ${state}`}>{label}</span>
    </div>
  );
}

function TopBar(props: { snap: Snapshot; held: boolean }) {
  const s = useSession();
  const { snap } = props;
  return (
    <div class="topbar">
      <div class="clock" data-testid="score">
        <Side team="A" snap={snap} />
        <div class="clockface" data-held={props.held}>
          <b data-testid="phase">Act {snap.act}</b>
          <span data-testid="clock">{mmss(snap.phaseTicksLeft)}</span>
        </div>
        <Side team="B" snap={snap} />
      </div>
      <div class="top-ctl">
        <SpeedChip held={props.held} />
        <CamButton />
        <button class="btn adjourn" data-testid="adjourn" onClick={() => s.adjourn()}>
          Adjourn
        </button>
      </div>
    </div>
  );
}

function Notices() {
  const s = useSession();
  const text = s.ui.caption;
  const banners = s.ui.chips.filter((c) => c.kind !== 'rank');
  const ranks = s.ui.chips.filter((c) => c.kind === 'rank');
  return (
    <div class="notices" aria-live="polite">
      {banners.map((c) => (
        <div
          class={`banner ${c.kind}`}
          key={c.id}
          data-testid={`banner-${c.kind}`}
          style={{ '--ms': `${c.ms}ms` }}
        >
          <b>{c.title}</b>
          {c.detail && <span>{c.detail}</span>}
        </div>
      ))}
      {ranks.map((c) => (
        <div class="rankchip" key={c.id} data-testid="rank-chip" style={{ '--ms': `${c.ms}ms` }}>
          <b>{c.title}</b>
          {c.detail && <span>{c.detail}</span>}
        </div>
      ))}
      {text && (
        <div class="caption" data-testid="caption" key={text}>
          <span class="caption-bar" />
          <span class="caption-text">{text}</span>
        </div>
      )}
    </div>
  );
}

/** The live HUD: corners and the bottom dock; nothing sits over the middle of the 3D view. */
export function Hud() {
  const s = useSession();
  const m = s.match!;
  const snap = m.snapshot();
  const aim = s.ui.aim;
  const aimCard = aim?.kind === 'gambit' ? snap.hand[aim.slot] : undefined;
  const tapMap = !!aimCard && (aimCard.target === 'point' || aimCard.target === 'enemy');
  const forkIds = snap.forks.map((f) => f.heroId);
  const held = snap.forks.length > 0;
  return (
    <div class={`hud ${held ? 'held' : ''}`} data-testid="hud" data-held={held}>
      {tapMap && (
        <div
          class="aim-layer"
          data-testid="aim-layer"
          onClick={(e) => s.aimTap(e.clientX, e.clientY)}
        />
      )}
      <TopBar snap={snap} held={held} />
      <Roster team="A" forks={forkIds} snap={snap} />
      <Roster team="B" forks={[]} snap={snap} />
      <Notices />
      <PieceCard />
      <div class="dock">
        <div class="dock-main">
          {s.ui.toast && (
            <div class="toast" role="alert" data-testid="toast">
              {s.ui.toast}
            </div>
          )}
          <Aim snap={snap} />
          <Hand snap={snap} />
        </div>
        <div class="dock-side">
          <Command snap={snap} />
        </div>
      </div>
      {held && !s.ui.adjourned && <ForkSheet forks={snap.forks} />}
      {!held && !s.ui.adjourned && <GambitSheet snap={snap} />}
    </div>
  );
}
