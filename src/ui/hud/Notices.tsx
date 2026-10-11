import type { Snapshot } from '../../sim';
import { useSession } from '../session';
import { BlackPlayBanner } from './BlackPlay';

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
      {bell.bell !== 'none' && bell.bell !== 'break' && (
        <div class="bell-line" data-testid="bell-line" data-stage={bell.bell}>
          {bell.bell === 'pending'
            ? 'Bell pending — waiting for the board to calm'
            : bell.bell === 'tolling'
              ? `The bell tolls — ${bell.toll} of ${s.content.tuning.bell.tolls}`
              : 'The bell has rung — stopping play'}
        </div>
      )}
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
