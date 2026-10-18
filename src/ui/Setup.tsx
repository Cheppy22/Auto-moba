import { useEffect, useMemo, useState } from 'preact/hooks';
import type { PieceId, SetupEntry } from '../sim';
import { loadPickForMe, savePickForMe } from './hud/buildsData';
import { readOpening, storeOpening } from './openingPick';
import { PacePicker } from './PacePicker';
import { PIECE_ORDER } from './pieces';
import { useSession } from './session';
import { RunKit } from './run/RunKit';
import { RunStrip } from './run/RunStrip';
import { BoardPage } from './setup/BoardPage';
import { OpeningPage } from './setup/OpeningPage';
import { Pager } from './setup/Pager';
import { FirstMovesPage } from './setup/FirstMovesPage';
import { firstMovesToSend, type Picks } from './setup/firstMoves';

const STEPS = ['First moves', 'Board', 'Opening'];

/**
 * The setup screen: three pages (first moves, board arrangement, Opening) you swipe or step
 * through. Sends the same `setupTeam` payload as the old single page.
 */
export function Setup() {
  const s = useSession();
  const m = s.match!;
  // in a run, from the second match on, the court starts as the last match's; otherwise the lanes
  // come from the AI's setup
  const carried = s.run !== null && s.run.results.length > 0;
  const [entries, setEntries] = useState<SetupEntry[]>(() => {
    const d = carried ? s.setupDefaults()! : m.defaultSetup();
    return PIECE_ORDER.map((p) => ({ ...d.pieces.find((x) => x.piece === p)! }));
  });
  const [selected, setSelected] = useState<PieceId | null>(null);
  const openings = s.content.openings;
  const [opening, setOpening] = useState<string>(() =>
    carried ? s.setupDefaults()!.opening : readOpening(openings.map((o) => o.id)),
  );
  // First moves: the player's own picks, and "Pick for me" (on: the AI's card is already chosen)
  const [picks, setPicks] = useState<Picks>({});
  const [pickForMe, setPickForMe] = useState(loadPickForMe);
  const moves = useMemo(() => m.firstMoves(opening), [m, opening]);
  const [kit, setKit] = useState(false);
  const [page, setPage] = useState(0);
  const last = STEPS.length - 1;
  const go = (n: number): void => setPage(Math.max(0, Math.min(last, n)));

  // draw the versus card's portraits now, so the card has them the moment Begin is pressed
  useEffect(() => s.prewarmPortraits(), [s]);

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
    storeOpening(opening);
    const first = firstMovesToSend(moves, picks, pickForMe);
    s.issue({
      type: 'setupTeam',
      opening,
      pieces: entries.map(({ piece, lane }) => ({
        piece,
        lane,
        ...(first[piece] !== undefined ? { firstMove: first[piece] } : {}),
      })),
    });
  };

  return (
    <div class="overlay setup" data-testid="setup">
      <div class={`sp ${s.run ? 'in-run' : ''}`}>
        <header class="sp-head">
          <h2>Set the board</h2>
          {s.run && <RunStrip onOpen={() => setKit(true)} />}
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
            <FirstMovesPage
              key="moves"
              view={moves}
              picks={picks}
              onPick={(piece, id) =>
                setPicks((p) => {
                  const next = { ...p };
                  if (id === undefined) delete next[piece];
                  else next[piece] = id;
                  return next;
                })
              }
              pickForMe={pickForMe}
              onPickForMe={(on) => {
                savePickForMe(on);
                setPickForMe(on);
              }}
            />,
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
        {page === last && !s.run && <PacePicker value={s.pace} onPick={(p) => s.setPace(p)} />}
        <footer class="sp-foot">
          <button
            class="btn back"
            data-testid="back"
            disabled={page === 0}
            onClick={() => go(page - 1)}
          >
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
      {kit && s.run && <RunKit onClose={() => setKit(false)} />}
    </div>
  );
}
