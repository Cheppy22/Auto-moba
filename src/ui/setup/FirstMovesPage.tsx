import { useState } from 'preact/hooks';
import type { FirstMoveView, PieceId } from '../../sim';
import { TechniqueCard, techniqueFace, type CardMark } from '../TechniqueCard';
import { Term } from '../glossary';
import { PieceGlyph, pieceLabel } from '../pieces';
import { RichText } from '../richtext';
import { useSession } from '../session';
import { TechniqueChip } from '../TechniqueChip';
import {
  chosenIndex,
  lostPicks,
  reasonLine,
  sourceOf,
  type FirstMoveRow,
  type Picks,
} from './firstMoves';

const SOURCE_WORD = { yours: 'Your pick', ai: 'AI pick', open: 'Open' } as const;

/** A run's heirloom, already held: its chip, the part of the piece it changes and its rule. */
function Heirloom(props: { piece: PieceId; id: string }) {
  const s = useSession();
  const face = techniqueFace(s.content, props.id, 'plain', props.piece);
  if (!face) return null;
  return (
    <div class="fm-heir" data-testid={`fm-heirloom-${props.piece}`}>
      <span class="fm-heir-label tiny">
        <Term id="heirloom">Heirloom</Term>: already taken, so the three cards below are for other
        parts of the piece
      </span>
      <span class="fm-heir-body">
        <TechniqueChip c={s.content} id={face.id} grade={face.grade} />
        <span class="tiny dim">Changes: {face.slotName}</span>
      </span>
      <p class="fm-heir-rule tiny">
        <RichText text={face.desc} />
      </p>
    </div>
  );
}

/**
 * Page 1: each piece's first Technique. One tab per piece, three cards each. With "Pick for me" on
 * (the default) the AI's card is already chosen for every piece and the one or two picks that
 * matter most are marked; tap another card to take it instead. A piece left open when "Pick for
 * me" is off takes the card marked "AI suggests" when the match begins.
 */
export function FirstMovesPage(props: {
  view: FirstMoveView;
  picks: Picks;
  onPick: (piece: PieceId, id: string | undefined) => void;
  pickForMe: boolean;
  onPickForMe: (on: boolean) => void;
}) {
  const s = useSession();
  const { view, picks, pickForMe } = props;
  const rows = view.pieces;
  const first = rows.find((r) => r.highlight)?.piece ?? rows[0]?.piece ?? 'king';
  const [sel, setSel] = useState<PieceId | null>(null);
  const row: FirstMoveRow | undefined = rows.find((r) => r.piece === (sel ?? first)) ?? rows[0];
  const lost = lostPicks(view, picks);
  const heirlooms = s.run?.heirlooms ?? {};
  const yours = rows.filter((r) => sourceOf(r, picks[r.piece], pickForMe) === 'yours').length;

  return (
    <section class="sp-page fm-page" aria-label="First moves" data-testid="first-moves">
      <div class="fm-top">
        <div class="fm-pick">
          <button
            class={`fm-switch ${pickForMe ? 'on' : ''}`}
            role="switch"
            aria-checked={pickForMe}
            data-testid="pick-for-me"
            onClick={() => props.onPickForMe(!pickForMe)}
          >
            <span class="fm-knob" aria-hidden="true" />
            <span class="fm-switch-label">Pick for me</span>
          </button>
          <p class="fm-pick-note tiny dim" data-testid="pick-note">
            {pickForMe ? (
              <>
                The AI has chosen a <Term id="technique">Technique</Term> for every piece
                {yours > 0 ? ` except the ${yours} you picked` : ''}. Tap a card to take it instead.
              </>
            ) : (
              <>
                Choose a <Term id="technique">Technique</Term> for each piece. A piece you leave
                open takes the card marked “AI suggests”.
              </>
            )}
          </p>
        </div>
        <div class="fm-chips" role="radiogroup" aria-label="Choose a piece" data-testid="fm-chips">
          {rows.map((r) => {
            const src = sourceOf(r, picks[r.piece], pickForMe);
            const hot = pickForMe && r.highlight;
            return (
              <button
                key={r.piece}
                role="radio"
                aria-checked={r.piece === row?.piece}
                class={`fm-chip ${r.piece === row?.piece ? 'on' : ''} ${hot ? 'hot' : ''} ${src}`}
                data-testid={`fm-chip-${r.piece}`}
                data-source={src}
                onClick={() => setSel(r.piece)}
              >
                <PieceGlyph piece={r.piece} team="A" size={26} />
                <span class="fm-chip-name">{pieceLabel(s.content, r.piece)}</span>
                <span class="fm-chip-src tiny">{hot ? 'Look here' : SOURCE_WORD[src]}</span>
              </button>
            );
          })}
        </div>
      </div>
      {lost.length > 0 && (
        <p class="fm-lost tiny" role="status" data-testid="fm-lost">
          The Opening changed the deal for {lost.map((p) => pieceLabel(s.content, p)).join(', ')}:
          pick again.
        </p>
      )}
      {row && (
        <div class="fm-piece" data-testid={`first-move-${row.piece}`}>
          {pickForMe && row.highlight && (
            <p class="fm-hot tiny" data-testid="fm-hot">
              <b>Worth a look.</b> {reasonLine(row.reasons)}
            </p>
          )}
          {heirlooms[row.piece] && <Heirloom piece={row.piece} id={heirlooms[row.piece]!} />}
          <p class="fm-for tiny dim">{pieceLabel(s.content, row.piece)}: pick one of three.</p>
          <ul class="fm-cards" aria-label={`${pieceLabel(s.content, row.piece)} first move`}>
            {row.cards.map((card, i) => {
              const chosen = chosenIndex(row, picks[row.piece], pickForMe) === i;
              const src = sourceOf(row, picks[row.piece], pickForMe);
              // the AI's pre-selected card says "Picked for you"; an open piece only says "AI suggests"
              const mark: CardMark =
                chosen && src === 'ai' ? 'picked' : !chosen && card.suggested ? 'suggested' : null;
              return (
                <li key={card.id} class={`fm-card ${chosen ? 'on' : ''}`} data-chosen={chosen}>
                  <TechniqueCard
                    card={card}
                    mark={mark}
                    index={i}
                    testid={`fm-card-${row.piece}-${i}`}
                  >
                    <button
                      class={`btn tcard-take ${chosen ? 'chosen' : 'primary'}`}
                      aria-pressed={chosen}
                      data-testid={`fm-take-${row.piece}-${i}`}
                      onClick={() => props.onPick(row.piece, card.id)}
                    >
                      {chosen ? 'Chosen' : `Take ${card.name}`}
                    </button>
                  </TechniqueCard>
                </li>
              );
            })}
          </ul>
          {sourceOf(row, picks[row.piece], pickForMe) === 'yours' && (
            <button
              class="btn small ghost fm-undo"
              data-testid={`fm-undo-${row.piece}`}
              onClick={() => props.onPick(row.piece, undefined)}
            >
              {pickForMe ? 'Back to the AI’s pick' : 'Leave this piece open'}
            </button>
          )}
        </div>
      )}
    </section>
  );
}
