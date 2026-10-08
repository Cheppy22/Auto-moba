import { useState } from 'preact/hooks';
import { Butterfly, RitualRing, Seal } from './Ornament';
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
      <div class="title-art" aria-hidden="true">
        <RitualRing class="title-ring" />
        <RitualRing class="title-ring slow" />
        {[
          ['8%', '0s', 1.2],
          ['24%', '6s', 0.8],
          ['47%', '11s', 1.5],
          ['68%', '3s', 0.9],
          ['86%', '15s', 1.1],
        ].map(([x, d, sc]) => (
          <span class="drift" key={x} style={{ '--x': x, '--d': d, '--s': sc }}>
            <Butterfly size={26} />
          </span>
        ))}
      </div>
      <div class="title-wrap">
        <Seal />
        <div class="title-pieces" aria-hidden="true">
          {PIECE_ORDER.map((p) => (
            <PieceGlyph key={p} piece={p} team="A" size={30} />
          ))}
        </div>
        <h1 class="wordmark">Auto-MOBA</h1>
        <div class="build-stamp" data-testid="build-stamp">
          Chess variant · build {__BUILD_ID__}
        </div>
        <div class="subtitle">Every wish is paid for. Every move is a gambit.</div>
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
