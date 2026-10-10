import type { Snapshot } from '../sim';
import type { CamMode } from '../render/broadcast/types';
import { Aim } from './hud/Aim';
import { Command } from './hud/Command';
import { ForkSheet } from './hud/ForkSheet';
import { GambitSheet, Hand } from './hud/Hand';
import { PieceCard } from './hud/PieceCard';
import { Roster } from './hud/Roster';
import { courtName } from '../analysis/text';
import { BreakSheet } from './hud/BreakSheet';
import { LaneBars } from './hud/LaneBars';
import { FightTags, NoteLane } from './hud/Notes';
import { clockSec } from './format';
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

const FLASH_MS = 900;

/** How the clock digits move: an alert flash, a growing pulse in the last seconds, or a toll. */
function clockFx(
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

function TopBar(props: { snap: Snapshot; held: boolean }) {
  const s = useSession();
  const { snap } = props;
  const fx = clockFx(s, snap.act);
  return (
    <div class="topbar">
      <div class="clock" data-testid="score">
        <Side team="A" snap={snap} />
        <div class="clockface" data-held={props.held} data-bell={snap.act.bell} data-fx={fx.fx}>
          <b data-testid="phase">Act {snap.act.n}</b>
          <span key={fx.key} data-testid="clock" data-fx={fx.fx} style={{ '--k': fx.k }}>
            {clockSec(snap.act.remainingSec)}
          </span>
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

function Notices(props: { act: Snapshot['act'] }) {
  const s = useSession();
  const text = s.ui.caption;
  const banners = s.ui.chips.filter((c) => c.kind !== 'rank');
  const bell = props.act;
  const ranks = s.ui.chips.filter((c) => c.kind === 'rank');
  return (
    <div class="notices" aria-live="polite">
      {bell.bell !== 'none' && bell.bell !== 'break' && (
        <div class="bell-line" data-testid="bell-line" data-stage={bell.bell}>
          {bell.bell === 'pending'
            ? 'Bell pending — waiting for the board to calm'
            : bell.bell === 'tolling'
              ? `The bell tolls — ${bell.toll} of ${s.content.tuning.bell.tolls}`
              : 'The bell has rung — stopping play'}
        </div>
      )}
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
  const stopped = snap.act.bell === 'break' && !held;
  return (
    <div
      class={`hud ${held ? 'held' : ''}`}
      data-testid="hud"
      data-held={held}
      data-bell={snap.act.bell}
    >
      {snap.act.bell === 'tolling' && (
        <div
          class="toll-ring"
          key={snap.act.toll}
          data-testid="toll-ring"
          style={{ '--k': (snap.act.toll ?? 1) / s.content.tuning.bell.tolls }}
        />
      )}
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
      {!stopped && (
        <div class="lane-strip">
          <LaneBars lanes={snap.momentum} />
        </div>
      )}
      <Notices act={snap.act} />
      <FightTags notes={s.ui.notes} />
      <PieceCard />
      <div class="dock">
        <div class="dock-main">
          {s.ui.toast && (
            <div class="toast" role="alert" data-testid="toast">
              {s.ui.toast}
            </div>
          )}
          <NoteLane notes={s.ui.notes} />
          <Aim snap={snap} />
          <Hand snap={snap} />
        </div>
        <div class="dock-side">
          <Command snap={snap} />
        </div>
      </div>
      {held && !s.ui.adjourned && <ForkSheet forks={snap.forks} />}
      {stopped && !s.ui.adjourned && <BreakSheet snap={snap} />}
      {!held && !stopped && !s.ui.adjourned && <GambitSheet snap={snap} />}
    </div>
  );
}
