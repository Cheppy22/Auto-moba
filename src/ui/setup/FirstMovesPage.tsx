import { Term } from '../glossary';
import { PieceGlyph, pieceLabel } from '../pieces';
import { RichText } from '../richtext';
import { SCHOOL_NAME } from '../schools';
import { useSession } from '../session';

/**
 * Page 1: each piece's first move, read only for now (choosing one comes with the piece-builds
 * screens): the three Setup cards this Opening deals it, and the one the AI takes for it when the
 * match starts.
 */
export function FirstMovesPage(props: { opening: string }) {
  const s = useSession();
  const view = s.match!.firstMoves(props.opening);
  return (
    <section class="sp-page fm-page" aria-label="First moves" data-testid="first-moves">
      <p class="tiny dim">
        Each piece starts with one <Term id="technique">Technique</Term>: the AI takes the marked
        card for it when the match begins.
      </p>
      {view.pieces.map((p) => (
        <div class="card fm-piece" key={p.piece} data-testid={`first-move-${p.piece}`}>
          <header class="row">
            <PieceGlyph piece={p.piece} team="A" size={24} />
            <b>{pieceLabel(s.content, p.piece)}</b>
          </header>
          <ul class="builds-offer">
            {p.cards.map((card) => (
              <li key={card.id} class={card.suggested ? 'on' : ''}>
                <b>{card.name}</b>
                <span class="dim tiny">
                  {' '}
                  · {SCHOOL_NAME[card.school]} · {card.slotName}
                </span>
                {card.suggested && <i class="builds-ai tiny"> AI suggests</i>}
                <p class="tiny">
                  <RichText text={card.desc} />
                </p>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </section>
  );
}
