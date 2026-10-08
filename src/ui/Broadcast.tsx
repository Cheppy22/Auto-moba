import { useEffect, useRef, useState } from 'preact/hooks';
import type { GameEvent, Match } from '../sim';
import { useSession } from './session';

/** The camera follows White's King until a portrait is tapped. */
function kingId(m: Match): number | null {
  const ids = m.state.teams.A.heroIds;
  return ids.find((id) => m.unitById(id)?.hero?.defId === 'king') ?? ids[0] ?? null;
}

/** While the Adjourn panel covers the game, the 3D view only needs an occasional refresh. */
const IDLE_FRAME_MS = 1000;

/** The game view: a three.js scene. Picking calls are handed to the session for gambit aiming. */
export function Broadcast() {
  const s = useSession();
  const ref = useRef<HTMLCanvasElement>(null);
  const [failed, setFailed] = useState<'webgl' | 'error' | null>(null);
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
          view = new BroadcastView(canvas, s.content);
        } catch (err) {
          const noGl = err instanceof Error && err.message === 'WebGL is not available';
          if (!noGl) console.error('The 3D view failed to start', err);
          setFailed(noGl ? 'webgl' : 'error');
          return;
        }
        s.view = view;
        canvas.dataset.ready = 'true';
        const director = new Director(s.content);
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
          if ((!live || s.ui.adjourned) && now - last < IDLE_FRAME_MS) return;
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
          const shot = director.update(snap, fresh);
          view.draw(snap, fresh, {
            alpha,
            shot,
            mode: s.ui.cam,
            followId: s.ui.follow ?? kingId(m),
            dtMs: Math.min(100, now - last),
          });
          last = now;
          const caption = s.ui.cam === 'auto' && live ? shot.caption : null;
          if (caption !== s.ui.caption) s.setUi({ caption });
        });
        dispose = () => {
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
  }, [s]);
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
