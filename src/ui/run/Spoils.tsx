import type { ComponentChildren } from 'preact';
import { useState } from 'preact/hooks';
import { courtOf, roundName, type Reward } from '../../sim';
import { Term, Terms } from '../glossary';
import { TechniqueCard, techniqueFace } from '../TechniqueCard';
import { PieceGlyph, pieceLabel } from '../pieces';
import { FamilyChip, RelicSeal, relicText } from '../relics';
import { SchoolChip } from '../schools';
import { useSession } from '../session';
import {
  CourtFirstMoves,
  CourtSeal,
  laneLine,
  OpeningLine,
  RelicNames,
  SignatureRelic,
  startsWith,
} from './parts';
import { CourtPortrait } from './seals';

type Kind = Reward['kind'];

/** One reward card: what it is, what it does, and a button that takes it. */
function Card(props: {
  kind: Kind;
  label: string;
  mark: ComponentChildren;
  title: string;
  children: ComponentChildren;
  action: ComponentChildren;
}) {
  return (
    <article class={`spoil spoil-${props.kind}`} data-testid={`spoil-${props.kind}`}>
      <header class="spoil-head">
        <span class="spoil-mark" aria-hidden="true">
          {props.mark}
        </span>
        <div>
          <span class="spoil-kind">{props.label}</span>
          <b class="spoil-title">{props.title}</b>
        </div>
      </header>
      <div class="spoil-body">{props.children}</div>
      <div class="spoil-action">{props.action}</div>
    </article>
  );
}

/**
 * Spoils: after a win, the next opponent and the three prizes (a relic, an heirloom and a book
 * move). One tap takes a card and goes to Setup. With five relics held the relic card asks which
 * one to swap out.
 */
export function Spoils() {
  const s = useSession();
  const run = s.run!;
  const c = s.content;
  const [swapping, setSwapping] = useState(false);
  const opp = run.opponents[run.round];
  const court = courtOf(c, opp);
  const finalRound = run.round === run.opponents.length - 1;
  const full = run.relics.length >= (c.tournament?.relicMax ?? 5);
  const offers = run.offers ?? [];
  const take = (r: Reward): void => {
    s.pickReward(r);
  };
  return (
    <div class="overlay run-screen spoils" data-testid="spoils">
      <div class="rs-wrap">
        <header class="rs-head">
          <div>
            <h2 data-testid="spoils-title">Round {run.round} won</h2>
            <p class="rs-sub">
              Take one of the <Term id="spoils">spoils</Term> before the next match.
            </p>
          </div>
        </header>

        <section
          class={`next-court ${court ? 'named' : ''}`}
          data-testid="next-court"
          aria-label="Next opponent"
        >
          {court ? (
            <span class="rung-art">
              <CourtPortrait court={court} width={84} final={finalRound} />
              <CourtSeal name={opp.name} court={court} final={finalRound} size={38} />
            </span>
          ) : (
            <CourtSeal name={opp.name} final={finalRound} size={52} />
          )}
          <div class="next-body">
            <span class="rung-round">
              Next: round {run.round + 1}, {roundName(c, run.round)}
            </span>
            <b class="rung-name">{opp.name}</b>
            {court && (
              <i class="rung-motto" data-testid="court-motto">
                {court.motto}
              </i>
            )}
            <OpeningLine c={c} opening={opp.setup.opening} />
            {court && <span class="rung-lanes">{laneLine(c, court)}.</span>}
            {court && (
              <>
                <span class="rung-moves-h">First moves</span>
                <CourtFirstMoves c={c} court={court} />
              </>
            )}
            <span class="rung-note">{startsWith(c, opp)}</span>
            {court ? (
              <SignatureRelic c={c} court={court} />
            ) : (
              opp.relics.length > 0 && <RelicNames c={c} relics={opp.relics} />
            )}
          </div>
        </section>

        <div class="spoil-row" data-testid="spoil-row">
          {offers.map((o) => {
            if (o.kind === 'relic') {
              const def = c.relicById.get(o.relic)!;
              return (
                <Card
                  key="relic"
                  kind="relic"
                  label="Relic"
                  mark={<RelicSeal family={def.family} size={40} />}
                  title={def.name}
                  action={
                    full ? (
                      swapping ? (
                        <div class="spoil-swap" role="group" aria-label="Relic to swap out">
                          <span class="rs-fine">Swap out which relic?</span>
                          {run.relics.map((h) => (
                            <button
                              key={h.id}
                              class="btn spoil-swapbtn"
                              data-testid={`spoil-swap-${h.id}`}
                              onClick={() => take({ ...o, replaces: h.id })}
                            >
                              {c.relicById.get(h.id)?.name ?? h.id}
                            </button>
                          ))}
                        </div>
                      ) : (
                        <button
                          class="btn primary spoil-take"
                          data-testid="spoil-take-relic"
                          onClick={() => setSwapping(true)}
                        >
                          Swap for one you hold
                        </button>
                      )
                    ) : (
                      <button
                        class="btn primary spoil-take"
                        data-testid="spoil-take-relic"
                        onClick={() => take(o)}
                      >
                        Take this relic
                      </button>
                    )
                  }
                >
                  <span class="spoil-tags">
                    <FamilyChip family={def.family} />
                    {def.rally && <span class="rally-chip">Rally</span>}
                  </span>
                  <p>
                    <Terms text={relicText(c, def, 'A', run.court.opening)} max={1} />
                  </p>
                  <p class="spoil-fine">
                    Starts working in Act 1. Aim it on the run kit when you set up.
                  </p>
                </Card>
              );
            }
            if (o.kind === 'heirloom') {
              const tech = c.techniqueById.get(o.technique)!;
              const face = techniqueFace(c, tech.id, 'plain', o.piece);
              return (
                <Card
                  key="heirloom"
                  kind="heirloom"
                  label="Heirloom"
                  mark={<PieceGlyph piece={o.piece} team="A" size={34} />}
                  title={tech.name}
                  action={
                    <button
                      class="btn primary spoil-take"
                      data-testid="spoil-take-heirloom"
                      onClick={() => take(o)}
                    >
                      Take this heirloom
                    </button>
                  }
                >
                  <p>
                    Your {pieceLabel(c, o.piece)} keeps this <Term id="technique">Technique</Term>{' '}
                    and starts every later match holding it, at Plain grade.
                  </p>
                  {face && <TechniqueCard card={face} testid="spoil-heirloom-card" />}
                </Card>
              );
            }
            const card = c.gambitById.get(o.card)!;
            return (
              <Card
                key="book"
                kind="book"
                label="Book move"
                mark={<span class="spoil-x2">×2</span>}
                title={card.name}
                action={
                  <button
                    class="btn primary spoil-take"
                    data-testid="spoil-take-book"
                    onClick={() => take(o)}
                  >
                    Take this book move
                  </button>
                }
              >
                <span class="spoil-tags">
                  <SchoolChip school={card.school} glyph={13} />
                  <span class="spoil-item">{card.cost} Tempo</span>
                </span>
                <p>
                  A <Term id="gambit">gambit</Term> for your hand, not a Technique. It is dealt
                  twice as often for the rest of the run.
                </p>
                <p class="spoil-fine">{card.desc}</p>
              </Card>
            );
          })}
        </div>

        <footer class="rs-foot">
          <button
            class="btn spoil-auto"
            data-testid="spoils-auto"
            onClick={() => s.pickReward('auto')}
          >
            Let the AI choose
          </button>
          {s.ui.toast && (
            <p class="rs-error" role="alert">
              {s.ui.toast}
            </p>
          )}
        </footer>
      </div>
    </div>
  );
}
