import { roundName } from '../../sim';
import { Term } from '../glossary';
import { PacePicker } from '../PacePicker';
import { PieceGlyph } from '../pieces';
import { useSession } from '../session';
import { CourtSeal, OpeningLine, relicCapLine, startsWith } from './parts';

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
            return (
              <li
                key={opp.id}
                class={`rung ${now ? 'now' : 'ahead'} ${final ? 'final' : ''}`}
                data-testid={`rung-${i + 1}`}
                aria-current={now ? 'step' : undefined}
              >
                <span class="rung-node" aria-hidden="true">
                  {final ? <PieceGlyph piece="king" team="A" size={16} /> : i + 1}
                </span>
                <CourtSeal name={opp.name} final={final} size={now ? 56 : 44} />
                <div class="rung-body">
                  <span class="rung-round">{roundName(c, i)}</span>
                  <b class="rung-name" data-testid={`rung-name-${i + 1}`}>
                    {opp.name}
                  </b>
                  {now ? (
                    <>
                      <OpeningLine c={c} opening={opp.setup.opening} />
                      <span class="rung-note">
                        {startsWith(c, opp)} {relicCapLine(c, opp)}
                      </span>
                    </>
                  ) : (
                    <span class="rung-note">
                      {startsWith(c, opp)} {relicCapLine(c, opp)}
                      {row?.counterOpening ? ' Its Opening answers yours.' : ''}
                    </span>
                  )}
                </div>
              </li>
            );
          })}
        </ol>
        <footer class="rs-foot">
          <PacePicker
            value={run.pace}
            onPick={(p) => s.setPace(p)}
            note="every match of this run plays at this pace."
          />
          <button class="btn primary rs-cta" data-testid="draw-setup" onClick={() => s.playRound()}>
            Set up your court
          </button>
          <p class="rs-fine">
            Each <Term id="round">round</Term> is a full match. Your court, archetypes and relics
            carry on; items, gold and Ranks start fresh.
          </p>
        </footer>
      </div>
    </div>
  );
}
