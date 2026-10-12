import { useEffect, useRef, useState } from 'preact/hooks';
import type { GameEvent, Match } from '../sim';
import { laneNear } from '../analysis/feedback';
import { useSession } from './session';

/** The point halfway along a lane's centre line (where the board camera leans in). */
function laneMid(poly: readonly (readonly number[])[]): { x: number; y: number } {
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

/** The camera follows White's King until a portrait is tapped. */
function kingId(m: Match): number | null {
  const ids = m.state.teams.A.heroIds;
  return ids.find((id) => m.unitById(id)?.hero?.defId === 'king') ?? ids[0] ?? null;
}

/** While the Adjourn panel covers the game, the 3D view only needs an occasional refresh. */
const IDLE_FRAME_MS = 1000;
/** How far (CSS pixels) a pointer may travel and still count as a tap on the board. */
const TAP_PX = 8;
/** How far (map units) a tap may be from a lane's centre line and still pick that lane. */
const LANE_TAP = 260;

/** The game view: a three.js scene. Picking calls are handed to the session for gambit aiming. */
export function Broadcast() {
  const s = useSession();
  const ref = useRef<HTMLCanvasElement>(null);
  const [failed, setFailed] = useState<'webgl' | 'error' | null>(null);
  // the board the view draws: the match's map (the view is rebuilt if a match on another map starts)
  const board = s.board;
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    let dead = false;
    let off = (): void => {};
    let dispose = (): void => {};
    import('../render/broadcast')
      .then(({ BroadcastView, Director }) => {
        if (dead) return;
        let view: InstanceType<typeof BroadcastView>;
        try {
          view = new BroadcastView(canvas, board);
        } catch (err) {
          const noGl = err instanceof Error && err.message === 'WebGL is not available';
          if (!noGl) console.error('The 3D view failed to start', err);
          setFailed(noGl ? 'webgl' : 'error');
          return;
        }
        s.view = view;
        canvas.addEventListener('table-sitback', () => s.zoomLane(null)); // table look: zoomed out of a lane
        canvas.dataset.ready = 'true';
        const director = new Director(board);
        // a tap (not a drag) on a piece opens its card; a tap on empty ground closes the card
        let down: { x: number; y: number; t: number } | null = null;
        const onDown = (e: PointerEvent): void => {
          down = e.isPrimary ? { x: e.clientX, y: e.clientY, t: performance.now() } : null;
        };
        const onUp = (e: PointerEvent): void => {
          const d = down;
          down = null;
          const m = s.match;
          if (!d || !e.isPrimary || !m) return;
          if (
            Math.hypot(e.clientX - d.x, e.clientY - d.y) > TAP_PX ||
            performance.now() - d.t > 450
          )
            return;
          if (s.ui.aim || s.ui.adjourned || m.state.forks.length > 0) return;
          if (m.state.bell.stage === 'break') return;
          const id = view.pickUnit(e.clientX, e.clientY);
          const u = id === null ? undefined : m.unitById(id);
          if (u?.hero) s.openCard(u.id);
          else {
            const covered = s.ui.card !== null || s.ui.info !== null;
            s.closeCard();
            s.closeInfo();
            // the board camera: a tap on a lane leans in on it, a tap off the lanes (or on the same lane) sits back
            if (!covered && s.ui.cam === 'board') {
              const g = view.pickGround(e.clientX, e.clientY);
              s.zoomLane(g ? laneNear(board.map.lanes, g.x, g.y, LANE_TAP) : null);
            }
          }
        };
        canvas.addEventListener('pointerdown', onDown);
        canvas.addEventListener('pointerup', onUp);
        const watch = new ResizeObserver(() => view.resize());
        watch.observe(canvas);
        view.resize();
        let seq = -1;
        let last = performance.now();
        let fresh: GameEvent[] = [];
        off = s.onFrame((alpha) => {
          const m = s.match;
          if (!m || m.state.phase.kind === 'setup') return;
          const live = m.state.phase.kind === 'live';
          const now = performance.now();
          const still = !live || s.ui.adjourned || m.state.bell.stage === 'break';
          if (still && now - last < IDLE_FRAME_MS) return;
          const ev = m.events;
          if (ev.length === 0 || ev[ev.length - 1].seq < seq) {
            seq = -1;
            director.reset();
          }
          let i = ev.length;
          while (i > 0 && ev[i - 1].seq > seq) i--;
          fresh = ev.slice(i);
          if (ev.length) seq = ev[ev.length - 1].seq;
          const snap = m.snapshot();
          const intro = s.ui.intro;
          const shot = director.update(snap, fresh);
          view.draw(snap, fresh, {
            alpha,
            shot,
            // behind the versus card the board sits in its whole-board frame
            mode: intro ? 'board' : s.ui.cam,
            followId: s.ui.follow ?? kingId(m),
            laneFocus:
              s.ui.cam === 'board' && s.ui.zoomLane
                ? laneMid(board.map.lanes[s.ui.zoomLane])
                : null,
            dtMs: Math.min(100, now - last),
            timeScale: s.timeScale,
          });
          last = now;
          const caption = s.ui.cam === 'auto' && live && !intro ? shot.caption : null;
          if (caption !== s.ui.caption) s.setUi({ caption });
        });
        dispose = () => {
          canvas.removeEventListener('pointerdown', onDown);
          canvas.removeEventListener('pointerup', onUp);
          watch.disconnect();
          if (s.view === view) s.view = null;
          delete canvas.dataset.ready;
          view.dispose();
        };
      })
      .catch((err) => {
        console.error('The 3D view failed to load', err);
        if (!dead) setFailed('error');
      });
    return () => {
      dead = true;
      off();
      dispose();
      if (s.ui.caption) s.setUi({ caption: null });
    };
  }, [s, board.map]);
  return (
    <>
      <canvas ref={ref} class="game-canvas" data-testid="stage" hidden={!!failed} />
      {failed && <StageError why={failed} />}
    </>
  );
}

function StageError({ why }: { why: 'webgl' | 'error' }) {
  return (
    <div class="stage-error" role="alert" data-testid="no-webgl">
      <div class="panel col">
        <h2>{why === 'webgl' ? "The 3D view isn't available" : 'The 3D view hit a problem'}</h2>
        <p class="small">
          {why === 'webgl'
            ? "Auto-MOBA draws the match with WebGL, and this browser or device doesn't offer it. Turn on hardware acceleration, try another browser, or open the game on a newer device."
            : 'The picture failed to start. Reloading the page usually fixes it; if it keeps happening, try another browser.'}
        </p>
        <p class="dim tiny">The match itself keeps running; only the picture is missing.</p>
      </div>
    </div>
  );
}
