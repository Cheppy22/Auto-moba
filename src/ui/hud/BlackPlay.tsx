import { SchoolGlyph } from '../schools';
import { useSession } from '../session';

/** The gambit Black just played, at the top in Black's slate: school mark and one line. */
export function BlackPlayBanner() {
  const p = useSession().ui.blackPlay;
  if (!p) return null;
  return (
    <div
      class={`black-play ${p.loss ? 'loss' : ''}`}
      key={p.id}
      data-testid="banner-black"
      style={{ '--ms': `${p.ms}ms` }}
    >
      <span class="black-play-mark">
        <SchoolGlyph school={p.school} size={16} />
      </span>
      <span class="black-play-text">{p.text}</span>
    </div>
  );
}
