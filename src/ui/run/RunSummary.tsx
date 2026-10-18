import { courtOf, roundName, type PieceId } from '../../sim';
import { Term } from '../glossary';
import { TechniqueChip } from '../TechniqueChip';
import { PIECE_ORDER, PieceGlyph, pieceLabel, styleLabel } from '../pieces';
import { SchoolChip } from '../schools';
import { useSession } from '../session';
import { bestText, CourtSeal, OpeningLine, outLabel, RelicNames } from './parts';

/**
 * The run's end: Champion or "Out in the Semifinal", the four rounds, your court and the prizes
 * you took, and the best-finish line. Leaving this screen deletes the run's save.
 */
export function RunSummary() {
  const s = useSession();
  const run = s.run!;
  const c = s.content;
  const champion = run.status === 'champion';
  const title = champion ? 'Champion' : outLabel(c, run.round);
  const heirlooms = PIECE_ORDER.flatMap((p) => {
    const id = run.heirlooms[p];
    return id && c.techniqueById.has(id) ? [{ piece: p, id }] : [];
  });
  const books = run.books.flatMap((id) => c.gambitById.get(id) ?? []);
  const leave = (then: () => void): void => {
    s.endRun();
    then();
  };
  return (
    <div
      class={`overlay run-screen summary ${champion ? 'champion' : 'out'}`}
      data-testid="summary"
    >
      <div class="rs-wrap">
        <header class="rs-head sum-head">
          <PieceGlyph piece="king" team={champion ? 'A' : 'B'} size={56} />
          <div>
            <h2 data-testid="summary-heading">{title}</h2>
            {s.best && (
              <p class="rs-sub" data-testid="best-finish">
                {bestText(c, s.best)}
                {s.runBestNew && <span class="new-best"> New best</span>}
              </p>
            )}
          </div>
        </header>

        <ol class="sum-rounds" aria-label="The four rounds">
          {run.opponents.map((opp, i) => {
            const r = run.results[i];
            const mvp = r?.mvp ?? null;
            const court = courtOf(c, opp);
            return (
              <li
                key={opp.id}
                class={`sum-round ${r ? (r.won ? 'won' : 'lost') : 'unplayed'}`}
                data-testid={`sum-round-${i + 1}`}
              >
                <CourtSeal
                  name={opp.name}
                  court={court}
                  final={i === run.opponents.length - 1}
                  size={42}
                />
                <div class="sum-round-body">
                  <span class="rung-round">{roundName(c, i)}</span>
                  <b class="rung-name">{r ? r.opponent : opp.name}</b>
                  {court && <i class="rung-motto">{court.motto}</i>}
                  <span class="sum-line">
                    {r ? (
                      <>
                        <span class="sum-result">{r.won ? 'Won' : 'Lost'}</span>
                        <span>{Math.max(1, Math.round(r.minutes))} min</span>
                        {r.adjudicated && (
                          <span class="sum-adj">
                            <Term id="adjudication">Adjudicated</Term>
                          </span>
                        )}
                        {mvp && (
                          <span class="sum-mvp">
                            <PieceGlyph piece={mvp as PieceId} team="A" size={18} />
                            {pieceLabel(c, mvp)}
                          </span>
                        )}
                      </>
                    ) : (
                      <span class="dim">Not reached</span>
                    )}
                  </span>
                </div>
              </li>
            );
          })}
        </ol>

        <section class="sum-kit" aria-label="Your court at the end">
          <h3 class="rs-h">
            Your <Term id="court">court</Term>
          </h3>
          <p class="sum-opening">
            <OpeningLine c={c} opening={run.court.opening} />
          </p>
          <ul class="sum-pieces">
            {PIECE_ORDER.map((p) => (
              <li key={p}>
                <PieceGlyph piece={p} team="A" size={22} />
                <span>
                  <b>{pieceLabel(c, p)}</b>{' '}
                  <span class="dim">{styleLabel(c, p, run.archetypes[p] ?? null) || '—'}</span>
                </span>
              </li>
            ))}
          </ul>
          {(run.relics.length > 0 || heirlooms.length > 0 || books.length > 0) && (
            <>
              <h3 class="rs-h">What you took</h3>
              {run.relics.length > 0 && <RelicNames c={c} relics={run.relics} />}
              {heirlooms.length > 0 && (
                <ul class="relic-names">
                  {heirlooms.map(({ piece, id }) => (
                    <li key={piece}>
                      <TechniqueChip c={c} id={id} />
                      <span class="dim">for the {pieceLabel(c, piece)}</span>
                    </li>
                  ))}
                </ul>
              )}
              {books.length > 0 && (
                <ul class="relic-names">
                  {books.map((g) => (
                    <li key={g.id}>
                      <SchoolChip school={g.school} glyph={13} />
                      <span>{g.name} ×2</span>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </section>

        <p class="rs-fine sum-fine">Nothing from this run carries into the next one.</p>
        <footer class="rs-foot sum-foot">
          <button
            class="btn primary rs-cta"
            data-testid="summary-new"
            onClick={() => leave(() => s.startRun())}
          >
            New run
          </button>
          <button
            class="btn"
            data-testid="summary-exhibition"
            onClick={() => leave(() => s.newMatch())}
          >
            Exhibition
          </button>
          <button class="btn" data-testid="summary-title" onClick={() => leave(() => undefined)}>
            Title
          </button>
        </footer>
      </div>
    </div>
  );
}
