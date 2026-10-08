import { useState } from 'preact/hooks';
import type { Snapshot, SnapFork } from '../../sim';
import { useLayout } from '../layout';
import { PieceGlyph, pieceLabel } from '../pieces';
import { useSession } from '../session';

const key = (f: SnapFork): string => `${f.heroId}:${f.rank}`;

/**
 * Non-blocking fork cards: pick one of two options before the ring runs out. The first card is
 * open; queued ones are slim strips (tap to open). Desktop keeps two open.
 */
export function Forks(props: { snap: Snapshot }) {
  const s = useSession();
  const layout = useLayout();
  const [pinned, setPinned] = useState<string | null>(null);
  const forks = props.snap.forks;
  if (forks.length === 0) return null;
  const total = s.content.tuning.ranks.forkSec * 20;
  const order = [...forks].sort((a, b) => Number(key(b) === pinned) - Number(key(a) === pinned));
  const openCount = layout === 'desktop' ? 2 : 1;
  const ring = (f: SnapFork) => (
    <span
      class="ring"
      data-testid={`fork-ring-${f.heroId}`}
      style={{ '--f': `${Math.round((f.ticksLeft / total) * 360)}deg` }}
      role="timer"
      aria-label={`${Math.ceil(f.ticksLeft / 20)} seconds left`}
    >
      <b>{Math.ceil(f.ticksLeft / 20)}</b>
    </span>
  );
  return (
    <div class="forks" data-testid="forks" role="group" aria-label="Fork choices">
      {order.map((f, i) =>
        i < openCount ? (
          <section class="fork" key={key(f)} data-testid={`fork-${f.heroId}`}>
            <header class="fork-head">
              <PieceGlyph piece={f.piece} team="A" size={22} />
              <b>
                {pieceLabel(s.content, f.piece)} · Rank {f.rank}
              </b>
              <span class="dim tiny grow">Choose a path</span>
              {ring(f)}
            </header>
            <div class="fork-opts">
              {f.options.map((o) => (
                <button
                  key={o.id}
                  class="fork-opt"
                  data-testid={`fork-opt-${f.heroId}-${o.id}`}
                  title={`${o.name}: ${o.desc}`}
                  onClick={() => s.chooseFork(f.heroId, o.id)}
                >
                  <b>{o.name}</b>
                  <span>{o.desc}</span>
                </button>
              ))}
            </div>
          </section>
        ) : (
          <button
            class="fork strip"
            key={key(f)}
            data-testid={`fork-strip-${f.heroId}`}
            onClick={() => setPinned(key(f))}
            title="Open this choice"
          >
            <PieceGlyph piece={f.piece} team="A" size={20} />
            <b>
              {pieceLabel(s.content, f.piece)} · Rank {f.rank}
            </b>
            <span class="dim tiny grow">Tap to choose</span>
            {ring(f)}
          </button>
        ),
      )}
    </div>
  );
}
