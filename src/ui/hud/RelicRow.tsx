import { useState } from 'preact/hooks';
import type { PlayTeam, Snapshot } from '../../sim';
import { FamilyChip, RelicSeal, aimText } from '../relics';
import { useEscape, useSession } from '../session';

/**
 * A team's held relics as a small row of seals under its roster; tap one for its text. Calm: no
 * motion, nothing over the middle of the board.
 */
export function RelicRow(props: { team: PlayTeam; snap: Snapshot }) {
  const s = useSession();
  const [open, setOpen] = useState<string | null>(null);
  const held = props.snap.relics.held[props.team];
  useEscape(open !== null, () => setOpen(null));
  if (held.length === 0) return null;
  const shown = held.find((h) => h.id === open);
  const def = shown ? s.content.relicById.get(shown.id) : undefined;
  const side = props.team === 'A' ? 'White' : 'Black';
  return (
    <div class={`relic-row side-${props.team}`} data-testid={`relic-row-${props.team}`}>
      {held.map((h) => {
        const d = s.content.relicById.get(h.id);
        if (!d) return null;
        return (
          <button
            key={h.id}
            class={`relic-icon ${open === h.id ? 'open' : ''}`}
            aria-label={`${side} relic: ${d.name}`}
            aria-expanded={open === h.id}
            title={d.name}
            data-testid={`relic-icon-${props.team}-${h.id}`}
            onClick={() => setOpen(open === h.id ? null : h.id)}
          >
            <RelicSeal family={d.family} size={22} />
          </button>
        );
      })}
      {shown && def && (
        <>
          <div class="relic-scrim" onClick={() => setOpen(null)} />
          <div class="relic-pop" role="dialog" data-testid="relic-pop" aria-label={def.name}>
            <header>
              <RelicSeal family={def.family} size={26} />
              <b>{def.name}</b>
            </header>
            <FamilyChip family={def.family} />
            <p>{def.desc}</p>
            {def.bind !== 'none' && (
              <p class="relic-pop-aim">
                Aimed at {aimText(s.content, shown, (id) => s.match!.unitById(id)) || 'nothing'}
              </p>
            )}
          </div>
        </>
      )}
    </div>
  );
}
