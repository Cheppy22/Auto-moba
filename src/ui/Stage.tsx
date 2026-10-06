import { useEffect, useRef } from 'preact/hooks';
import { Renderer } from '../render';
import { useSession } from './session';

export function Stage() {
  const s = useSession();
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const r = new Renderer(canvas, s.content);
    const draw = (alpha: number): void => {
      const layout = document.documentElement.dataset.layout ?? 'desktop';
      const zone = document.querySelector('.map-zone');
      const pad = layout === 'desktop' ? 8 : 4;
      const insets = { top: pad, right: pad, bottom: pad, left: pad };
      if (zone) {
        const c = canvas.getBoundingClientRect();
        const z = zone.getBoundingClientRect();
        insets.top += Math.max(0, z.top - c.top);
        insets.left += Math.max(0, z.left - c.left);
        insets.right += Math.max(0, c.right - z.right);
        insets.bottom += Math.max(0, c.bottom - z.bottom);
      }
      r.setFrame(insets, layout === 'portrait' ? 1.6 : layout === 'landscape' ? 1.0 : 1.3);
      const m = s.match;
      if (!m || m.state.phase.kind === 'draft') {
        r.drawEmpty();
        return;
      }
      r.draw(m.snapshot(), { alpha, highlightId: s.ui.reportHero });
    };
    const off = s.onFrame(draw);
    return off;
  }, [s]);
  return (
    <div class="stage">
      <canvas ref={ref} data-testid="stage" />
    </div>
  );
}
