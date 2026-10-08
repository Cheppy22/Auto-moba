import type { Snapshot } from '../sim';
import type { CamMode } from '../render/broadcast/types';
import { Aim } from './hud/Aim';
import { Command } from './hud/Command';
import { Forks } from './hud/Forks';
import { Hand } from './hud/Hand';
import { Roster } from './hud/Roster';
import { courtName } from '../analysis/text';
import { mmss } from './format';
import { useSession, type Speed } from './session';

function SpeedControls() {
  const s = useSession();
  return (
    <div class="seg speed-seg glass" role="group" aria-label="Speed">
      {([0, 1, 2, 4, 8] as Speed[]).map((v) => (
        <button
          key={v}
          class={`btn small ${s.ui.speed === v ? 'on' : ''}`}
          data-testid={`speed-${v}`}
          aria-label={v === 0 ? 'Pause' : `${v} times speed`}
          aria-pressed={s.ui.speed === v}
          title={v === 0 ? 'Pause' : `${v}x speed`}
          onClick={() => s.setUi({ speed: v })}
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
      ))}
    </div>
  );
}

const CAMS: { id: CamMode; label: string; tip: string }[] = [
  { id: 'auto', label: 'Auto', tip: 'The camera follows the big plays' },
  { id: 'follow', label: 'Follow', tip: 'Track one piece (tap a portrait to switch)' },
  { id: 'free', label: 'Free', tip: 'Drag to pan, scroll or pinch to zoom, right-drag to turn' },
];

function CamControls() {
  const s = useSession();
  return (
    <div class="seg cam-seg glass" role="group" aria-label="Camera">
      {CAMS.map((c) => (
        <button
          key={c.id}
          class={`btn small ${s.ui.cam === c.id ? 'on' : ''}`}
          data-testid={`cam-${c.id}`}
          aria-pressed={s.ui.cam === c.id}
          title={c.tip}
          onClick={() => s.setUi({ cam: c.id, follow: c.id === 'follow' ? s.ui.follow : null })}
        >
          {c.label}
        </button>
      ))}
    </div>
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

function TopBar(props: { snap: Snapshot }) {
  const s = useSession();
  const { snap } = props;
  return (
    <div class="topbar">
      <div class="top-main">
        <div class="clock" data-testid="score">
          <Side team="A" snap={snap} />
          <div class="ofuda">
            <b data-testid="phase">Act {snap.act}</b>
            <span data-testid="clock">{mmss(snap.phaseTicksLeft)}</span>
          </div>
          <Side team="B" snap={snap} />
        </div>
        <button class="btn adjourn" data-testid="adjourn" onClick={() => s.adjourn()}>
          Adjourn
        </button>
      </div>
      <div class="top-ctl">
        <SpeedControls />
        <CamControls />
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
        <div class={`banner ${c.kind}`} key={c.id} data-testid={`banner-${c.kind}`}>
          <b>{c.title}</b>
          {c.detail && <span>{c.detail}</span>}
        </div>
      ))}
      {ranks.map((c) => (
        <div class="rankchip" key={c.id} data-testid="rank-chip">
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
  return (
    <div class="hud" data-testid="hud">
      {tapMap && (
        <div
          class="aim-layer"
          data-testid="aim-layer"
          onClick={(e) => s.aimTap(e.clientX, e.clientY)}
        />
      )}
      <TopBar snap={snap} />
      <Roster team="A" forks={forkIds} />
      <Roster team="B" forks={[]} />
      <Notices />
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
          <Forks snap={snap} />
          <Command snap={snap} />
        </div>
      </div>
    </div>
  );
}
