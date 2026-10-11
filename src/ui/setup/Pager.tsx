import type { ComponentChildren } from 'preact';
import { useRef } from 'preact/hooks';

interface Drag {
  id: number;
  x: number;
  y: number;
  /** null until the gesture shows its direction; true when it is a horizontal swipe. */
  locked: boolean | null;
  dx: number;
}

/**
 * A row of pages that slides sideways. Touch and pen swipes turn the page (vertical scrolling inside
 * a page still works); anything inside `[data-noswipe]` keeps its own drag. Off-screen pages are
 * hidden from taps, focus and screen readers.
 */
export function Pager(props: {
  page: number;
  onPage: (page: number) => void;
  children: ComponentChildren[];
}) {
  const { page, onPage } = props;
  const count = props.children.length;
  const view = useRef<HTMLDivElement>(null);
  const track = useRef<HTMLDivElement>(null);
  const drag = useRef<Drag | null>(null);

  const finish = (commit: boolean): void => {
    const d = drag.current;
    drag.current = null;
    const el = track.current;
    if (el) {
      el.classList.remove('drag');
      el.style.removeProperty('--drag');
    }
    if (!d || !d.locked || !commit) return;
    const w = view.current?.clientWidth ?? 360;
    if (Math.abs(d.dx) > Math.min(90, w * 0.18))
      onPage(Math.max(0, Math.min(count - 1, page + (d.dx < 0 ? 1 : -1))));
  };

  return (
    <div
      ref={view}
      class="sp-view"
      onPointerDown={(e) => {
        if (e.pointerType === 'mouse' || !e.isPrimary) return;
        if ((e.target as Element).closest('[data-noswipe]')) return;
        drag.current = { id: e.pointerId, x: e.clientX, y: e.clientY, locked: null, dx: 0 };
      }}
      onPointerMove={(e) => {
        const d = drag.current;
        if (!d || e.pointerId !== d.id) return;
        const dx = e.clientX - d.x;
        const dy = e.clientY - d.y;
        if (d.locked === null) {
          if (Math.abs(dx) < 10 && Math.abs(dy) < 10) return;
          d.locked = Math.abs(dx) > Math.abs(dy) * 1.4;
          if (!d.locked) {
            drag.current = null;
            return;
          }
          view.current?.setPointerCapture(e.pointerId);
          track.current?.classList.add('drag');
        }
        // pull harder at the first and last page
        const atEdge = (dx > 0 && page === 0) || (dx < 0 && page === count - 1);
        d.dx = atEdge ? dx * 0.25 : dx;
        track.current?.style.setProperty('--drag', `${d.dx}px`);
      }}
      onPointerUp={(e) => {
        if (drag.current && e.pointerId === drag.current.id) finish(true);
      }}
      onPointerCancel={() => finish(false)}
    >
      <div
        ref={track}
        class="sp-track"
        style={{ transform: `translate3d(calc(var(--drag, 0px) + ${-page * 100}%), 0, 0)` }}
      >
        {props.children.map((child, i) => (
          <div
            key={i}
            class={`sp-pane ${i === page ? 'on' : ''}`}
            aria-hidden={i === page ? undefined : 'true'}
            data-testid={`step-page-${i + 1}`}
          >
            {child}
          </div>
        ))}
      </div>
    </div>
  );
}
