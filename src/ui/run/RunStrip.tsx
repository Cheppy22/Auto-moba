import { PIECE_ORDER, PieceGlyph, pieceLabel, styleLabel } from '../pieces';
import { RelicSeal } from '../relics';
import { ItemIcon } from '../ItemIcon';
import { useSession } from '../session';
import { roundName } from '../../sim';

/**
 * The thin strip on top of Setup in a run: the round, and what you carry as small marks (relic
 * seals, heirloom items, a piece for each archetype taken). Tap it for the Run kit.
 */
export function RunStrip(props: { onOpen: () => void }) {
  const s = useSession();
  const run = s.run!;
  const c = s.content;
  const heirlooms = PIECE_ORDER.flatMap((p) => (run.heirlooms[p] ? [p] : []));
  const styled = PIECE_ORDER.filter((p) => run.archetypes[p]);
  const none = run.relics.length + heirlooms.length + styled.length === 0;
  return (
    <button
      class="run-strip"
      data-testid="run-strip"
      aria-haspopup="dialog"
      aria-label={`Round ${run.round + 1} of ${run.opponents.length}, ${roundName(c, run.round)}. Open the run kit.`}
      onClick={props.onOpen}
    >
      <span class="rst-round">
        <b>
          Round {run.round + 1} of {run.opponents.length}
        </b>
        <span class="rst-name"> · {roundName(c, run.round)}</span>
      </span>
      <span class="rst-marks" data-testid="run-strip-marks">
        {run.relics.map((r) => {
          const def = c.relicById.get(r.id);
          return def ? (
            <span class="rst-mark" key={r.id} title={def.name}>
              <RelicSeal family={def.family} size={20} />
            </span>
          ) : null;
        })}
        <span class="rst-extra">
          {heirlooms.map((p) => (
            <span
              class="rst-mark item"
              key={p}
              title={`${pieceLabel(c, p)} heirloom: ${c.itemById.get(run.heirlooms[p]!)?.name}`}
            >
              <ItemIcon id={run.heirlooms[p]!} size={16} />
            </span>
          ))}
          {styled.map((p) => (
            <span
              class="rst-mark piece"
              key={p}
              title={`${pieceLabel(c, p)}: ${styleLabel(c, p, run.archetypes[p]!)}`}
            >
              <PieceGlyph piece={p} team="A" size={16} />
            </span>
          ))}
        </span>
        {none && <span class="rst-none">Nothing carried yet</span>}
      </span>
      <span class="rst-open">Run kit</span>
    </button>
  );
}
