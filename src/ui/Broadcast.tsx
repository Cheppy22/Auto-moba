import { useEffect, useRef, useState } from 'preact/hooks';
import type { GameEvent, Match } from '../sim';
import { laneNear } from '../analysis/feedback';
import { inkStyle, subscribeInkStyle } from './inkStyle';
import { flyToken, type CaptureDetail } from './hud/tokenFlight';
import { mapTheme, subscribeMapTheme } from './mapTheme';
import { useSession } from './session';

/** The point halfway along a lane's centre line (where the lane camera leans in). */
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

/** While the Adjourn panel covers the game, the 3D view only needs an occasional refresh. */
const IDLE_FRAME_MS = 1000;
/** How far (CSS pixels) a pointer may travel and still count as a tap on the board. */
const TAP_PX = 8;
/**
 * How far (map units) a tap may be from a lane's centre line and still pick that lane: the
 * lane's half-width and a little more (the square map's lanes are wider and farther apart).
 */
const laneTap = (m: Match['content']['map']): number => m.walk.lane + 40;

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
          view = new BroadcastView(canvas, board, mapTheme());
        } catch (err) {
          const noGl = err instanceof Error && err.message === 'WebGL is not available';
          if (!noGl) console.error('The 3D view failed to start', err);
          setFailed(noGl ? 'webgl' : 'error');
          return;
        }
        s.view = view;
        // zoomed out of a lane, or a drag (in Auto: any gesture) took the camera: back to free
        const onFree = (): void => s.freeCam();
        const onAngle = (e: Event): void => {
          const turned = !!(e as CustomEvent<{ turned: boolean }>).detail?.turned;
          if (turned !== s.ui.camTurned) s.setUi({ camTurned: turned });
        };
        canvas.addEventListener('table-sitback', onFree);
        canvas.addEventListener('cam-manual', onFree);
        canvas.addEventListener('cam-angle', onAngle);
        // a captured piece knocked flying: its tray item waits, then a token flies into the tray
        const onCapStart = (e: Event): void => {
          const d = (e as CustomEvent<CaptureDetail>).detail;
          if (d) s.captureStart(d.id);
        };
        const onCapLand = (e: Event): void => {
          const d = (e as CustomEvent<CaptureDetail>).detail;
          if (d) flyToken(s, d);
        };
        // the Checkmate beat: the word lands as the King falls; the splash follows the beat's end
        const onMateFall = (): void => s.mateFell();
        const onMateDone = (): void => s.endMateBeat();
        canvas.addEventListener('mate-fall', onMateFall);
        canvas.addEventListener('mate-done', onMateDone);
        canvas.addEventListener('capture-start', onCapStart);
        canvas.addEventListener('capture-land', onCapLand);
        // the board's theme (the Title and Adjourn switch it; the board repaints in place)
        canvas.dataset.theme = mapTheme();
        const offTheme = subscribeMapTheme(() => {
          view.setTheme(mapTheme());
          canvas.dataset.theme = mapTheme();
        });
        // the ink-and-brass post-process (the same switch row; off by default)
        view.setInk(inkStyle());
        canvas.dataset.ink = inkStyle() ? 'on' : 'off';
        const offInk = subscribeInkStyle(() => {
          view.setInk(inkStyle());
          canvas.dataset.ink = inkStyle() ? 'on' : 'off';
        });
        canvas.dataset.ready = 'true';
        const director = new Director(board);
        // a tap (not a drag) on a unit follows it (a piece also opens its card); a tap on a lane
        // leans in on it; a tap on empty ground closes the card and frees the camera
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
            view.gestured ||
            Math.hypot(e.clientX - d.x, e.clientY - d.y) > TAP_PX ||
            performance.now() - d.t > 450
          )
            return;
          if (s.ui.aim || s.ui.adjourned || m.state.forks.length > 0) return;
          if (m.state.bell.stage === 'break') return;
          const id = view.pickUnit(e.clientX, e.clientY);
          const u = id === null ? undefined : m.unitById(id);
          // pieces and pawns (both sides) can be followed; pawnlings, camps and Bastions cannot
          if (u && u.alive && (u.hero || u.pawn)) {
            s.followUnit(u.id);
            if (u.hero) s.openCard(u.id);
            else s.closeCard();
            return;
          }
          s.closeCard();
          s.closeInfo();
          const g = view.pickGround(e.clientX, e.clientY);
          const lane = g ? laneNear(board.map.lanes, g.x, g.y, laneTap(board.map)) : null;
          if (lane) s.zoomLane(lane);
          else s.freeCam();
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
          const ev = m.events;
          // after the match ends the view still draws every frame through the Checkmate beat
          const fresh0 = ev.length > 0 && ev[ev.length - 1].seq > seq;
          const still =
            (!live && !view.cinematic && !fresh0) ||
            s.ui.adjourned ||
            m.state.bell.stage === 'break';
          if (still && now - last < IDLE_FRAME_MS) return;
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
            // behind the versus card the camera holds its default view
            mode: intro ? 'free' : s.ui.cam,
            followId: s.ui.follow,
            laneFocus:
              s.ui.cam === 'lane' && s.ui.zoomLane ? laneMid(board.map.lanes[s.ui.zoomLane]) : null,
            dtMs: Math.min(100, now - last),
            timeScale: s.timeScale,
          });
          last = now;
          const caption = s.ui.cam === 'auto' && live && !intro ? shot.caption : null;
          if (caption !== s.ui.caption) s.setUi({ caption });
          // a followed pawn that fell (or a unit that is gone) leaves the camera free where it is
          if (s.ui.cam === 'follow' && s.ui.follow !== null && m.state.forks.length === 0) {
            const f = m.unitById(s.ui.follow);
            if (!f || (!f.hero && !f.alive)) s.freeCam();
          }
        });
        dispose = () => {
          canvas.removeEventListener('pointerdown', onDown);
          canvas.removeEventListener('pointerup', onUp);
          canvas.removeEventListener('table-sitback', onFree);
          canvas.removeEventListener('cam-manual', onFree);
          canvas.removeEventListener('cam-angle', onAngle);
          canvas.removeEventListener('capture-start', onCapStart);
          canvas.removeEventListener('mate-fall', onMateFall);
          canvas.removeEventListener('mate-done', onMateDone);
          canvas.removeEventListener('capture-land', onCapLand);
          offTheme();
          offInk();
          watch.disconnect();
          if (s.view === view) s.view = null;
          delete canvas.dataset.ready;
          delete canvas.dataset.theme;
          delete canvas.dataset.ink;
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
      if (s.ui.caption || s.ui.camTurned) s.setUi({ caption: null, camTurned: false });
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
