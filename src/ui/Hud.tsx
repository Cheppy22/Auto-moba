import type { Snapshot } from '../sim';
import { Aim } from './hud/Aim';
import { Command } from './hud/Command';
import { ClockBlock, TopControls } from './hud/Controls';
import { CourtLayout } from './hud/CourtLayout';
import { ForkSheet } from './hud/ForkSheet';
import { GambitSheet, Hand } from './hud/Hand';
import { PieceCard } from './hud/PieceCard';
import { Roster } from './hud/Roster';
import { BreakSheet } from './hud/BreakSheet';
import { LaneBars } from './hud/LaneBars';
import { FightTags, NoteLane } from './hud/Notes';
import { Notices } from './hud/Notices';
import { useHudShape, wantsNewHud } from './hud/hudMode';
import { useEscape, useSession } from './session';

function TopBar(props: { snap: Snapshot; held: boolean }) {
  return (
    <div class="topbar">
      <ClockBlock snap={props.snap} held={props.held} />
      <TopControls held={props.held} />
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
  const zoom = s.ui.cam === 'board' ? s.ui.zoomLane : null;
  useEscape(zoom !== null, () => s.zoomLane(null));
  const v2 = wantsNewHud();
  const shape = useHudShape();
  return (
    <div
      class={`hud ${held ? 'held' : ''} ${v2 ? 'v2' : ''}`}
      data-testid="hud"
      data-hud={v2 ? 'new' : 'old'}
      data-shape={v2 ? shape : undefined}
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
      {v2 ? (
        <CourtLayout
          snap={snap}
          held={held}
          stopped={stopped}
          zoom={zoom}
          forkIds={forkIds}
          shape={shape}
        />
      ) : (
        <>
          <TopBar snap={snap} held={held} />
          <Roster team="A" forks={forkIds} snap={snap} />
          <Roster team="B" forks={[]} snap={snap} />
          {!stopped && (
            <div class="lane-strip">
              <LaneBars lanes={snap.momentum} active={zoom} onPick={(lane) => s.zoomLane(lane)} />
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
        </>
      )}
      {held && !s.ui.adjourned && <ForkSheet forks={snap.forks} />}
      {stopped && !s.ui.adjourned && <BreakSheet snap={snap} />}
      {!held && !stopped && !s.ui.adjourned && <GambitSheet snap={snap} />}
    </div>
  );
}
