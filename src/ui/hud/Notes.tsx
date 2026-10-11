import { useEffect, useRef } from 'preact/hooks';
import { useSession, type Note } from '../session';

/** Keeps the tag on the screen, clear of the top bar, the rosters and the hand. */
const MARGIN = { x: 62, top: 96, bottom: 190 };
const LIFT = 36;

/**
 * Fight verdicts, pinned to the fight's place in the 3D view. A tag is a small pill that fades
 * after a few seconds; its position follows the camera every frame without re-rendering.
 */
export function FightTags(props: { notes: Note[]; margin?: typeof MARGIN }) {
  const s = useSession();
  const root = useRef<HTMLDivElement>(null);
  const tags = props.notes.filter((n) => n.kind === 'fight' && n.at);
  const live = useRef(tags);
  live.current = tags;
  const edge = useRef(props.margin ?? MARGIN);
  edge.current = props.margin ?? MARGIN;
  useEffect(
    () =>
      s.onFrame(() => {
        const box = root.current;
        const view = s.view;
        if (!box || !view) return;
        const w = box.clientWidth;
        const h = box.clientHeight;
        for (const el of Array.from(box.children) as HTMLElement[]) {
          const n = live.current.find((t) => String(t.id) === el.dataset.id);
          if (!n?.at) continue;
          const p = view.project(n.at.x, n.at.y, LIFT);
          const width = (el.firstElementChild as HTMLElement | null)?.offsetWidth ?? 0;
          const edges = edge.current;
          const x = Math.min(w - edges.x - width / 2, Math.max(edges.x + width / 2, p.x));
          const y = Math.min(h - edges.bottom, Math.max(edges.top, p.y));
          el.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`;
        }
      }),
    [s],
  );
  return (
    <div class="fight-tags" ref={root} aria-live="polite">
      {tags.map((n) => (
        <div class="fight-pin" key={n.id} data-id={n.id}>
          <div
            class={`fight-tag ${n.tone}`}
            data-testid="fight-tag"
            data-tone={n.tone}
            style={{ '--ms': `${n.ms}ms` }}
          >
            {n.text}
          </div>
        </div>
      ))}
    </div>
  );
}

/** Why a piece fell and what a gambit did, one quiet line each, above the hand. */
export function NoteLane(props: { notes: Note[] }) {
  const lines = props.notes.filter((n) => n.kind !== 'fight');
  if (lines.length === 0) return null;
  return (
    <div class="notelane" aria-live="polite">
      {lines.map((n) => (
        <div
          class={`noteline ${n.kind}`}
          key={n.id}
          data-testid={`note-${n.kind}`}
          style={{ '--ms': `${n.ms}ms` }}
        >
          {n.text}
        </div>
      ))}
    </div>
  );
}
