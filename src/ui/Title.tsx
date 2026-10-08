import { useState } from 'preact/hooks';
import { HeroCodex } from './HeroCodex';
import { Butterfly, RitualRing, Seal } from './Ornament';
import { useEscape, useSession } from './session';

export function Title() {
  const s = useSession();
  const [seed, setSeed] = useState('');
  const [codex, setCodex] = useState(false);
  useEscape(codex, () => setCodex(false));
  const start = (): void => {
    const n = Number(seed);
    s.newMatch(seed.trim() !== '' && Number.isFinite(n) ? { seed: n } : {});
  };
  return (
    <>
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
          <Butterfly size={30} />
          <h1 class="wordmark">Auto-MOBA</h1>
          <div class="subtitle">Every wish is paid for. Every world bleeds into the next.</div>
          <p class="title-copy">
            Pick a hero and a lane, then watch the White Court (your team) fight the Red Court
            across a Looking-Glass chessboard in the back room of a wish-shop. Take the enemy King
            for checkmate. You shape the match through your shop, your upgrades and your timing.
          </p>
          <div class="title-actions">
            <button class="btn primary" data-testid="start" onClick={start}>
              New match
            </button>
            <button class="btn" data-testid="open-codex" onClick={() => setCodex(true)}>
              Heroes
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
      {codex && <HeroCodex onClose={() => setCodex(false)} />}
    </>
  );
}
