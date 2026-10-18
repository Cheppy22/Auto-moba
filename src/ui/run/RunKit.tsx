import { useEffect, useRef } from 'preact/hooks';
import type { CarriedRelic, Content, RelicDef } from '../../sim';
import { Term } from '../glossary';
import { CardChips, LaneChips, PieceChips, QuotaControls, SealedControls } from '../hud/RelicsTab';
import { faceOfDef, TechniqueCard } from '../builds/TechniqueCard';
import {
  LANES,
  LANE_LABEL,
  LANE_TAG,
  PIECE_ORDER,
  PieceGlyph,
  pieceLabel,
  styleDesc,
} from '../pieces';
import { FamilyChip, RelicSeal, TRIGGER_SHORT, bindsLane, relicText } from '../relics';
import { SchoolChip } from '../schools';
import { useEscape, useSession } from '../session';

/** What a carried relic is aimed at, in words. */
function aimWords(c: Content, r: CarriedRelic): string {
  const parts: string[] = [];
  if (r.lane) parts.push(`${LANE_LABEL[r.lane]} lane`);
  if (r.piece) parts.push(pieceLabel(c, r.piece));
  if (r.card) parts.push(c.gambitById.get(r.card)?.name ?? r.card);
  if (r.trigger) parts.push(TRIGGER_SHORT[r.trigger]);
  if (r.quota)
    parts.push(
      `${LANES.map((l) => `${LANE_TAG[l]}${r.quota![l]}`).join(' ')}, reserve ${r.reserve ?? 0}`,
    );
  return parts.join(' · ');
}

function KitRelic(props: { held: CarriedRelic; def: RelicDef }) {
  const s = useSession();
  const c = s.content;
  const { held: r, def } = props;
  const aim = (patch: Partial<Omit<CarriedRelic, 'id'>>): void => {
    s.aimRunRelic(r.id, patch);
  };
  const guardedOk = s.run!.relics.some(
    (h) => (h.id === 'crown_jewel' || h.id === 'guarded_piece') && h.piece !== null,
  );
  const id = `kit-aim-${def.id}`;
  const where = aimWords(c, r);
  return (
    <article class="rk-relic" data-testid={`kit-relic-${def.id}`} data-family={def.family}>
      <header class="rk-relic-head">
        <RelicSeal family={def.family} size={30} />
        <div>
          <b>{def.name}</b>
          <span class="rk-relic-tags">
            <FamilyChip family={def.family} />
            {where && <span class="rcard-where">{where}</span>}
          </span>
        </div>
      </header>
      <p class="rk-relic-desc">{relicText(c, def, 'A', s.run!.court.opening)}</p>
      {def.bind === 'sealed' && (
        <SealedControls
          aim={r}
          guardedOk={guardedOk}
          opening={s.run!.court.opening}
          onChange={aim}
          testid={`${id}-sealed`}
        />
      )}
      {def.bind === 'quota' && (
        <QuotaControls
          aim={r}
          cap={c.tuning.pawns.capBase}
          reserves={c.tuning.relics.reserves}
          onChange={aim}
          testid={`${id}-quota`}
        />
      )}
      {def.bind === 'laneCard' && (
        <CardChips
          def={def}
          value={r.card}
          onChange={(card) => aim({ card })}
          testid={`${id}-card`}
        />
      )}
      {bindsLane(def) && (
        <LaneChips
          value={r.lane}
          onChange={(lane) => aim({ lane })}
          testid={`${id}-lane`}
          label={`${def.name} lane`}
        />
      )}
      {def.bind === 'piece' && (
        <PieceChips
          options={PIECE_ORDER.map((p) => ({ id: p, piece: p }))}
          value={r.piece}
          onChange={(piece) => aim({ piece })}
          testid={`${id}-piece`}
          label={`${def.name} piece`}
        />
      )}
    </article>
  );
}

/**
 * The Run kit: what the run carries, as a sheet over Setup. Archetypes and relic aims can change
 * between matches; heirlooms and book moves are read only.
 */
export function RunKit(props: { onClose: () => void }) {
  const s = useSession();
  const c = s.content;
  const run = s.run!;
  useEscape(true, props.onClose);
  // keyboard and screen-reader users land in the sheet; the Done button is the first stop
  const done = useRef<HTMLButtonElement>(null);
  useEffect(() => done.current?.focus({ preventScroll: true }), []);
  const max = c.tournament?.relicMax ?? 5;
  const heirlooms = PIECE_ORDER.flatMap((p) => {
    const id = run.heirlooms[p];
    return id && c.techniqueById.has(id) ? [{ piece: p, id }] : [];
  });
  const books = run.books.flatMap((id) => c.gambitById.get(id) ?? []);
  return (
    <div class="rk-back" data-testid="run-kit-back" onClick={props.onClose}>
      <section
        class="rk"
        role="dialog"
        aria-modal="true"
        aria-label="Run kit"
        data-testid="run-kit"
        onClick={(e) => e.stopPropagation()}
      >
        <header class="rk-head">
          <h3>Run kit</h3>
          <button
            ref={done}
            class="btn rk-close"
            data-testid="run-kit-close"
            onClick={props.onClose}
          >
            Done
          </button>
        </header>
        <div class="rk-body">
          {s.ui.toast && (
            <p class="rs-error" role="alert">
              {s.ui.toast}
            </p>
          )}
          <section class="rk-sec" data-testid="kit-archetypes">
            <h4 class="rk-h">
              <Term id="archetype">Archetypes</Term>
            </h4>
            <p class="rk-note">
              A piece takes its archetype again at Rank 4 by itself. Choose “At Rank 4” to pick it
              in the match.
            </p>
            {PIECE_ORDER.map((p) => {
              const def = c.pieceById.get(p)!;
              const cur = run.archetypes[p] ?? null;
              return (
                <div
                  class="rk-arch"
                  key={p}
                  role="radiogroup"
                  aria-label={`${pieceLabel(c, p)} archetype`}
                >
                  <span class="rk-arch-piece">
                    <PieceGlyph piece={p} team="A" size={22} />
                    {pieceLabel(c, p)}
                  </span>
                  <span class="rk-arch-opts">
                    <button
                      class={`rl-chip wide ${cur === null ? 'on' : ''}`}
                      role="radio"
                      aria-checked={cur === null}
                      data-testid={`kit-arch-${p}-none`}
                      onClick={() => s.setRunArchetype(p, null)}
                    >
                      At Rank 4
                    </button>
                    {def.styles.map((st) => (
                      <button
                        key={st.id}
                        class={`rl-chip wide ${cur === st.id ? 'on' : ''}`}
                        role="radio"
                        aria-checked={cur === st.id}
                        title={styleDesc(c, p, st.id)}
                        data-testid={`kit-arch-${p}-${st.id}`}
                        onClick={() => s.setRunArchetype(p, st.id)}
                      >
                        {st.name}
                      </button>
                    ))}
                  </span>
                </div>
              );
            })}
          </section>

          <section class="rk-sec" data-testid="kit-relics">
            <h4 class="rk-h">
              <Term id="relic">Relics</Term>{' '}
              <span class="dim">
                ({run.relics.length}/{max})
              </span>
            </h4>
            {run.relics.length === 0 ? (
              <p class="rk-note">None yet. Win a round and take one from the spoils.</p>
            ) : (
              run.relics.map((r) => {
                const def = c.relicById.get(r.id);
                return def ? <KitRelic key={r.id} held={r} def={def} /> : null;
              })
            )}
          </section>

          <section class="rk-sec" data-testid="kit-heirlooms">
            <h4 class="rk-h">
              <Term id="heirloom">Heirlooms</Term>
            </h4>
            {heirlooms.length === 0 ? (
              <p class="rk-note">None yet. A piece with one starts every match holding it.</p>
            ) : (
              <ul class="rk-heirs">
                {heirlooms.map(({ piece, id }) => {
                  const face = faceOfDef(c, id, 'plain', piece);
                  return (
                    <li key={piece} data-testid={`kit-heirloom-${piece}`}>
                      {face && (
                        <TechniqueCard
                          face={face}
                          compact
                          tag={
                            <span class="rk-heir-on tiny">
                              <PieceGlyph piece={piece} team="A" size={16} />
                              {pieceLabel(c, piece)}
                            </span>
                          }
                        />
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          <section class="rk-sec" data-testid="kit-books">
            <h4 class="rk-h">
              <Term id="book-move">Book moves</Term>
            </h4>
            {books.length === 0 ? (
              <p class="rk-note">None yet. A book move is drawn twice as often.</p>
            ) : (
              <ul class="relic-names">
                {books.map((g) => (
                  <li key={g.id}>
                    <SchoolChip school={g.school} glyph={13} />
                    <span>{g.name} ×2</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </section>
    </div>
  );
}
