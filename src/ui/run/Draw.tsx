import { courtOf, roundName } from '../../sim';
import { Term } from '../glossary';
import { PieceGlyph } from '../pieces';
import { useSession } from '../session';
import { CourtSeal, CourtStyles, laneLine, OpeningLine, SignatureRelic, startsWith } from './parts';
import { CourtPortrait } from './seals';

/**
 * The tournament draw: the four rounds as a ladder. You know the first court (its name, Opening
 * and schools); the later courts show their name and how strong they start, and their Opening is
 * fixed when you reach them.
 */
export function Draw() {
  const s = useSession();
  const run = s.run!;
  const c = s.content;
  return (
    <div class="overlay run-screen draw" data-testid="draw">
      <div class="rs-wrap">
        <header class="rs-head">
          <button class="btn rs-back" data-testid="draw-back" onClick={() => s.reset()}>
            Title
          </button>
          <div>
            <h2>The tournament draw</h2>
            <p class="rs-sub">Four rounds. Win to go on; one loss ends the run.</p>
          </div>
        </header>
        <ol class="ladder" aria-label="The four rounds">
          {run.opponents.map((opp, i) => {
            const now = i === run.round;
            const final = i === run.opponents.length - 1;
            const row = c.tournament?.rounds[i];
            const court = courtOf(c, opp);
            return (
              <li
                key={opp.id}
                class={`rung ${now ? 'now' : 'ahead'} ${final ? 'final' : ''} ${court && now ? 'has-art' : ''}`}
                data-testid={`rung-${i + 1}`}
                aria-current={now ? 'step' : undefined}
              >
                <span class="rung-node" aria-hidden="true">
                  {final ? <PieceGlyph piece="king" team="A" size={16} /> : i + 1}
                </span>
                {court && now ? (
                  <span class="rung-art">
                    <CourtPortrait court={court} width={84} final={final} />
                    <CourtSeal name={opp.name} court={court} final={final} size={38} />
                  </span>
                ) : (
                  <CourtSeal name={opp.name} court={court} final={final} size={now ? 56 : 44} />
                )}
                <div class="rung-body">
                  <span class="rung-round">{roundName(c, i)}</span>
                  <b class="rung-name" data-testid={`rung-name-${i + 1}`}>
                    {opp.name}
                  </b>
                  {court && (
                    <i class="rung-motto" data-testid={`rung-motto-${i + 1}`}>
                      {court.motto}
                    </i>
                  )}
                  {court || now ? <OpeningLine c={c} opening={opp.setup.opening} /> : null}
                  {court && now && <span class="rung-manner">{court.manner}</span>}
                  <span class="rung-note">
                    {startsWith(c, opp)}
                    {!court && !now && row?.counterOpening ? ' Its Opening answers yours.' : ''}
                  </span>
                </div>
                {court && now && (
                  <div class="rung-dossier" data-testid="rung-dossier">
                    <CourtStyles c={c} court={court} />
                    <span class="rung-lanes">{laneLine(c, court)}.</span>
                    <SignatureRelic c={c} court={court} />
                  </div>
                )}
              </li>
            );
          })}
        </ol>
        <p class="rs-fine draw-fine">
          Each <Term id="round">round</Term> is a full match. Your court, archetypes and relics
          carry on; items, gold and Ranks start fresh.
        </p>
        <footer class="rs-foot">
          <button class="btn primary rs-cta" data-testid="draw-setup" onClick={() => s.playRound()}>
            Set up your court
          </button>
        </footer>
      </div>
    </div>
  );
}
