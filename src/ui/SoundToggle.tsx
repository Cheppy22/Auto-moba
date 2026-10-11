import { useEffect, useState } from 'preact/hooks';
import { isMuted, setMuted, subscribeSound } from './sound';

/** The sound switch (Title and Adjourn): on by default, remembered between visits. */
export function SoundToggle() {
  const [muted, setLocal] = useState(isMuted);
  useEffect(() => subscribeSound(() => setLocal(isMuted())), []);
  return (
    <button
      class={`btn small sound-toggle ${muted ? 'off' : ''}`}
      data-testid="sound-toggle"
      aria-pressed={!muted}
      aria-label={muted ? 'Sound is off. Turn sound on.' : 'Sound is on. Turn sound off.'}
      title={muted ? 'Sound off' : 'Sound on'}
      onClick={() => setMuted(!muted)}
    >
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M4 9.5h3.5L12 6v12l-4.5-3.5H4z" fill="currentColor" stroke="currentColor" />
        {muted ? (
          <path d="M16 9.5l5 5m0-5-5 5" stroke="currentColor" stroke-width="1.8" />
        ) : (
          <path
            d="M15.5 9a4 4 0 0 1 0 6m2.6-8.6a7.5 7.5 0 0 1 0 11.2"
            stroke="currentColor"
            stroke-width="1.8"
            stroke-linecap="round"
          />
        )}
      </svg>
      <span>{muted ? 'Sound off' : 'Sound on'}</span>
    </button>
  );
}
