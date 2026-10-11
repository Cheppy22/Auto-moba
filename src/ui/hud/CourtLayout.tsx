import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';
import type { LaneId, Snapshot } from '../../sim';
import { useSession } from '../session';
import { BlackCourt } from './BlackCourt';
import { ClockBlock, TopControls } from './Controls';
import { Drawer } from './Drawer';
import { LaneBars } from './LaneBars';
import { FightTags } from './Notes';
import { NoticeBand } from './Notices';
import { PieceCard } from './PieceCard';
import { RelicRow } from './RelicRow';
import { Roster } from './Roster';
import { CaptureTray } from './Trays';
import type { HudShape } from './hudMode';

/** The room the HUD takes, in CSS px, for the 3D camera (also exposed as `--hud-*`). */
interface Insets {
  top: number;
  bottom: number;
}

const VARS = ['--hud-top', '--hud-bottom', '--hud-left', '--hud-right'] as const;

/**
 * The new HUD ("court bar"): clock, score, capture trays, lane strip and Black's five tokens on
 * top; your five pieces in one row at the bottom with the gambit drawer above them.
 *
 * The space it takes is written to the page root as CSS custom properties, in px:
 * `--hud-top` (the top bars' bottom edge) and `--hud-bottom` (the collapsed bottom stack, which
 * never changes when the drawer opens), plus `--hud-left` and `--hud-right`. In the `side` shape
 * (wide windows) your row runs down the left edge and the drawer sits in the bottom-right corner:
 * `--hud-left` is the width of that column and `--hud-bottom` is the collapsed drawer's footprint
 * (its height plus margin), so the board is framed clear of the drawer.
 */
export function CourtLayout(props: {
  snap: Snapshot;
  held: boolean;
  stopped: boolean;
  zoom: LaneId | null;
  forkIds: number[];
  shape: HudShape;
}) {
  const s = useSession();
  const { snap, held, zoom, forkIds, shape } = props;
  const [open, setOpen] = useState(false);
  const [insets, setInsets] = useState<Insets>({ top: 0, bottom: 0 });
  const top = useRef<HTMLDivElement>(null);
  const bottom = useRef<HTMLDivElement>(null);
  const mine = useRef<HTMLDivElement>(null);
  // aiming a card needs the board, not the hand: the drawer folds away
  const aiming = s.ui.aim !== null;
  useEffect(() => {
    if (aiming) setOpen(false);
  }, [aiming]);
  // the piece card and the hand share the middle of the screen: opening one closes the other
  const cardOpen = s.ui.card !== null;
  useEffect(() => {
    if (cardOpen) setOpen(false);
  }, [cardOpen]);
  const openDrawer = (v: boolean): void => {
    setOpen(v);
    if (v) s.closeCard();
  };
  useLayoutEffect(() => {
    const root = document.documentElement.style;
    const side = shape === 'side';
    const measure = (): void => {
      const t = top.current?.getBoundingClientRect();
      const b = bottom.current?.getBoundingClientRect();
      const d = bottom.current?.querySelector('.v2-drawer')?.getBoundingClientRect();
      const m = mine.current?.getBoundingClientRect();
      const px = (v: number): string => `${Math.max(0, Math.round(v))}px`;
      const topPx = t ? t.bottom : 0;
      // stack: the bottom stack; side: only the drawer's bar in the bottom-right corner (the
      // pieces run down the left edge), so the board frames clear of it
      const bottomPx = side
        ? d
          ? window.innerHeight - d.top
          : 0
        : b
          ? window.innerHeight - b.top
          : 0;
      root.setProperty('--hud-top', px(topPx));
      root.setProperty('--hud-bottom', px(bottomPx));
      root.setProperty('--hud-left', px(side && m ? m.right : 0));
      root.setProperty('--hud-right', px(0));
      setInsets((old) =>
        old.top === Math.round(topPx) && old.bottom === Math.round(bottomPx)
          ? old
          : { top: Math.round(topPx), bottom: Math.round(bottomPx) },
      );
    };
    measure();
    const ro = new ResizeObserver(measure);
    const drawer = bottom.current?.querySelector('.v2-drawer');
    for (const el of [top.current, bottom.current, mine.current, drawer]) if (el) ro.observe(el);
    window.addEventListener('resize', measure);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', measure);
      for (const v of VARS) root.removeProperty(v);
    };
  }, [shape]);
  return (
    <>
      <div class="v2-top" ref={top} data-testid="court-bar">
        <div class="v2-time">
          <ClockBlock snap={snap} held={held} counts />
        </div>
        <TopControls held={held} />
        <div class="v2-board">
          <CaptureTray fallen="B" />
          <div class="v2-lanes">
            <LaneBars lanes={snap.momentum} active={zoom} onPick={(lane) => s.zoomLane(lane)} />
          </div>
          <CaptureTray fallen="A" />
        </div>
        <div class="v2-black">
          <span class="v2-label">Black</span>
          <BlackCourt snap={snap} />
          <RelicRow team="B" snap={snap} />
        </div>
      </div>
      <NoticeBand act={snap.act} />
      <FightTags
        notes={s.ui.notes}
        margin={{ x: 24, top: insets.top + 14, bottom: insets.bottom + 14 }}
      />
      <PieceCard />
      <div class="v2-bottom" ref={bottom}>
        <Drawer snap={snap} open={open} onOpen={openDrawer} />
        <div class="v2-mine" ref={mine}>
          <Roster team="A" forks={forkIds} snap={snap} row />
        </div>
      </div>
    </>
  );
}
