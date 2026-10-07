import { useEffect, useRef } from 'preact/hooks';
import { Renderer } from '../render';
import { roleLabel } from './format';
import { NOTICE_TICKS, useSession } from './session';

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
      const pts = JSON.stringify(r.shopPoints());
      if (canvas.dataset.shops !== pts) canvas.dataset.shops = pts;
      r.draw(m.snapshot(), {
        alpha,
        highlightId: s.ui.reportHero,
        curses: s.ui.notices.map((n) => ({
          heroId: n.heroId,
          startTick: n.startTick,
          life: NOTICE_TICKS,
          title: n.title,
          own: n.own,
        })),
      });
    };
    s.flashHalo = () => r.flashHalo();
    const off = s.onFrame(draw);
    const toCanvas = (e: MouseEvent): { x: number; y: number } => {
      const rect = canvas.getBoundingClientRect();
      const k = canvas.width / Math.max(1, rect.width);
      return { x: (e.clientX - rect.left) * k, y: (e.clientY - rect.top) * k };
    };
    const announceTrip = (shopId: string): void => {
      const shop = s.content.map.shops.find((x) => x.id === shopId);
      const m = s.match;
      const hero = m?.state.playerHeroId != null ? m.unitById(m.state.playerHeroId) : undefined;
      if (!shop || !hero) return;
      const secs = Math.round(Math.hypot(shop.x - hero.x, shop.y - hero.y) / hero.stats.moveSpeed);
      const lane = hero.lane ? ` and leaves the ${roleLabel(hero.lane)}` : '';
      s.flash(`${shop.name}: ~${secs}s away${lane}`);
    };
    const onClick = (e: MouseEvent): void => {
      const m = s.match;
      if (!m || m.state.phase.kind !== 'live') return;
      const p = toCanvas(e);
      const id = r.pickShop(p.x, p.y, 80);
      if (id && s.issue({ type: 'suggestShop', shopId: id }).ok) announceTrip(id);
    };
    const onMove = (e: MouseEvent): void => {
      const m = s.match;
      const p = toCanvas(e);
      const hit = !!m && m.state.phase.kind === 'live' && !!r.pickShop(p.x, p.y);
      canvas.style.cursor = hit ? 'pointer' : '';
    };
    canvas.addEventListener('click', onClick);
    canvas.addEventListener('mousemove', onMove);
    return () => {
      off();
      s.flashHalo = () => {};
      canvas.removeEventListener('click', onClick);
      canvas.removeEventListener('mousemove', onMove);
    };
  }, [s]);
  return (
    <div class="stage">
      <canvas ref={ref} data-testid="stage" />
    </div>
  );
}
