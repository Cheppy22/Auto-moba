import { Term } from '../glossary';
import { whitePieces } from '../Orders';
import { pieceLabel } from '../pieces';
import { RichText } from '../richtext';
import { SCHOOL_NAME } from '../schools';
import { useSession } from '../session';
import { GRADE_MARK, TechniqueChip } from '../TechniqueChip';

/**
 * The Act break's Builds tab, read only for now (the full Builds screen, with Take, Reroll,
 * Upgrade and Pass, comes with the piece-builds screens): each White piece's Techniques and its
 * offer, with the card the AI suggests. On Resume every piece takes that card.
 */
export function BuildsTab() {
  const s = useSession();
  const m = s.match!;
  return (
    <div class="col builds-tab" data-testid="builds-tab">
      <p class="tiny dim">
        Each piece is offered three <Term id="technique">Techniques</Term>. On Resume it takes the
        one marked “AI suggests”.
      </p>
      {whitePieces(s).map((u) => {
        const v = m.buildView(u.id);
        if (!v) return null;
        const held = v.slots.flatMap((x) => (x.held ? [x.held] : []));
        return (
          <section class="card builds-piece" key={u.id} data-testid={`builds-${v.piece}`}>
            <header class="row">
              <b>{pieceLabel(s.content, v.piece)}</b>
              <span class="dim tiny">
                <span class="coin" />
                {v.gold} gold
              </span>
            </header>
            <div class="builds-held">
              {held.length === 0 && <span class="dim tiny">No Techniques yet.</span>}
              {held.map((x) => (
                <TechniqueChip key={x.id} c={s.content} id={x.id} grade={x.grade} />
              ))}
            </div>
            {v.offer && (
              <ul class="builds-offer">
                {v.offer.cards.map((card, i) => (
                  <li
                    key={card.id}
                    class={card.suggested ? 'on' : ''}
                    data-testid={`builds-card-${v.piece}-${i}`}
                  >
                    <b>
                      {card.name}
                      {GRADE_MARK[card.grade] && ` ${GRADE_MARK[card.grade]}`}
                    </b>
                    <span class="dim tiny">
                      {' '}
                      · {SCHOOL_NAME[card.school]} · {card.slotName}
                      {card.replaces ? ` · replaces ${card.replaces}` : ''}
                    </span>
                    {card.suggested && <i class="builds-ai tiny"> AI suggests</i>}
                    <p class="tiny">
                      <RichText text={card.desc} />
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </section>
        );
      })}
    </div>
  );
}
