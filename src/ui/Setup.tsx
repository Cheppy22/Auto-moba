import { useEffect, useState } from 'preact/hooks';
import { naturalPath, type Path, type PieceId, type SetupEntry } from '../sim';
import { PIECE_ORDER } from './pieces';
import { useSession } from './session';
import { BoardPage } from './setup/BoardPage';
import { OpeningPage } from './setup/OpeningPage';
import { Pager } from './setup/Pager';
import { PathsPage } from './setup/PathsPage';

const STEPS = ['Paths', 'Board', 'Opening'];

/**
 * The setup screen: three pages (build paths, board arrangement, Opening) you swipe or step
 * through. Sends the same `setupTeam` payload as the old single page.
 */
export function Setup() {
  const s = useSession();
  const m = s.match!;
  const [entries, setEntries] = useState<SetupEntry[]>(() => {
    // the default lanes come from the AI's setup, but each piece starts on its natural build path
    // (the Queen, "The Carry", on Offense), not on the AI's random pick
    const d = m.defaultSetup();
    return PIECE_ORDER.map((p) => {
      const e = d.pieces.find((x) => x.piece === p)!;
      return { ...e, path: naturalPath(s.content.pieceById.get(p)!) };
    });
  });
  const [selected, setSelected] = useState<PieceId | null>(null);
  const openings = s.content.openings;
  const [opening, setOpening] = useState<string>(
    () => (openings.find((o) => o.id === 'italian') ?? openings[0])?.id ?? 'italian',
  );
  const [page, setPage] = useState(0);
  const last = STEPS.length - 1;
  const go = (n: number): void => setPage(Math.max(0, Math.min(last, n)));

  useEffect(() => {
    const on = (e: KeyboardEvent): void => {
      if (e.altKey || e.ctrlKey || e.metaKey) return;
      const t = e.target as HTMLElement | null;
      if (t && /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)) return;
      if (e.key === 'ArrowRight') setPage((p) => Math.min(last, p + 1));
      else if (e.key === 'ArrowLeft') setPage((p) => Math.max(0, p - 1));
    };
    window.addEventListener('keydown', on);
    return () => window.removeEventListener('keydown', on);
  }, [last]);

  const begin = (): void => {
    s.issue({
      type: 'setupTeam',
      opening,
      pieces: entries.map(({ piece, path, lane }) => ({ piece, path, lane })),
    });
  };
  const setPath = (piece: PieceId, path: Path): void =>
    setEntries(entries.map((e) => (e.piece === piece ? { ...e, path } : e)));

  return (
    <div class="overlay setup" data-testid="setup">
      <div class="sp">
        <header class="sp-head">
          <h2>Set the board</h2>
          <ol class="steps" aria-label="Setup steps">
            {STEPS.map((label, i) => (
              <li key={label}>
                <button
                  class={`step ${i === page ? 'on' : ''} ${i < page ? 'done' : ''}`}
                  aria-current={i === page ? 'step' : undefined}
                  data-testid={`step-${i + 1}`}
                  onClick={() => go(i)}
                >
                  <span class="step-n">{i + 1}</span>
                  <span class="step-label">{label}</span>
                </button>
              </li>
            ))}
          </ol>
          <button class="btn quick" data-testid="quick-start" onClick={begin}>
            Quick start
          </button>
        </header>
        <Pager page={page} onPage={go}>
          {[
            <PathsPage key="paths" content={s.content} entries={entries} onPath={setPath} />,
            <BoardPage
              key="board"
              content={s.content}
              entries={entries}
              selected={selected}
              onSelect={setSelected}
              onChange={setEntries}
            />,
            <OpeningPage
              key="opening"
              content={s.content}
              entries={entries}
              opening={opening}
              onOpening={setOpening}
            />,
          ]}
        </Pager>
        <footer class="sp-foot">
          <button class="btn back" data-testid="back" disabled={page === 0} onClick={() => go(page - 1)}>
            Back
          </button>
          <span class="sp-count dim">
            Step {page + 1} of {STEPS.length}
          </span>
          {page < last ? (
            <button class="btn primary next" data-testid="next" onClick={() => go(page + 1)}>
              Next
            </button>
          ) : (
            <button class="btn primary next begin" data-testid="begin" onClick={begin}>
              Begin
            </button>
          )}
        </footer>
      </div>
    </div>
  );
}
