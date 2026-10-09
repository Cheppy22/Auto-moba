import { useState } from 'preact/hooks';
import { PieceGlyph, PIECE_ORDER } from './pieces';
import { useSession } from './session';

export function Title() {
  const s = useSession();
  const [seed, setSeed] = useState('');
  const start = (): void => {
    const n = Number(seed);
    s.newMatch(seed.trim() !== '' && Number.isFinite(n) ? { seed: n } : {});
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
          Lead the White court against Black across a living chessboard. Your King, Queen, Rook,
          Bishop and Knight fight on their own. You choose their styles and lanes, then play
          gambits, answer forks and field pawns until one King is checkmated.
        </p>
        <div class="title-actions">
          <button class="btn primary" data-testid="start" onClick={start}>
            New match
          </button>
        </div>
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
    </div>
  );
}
