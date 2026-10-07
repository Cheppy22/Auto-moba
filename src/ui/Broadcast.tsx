import { useEffect, useRef } from 'preact/hooks';
import type { GameEvent } from '../sim';
import { useSession } from './session';

export function Broadcast() {
  const s = useSession();
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    let dead = false;
    let off = (): void => {};
    let dispose = (): void => {};
    const fallback = (): void => {
      s.setUi({ view: 'map', caption: null });
      s.flash('The broadcast view needs WebGL, which this device does not offer.');
    };
    import('../render/broadcast')
      .then(({ BroadcastView, Director }) => {
        if (dead) return;
        let view: InstanceType<typeof BroadcastView>;
        try {
          view = new BroadcastView(canvas, s.content);
        } catch {
          fallback();
          return;
        }
        const director = new Director(s.content);
        const watch = new ResizeObserver(() => view.resize());
        watch.observe(canvas);
        view.resize();
        let seq = -1;
        let last = performance.now();
        let fresh: GameEvent[] = [];
        off = s.onFrame((alpha) => {
          const m = s.match;
          if (!m || m.state.phase.kind === 'draft') return;
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
          const now = performance.now();
          view.draw(snap, fresh, {
            alpha,
            shot,
            mode: s.ui.cam,
            followId: s.ui.follow ?? snap.playerHeroId,
            dtMs: Math.min(100, now - last),
          });
          last = now;
          const caption = s.ui.cam === 'auto' ? shot.caption : null;
          if (caption !== s.ui.caption) s.setUi({ caption });
        });
        dispose = () => {
          watch.disconnect();
          view.dispose();
        };
      })
      .catch(() => {
        if (!dead) fallback();
      });
    return () => {
      dead = true;
      off();
      dispose();
      if (s.ui.caption) s.setUi({ caption: null });
    };
  }, [s]);
  return <canvas ref={ref} class="broadcast" data-testid="broadcast" />;
}
