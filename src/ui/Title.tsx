import { useState } from 'preact/hooks';
import { RulesPage, Term, Terms } from './glossary';
import { bestText, roundLine } from './run/parts';
import { mmss } from './format';
import { PieceGlyph, PIECE_ORDER } from './pieces';
import { SoundToggle } from './SoundToggle';
import { ThemePicker } from './ThemePicker';
import { useSession } from './session';

export function Title() {
  const s = useSession();
  const [seed, setSeed] = useState('');
  const [rules, setRules] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const saved = s.savedRun();
  const match = s.savedMatch();
  const given = (): number | undefined => {
    const n = Number(seed);
    return seed.trim() !== '' && Number.isFinite(n) ? n : undefined;
  };
  const start = (): void => {
    const n = given();
    s.newMatch(n === undefined ? {} : { seed: n });
  };
  const tournament = (): void => {
    // a saved run is only replaced after the player agrees to abandon it
    if (saved && !confirm) setConfirm(true);
    else {
      if (saved) s.endRun();
      s.startRun(given());
    }
  };
  return (
    <div class="overlay title" data-testid="title">
      <div class="title-art" aria-hidden="true" />
      <div class="title-wrap">
        <div class="title-pieces" aria-hidden="true">
          {PIECE_ORDER.map((p) => (
            <span class="title-tile" key={p}>
              <PieceGlyph piece={p} team="A" size={34} />
            </span>
          ))}
        </div>
        <h1 class="wordmark">Auto-MOBA</h1>
        <div class="build-stamp" data-testid="build-stamp">
          Chess variant · build {__BUILD_ID__}
        </div>
        <div class="subtitle">Every piece fights. Every move is yours.</div>
        <p class="title-copy">
          <Terms
            text="Lead the White court against Black across a living chessboard. Your King, Queen, Rook, Bishop and Knight fight on their own. You choose their styles and lanes, then play gambits, answer forks and field pawns until one King is checkmated."
            skip={['court']}
            max={4}
          />
        </p>
        {s.resuming !== null && (
          <div class="title-resume" role="status" data-testid="resuming">
            <span>Resuming your match… {Math.round(s.resuming * 100)}%</span>
            <span class="title-resume-bar" aria-hidden="true">
              <i style={{ width: `${Math.round(s.resuming * 100)}%` }} />
            </span>
          </div>
        )}
        <div class="title-actions" hidden={s.resuming !== null}>
          {match ? (
            <button
              class="btn primary title-main"
              data-testid="resume-match"
              onClick={() => void s.resumeMatch()}
            >
              <span>Resume match</span>
              <span class="title-main-sub">
                {match.run && saved ? `${roundLine(s.content, saved)} · ` : 'Exhibition · '}
                Act {match.act} · {mmss(match.tick)}
              </span>
            </button>
          ) : null}
          {saved && !match?.run ? (
            <button
              class="btn primary title-main"
              data-testid="continue-run"
              onClick={() => s.continueRun()}
            >
              <span>Continue</span>
              <span class="title-main-sub">
                {roundLine(s.content, saved)} vs {saved.opponents[saved.round].name}
              </span>
            </button>
          ) : null}
          <button
            class={`btn title-main ${saved || match ? '' : 'primary'}`}
            data-testid="tournament"
            onClick={tournament}
          >
            <span>{saved ? 'New tournament' : 'Tournament'}</span>
          </button>
          {s.resumeNote && (
            <p class="title-modes" role="status" data-testid="resume-note">
              {s.resumeNote}
            </p>
          )}
          {confirm && saved && (
            <div class="title-confirm" role="alertdialog" aria-label="Abandon your current run?">
              <p>Abandon your current run? Its progress is lost.</p>
              <div class="row">
                <button class="btn danger" data-testid="abandon-run" onClick={tournament}>
                  Abandon and start again
                </button>
                <button class="btn" data-testid="abandon-keep" onClick={() => setConfirm(false)}>
                  Keep it
                </button>
              </div>
            </div>
          )}
          <div class="title-second">
            <button class="btn" data-testid="start" onClick={start}>
              Exhibition
            </button>
            <button class="btn" data-testid="rules-open" onClick={() => setRules(true)}>
              Rules
            </button>
          </div>
          <p class="title-modes">
            <Term id="tournament">Tournament</Term>: four rounds, and one loss ends it.{' '}
            <Term id="exhibition">Exhibition</Term>: a single match.
          </p>
          {s.best && (
            <p class="title-best" data-testid="best-finish">
              {bestText(s.content, s.best)}
            </p>
          )}
        </div>
        <SoundToggle />
        <ThemePicker />
        <label class="seed">
          Seed
          <input
            type="text"
            placeholder="random"
            value={seed}
            onInput={(e) => setSeed((e.target as HTMLInputElement).value)}
            onKeyDown={(e) => e.key === 'Enter' && start()}
            data-testid="seed"
          />
        </label>
      </div>
      {rules && <RulesPage onClose={() => setRules(false)} />}
    </div>
  );
}
