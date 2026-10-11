import { useEffect, useRef, useState } from 'preact/hooks';
import type { Snapshot } from '../../sim';
import type { School } from '../schools';
import { SchoolGlyph } from '../schools';
import { useSession, type Chip } from '../session';
import { BlackPlayBanner } from './BlackPlay';

function BellLine(props: { act: Snapshot['act'] }) {
  const s = useSession();
  const bell = props.act;
  if (bell.bell === 'none' || bell.bell === 'break') return null;
  return (
    <div class="bell-line" data-testid="bell-line" data-stage={bell.bell}>
      {bell.bell === 'pending'
        ? 'Bell pending — waiting for the board to calm'
        : bell.bell === 'tolling'
          ? `The bell tolls — ${bell.toll} of ${s.content.tuning.bell.tolls}`
          : 'The bell has rung — stopping play'}
    </div>
  );
}

/** One notice waiting for, or holding, the band. Copies, so a notice that expires still shows. */
type Item =
  | { key: string; at: number; rank: number; ms: number; black: { school: School; text: string } }
  | {
      key: string;
      at: number;
      rank: number;
      ms: number;
      chip: Pick<Chip, 'kind' | 'title' | 'detail'>;
    };

/** The longest a notice may wait for the band before it is stale. */
const STALE_MS = 9000;
const MAX_WAITING = 4;

/** Most urgent first: Black's play, Check and the like, then the rest, then rank-ups. */
const priority = (kind: Chip['kind'] | 'black'): number =>
  kind === 'black' || kind === 'check' || kind === 'throne' ? 0 : kind === 'rank' ? 2 : 1;

/**
 * The new HUD's one-band notice: the bell line while the bell is on, otherwise a single notice at
 * a time (a Black gambit, Check, a bell alert, a rank-up) while the rest wait in a short queue,
 * and the auto camera's caption only when nothing else waits.
 */
export function NoticeBand(props: { act: Snapshot['act'] }) {
  const s = useSession();
  const [, wake] = useState(0);
  const st = useRef<{
    seen: Set<string>;
    queue: Item[];
    shown: { item: Item; until: number } | null;
  }>({
    seen: new Set(),
    queue: [],
    shown: null,
  });
  const now = performance.now();
  const { seen, queue } = st.current;
  const add = (item: Item): void => {
    if (seen.has(item.key)) return;
    seen.add(item.key);
    const i = queue.findIndex((q) => q.rank > item.rank);
    queue.splice(i < 0 ? queue.length : i, 0, item);
  };
  const bp = s.ui.blackPlay;
  if (bp)
    add({
      key: `b${bp.id}`,
      at: now,
      rank: 0,
      ms: bp.ms,
      black: { school: bp.school, text: bp.text },
    });
  for (const c of s.ui.chips)
    add({
      key: `c${c.id}`,
      at: now,
      rank: priority(c.kind),
      ms: c.ms,
      chip: { kind: c.kind, title: c.title, detail: c.detail },
    });
  if (seen.size > 200) seen.clear();
  for (let i = queue.length - 1; i >= 0; i--) if (now - queue[i].at > STALE_MS) queue.splice(i, 1);
  while (queue.length > MAX_WAITING) queue.pop();
  const bellOn = props.act.bell !== 'none' && props.act.bell !== 'break';
  if (st.current.shown && now >= st.current.shown.until) st.current.shown = null;
  if (!st.current.shown && !bellOn) {
    const next = queue.shift();
    if (next) st.current.shown = { item: next, until: now + next.ms };
  }
  const shown = st.current.shown?.item ?? null;
  const until = st.current.shown?.until ?? 0;
  useEffect(() => {
    if (!until) return undefined;
    const id = window.setTimeout(
      () => wake((v) => v + 1),
      Math.max(0, until - performance.now()) + 20,
    );
    return () => window.clearTimeout(id);
  }, [until]);
  const caption = props.act.bell === 'none' && !shown && queue.length === 0 ? s.ui.caption : null;
  return (
    <div class="notices" aria-live="polite" data-testid="notices">
      <BellLine act={props.act} />
      {!bellOn && shown && 'black' in shown && (
        <div
          class="black-play"
          key={shown.key}
          data-testid="banner-black"
          style={{ '--ms': `${shown.ms}ms` }}
        >
          <span class="black-play-mark">
            <SchoolGlyph school={shown.black.school} size={16} />
          </span>
          <span class="black-play-text">{shown.black.text}</span>
        </div>
      )}
      {!bellOn && shown && 'chip' in shown && shown.chip.kind !== 'rank' && (
        <div
          class={`banner ${shown.chip.kind}`}
          key={shown.key}
          data-testid={`banner-${shown.chip.kind}`}
          style={{ '--ms': `${shown.ms}ms` }}
        >
          <b>{shown.chip.title}</b>
          {shown.chip.detail && <span>{shown.chip.detail}</span>}
        </div>
      )}
      {!bellOn && shown && 'chip' in shown && shown.chip.kind === 'rank' && (
        <div
          class="rankchip"
          key={shown.key}
          data-testid="rank-chip"
          style={{ '--ms': `${shown.ms}ms` }}
        >
          <b>{shown.chip.title}</b>
          {shown.chip.detail && <span>{shown.chip.detail}</span>}
        </div>
      )}
      {caption && (
        <div class="caption" data-testid="caption" key={caption}>
          <span class="caption-bar" />
          <span class="caption-text">{caption}</span>
        </div>
      )}
    </div>
  );
}

export function Notices(props: { act: Snapshot['act'] }) {
  const s = useSession();
  // one band at a time: the auto camera's caption waits while the bell is ringing
  const text = props.act.bell === 'none' ? s.ui.caption : null;
  const banners = s.ui.chips.filter((c) => c.kind !== 'rank');
  const bell = props.act;
  const ranks = s.ui.chips.filter((c) => c.kind === 'rank');
  return (
    <div class="notices" aria-live="polite">
      <BlackPlayBanner />
      <BellLine act={bell} />
      {banners.map((c) => (
        <div
          class={`banner ${c.kind}`}
          key={c.id}
          data-testid={`banner-${c.kind}`}
          style={{ '--ms': `${c.ms}ms` }}
        >
          <b>{c.title}</b>
          {c.detail && <span>{c.detail}</span>}
        </div>
      ))}
      {ranks.map((c) => (
        <div class="rankchip" key={c.id} data-testid="rank-chip" style={{ '--ms': `${c.ms}ms` }}>
          <b>{c.title}</b>
          {c.detail && <span>{c.detail}</span>}
        </div>
      ))}
      {text && (
        <div class="caption" data-testid="caption" key={text}>
          <span class="caption-bar" />
          <span class="caption-text">{text}</span>
        </div>
      )}
    </div>
  );
}
