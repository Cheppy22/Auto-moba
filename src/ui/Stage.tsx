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
