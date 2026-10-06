import { useState } from 'preact/hooks';
import { HeroCodex } from './HeroCodex';
import { Divider, Seal } from './Ornament';
import { useSession } from './session';

export function Title() {
  const s = useSession();
  const [seed, setSeed] = useState('');
  const [codex, setCodex] = useState(false);
  return (
    <>
      <div class="overlay" data-testid="title">
        <div class="panel title-wrap col">
          <Seal />
          <Divider />
          <h1>Auto-MOBA</h1>
          <div class="subtitle">Every wish is paid for. Every world bleeds into the next.</div>
          <Divider />
          <div class="dim">
            A pocket dimension where every wish has a price. Choose a hero and a lane, then watch
            your team fight and shape the match through your shop, your upgrades and your timing.
          </div>
          <div class="row" style={{ justifyContent: 'center' }}>
            <input
              type="text"
              placeholder="seed (optional)"
              value={seed}
              onInput={(e) => setSeed((e.target as HTMLInputElement).value)}
              data-testid="seed"
            />
            <button
              class="btn primary"
              data-testid="start"
              onClick={() => {
                const n = Number(seed);
                s.newMatch(seed.trim() !== '' && Number.isFinite(n) ? { seed: n } : {});
              }}
            >
              New match
            </button>
            <button class="btn" data-testid="open-codex" onClick={() => setCodex(true)}>
              Heroes
            </button>
          </div>
        </div>
      </div>
      {codex && <HeroCodex onClose={() => setCodex(false)} />}
    </>
  );
}
