import { useEffect, useState } from 'preact/hooks';
import { BUSES, BUS_LABEL, mixer, setVolume, type Bus } from './audio/mixer';
import { isMuted, setMuted, subscribeSound } from './sound';
import { useEscape } from './session';

/** The mute switch: on by default, remembered between visits. */
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

/** Four volume sliders: master, music, ambience, effects. Saved as they move. */
export function Mixer() {
  const [vol, setVol] = useState(() => mixer().volume);
  useEffect(() => subscribeSound(() => setVol(mixer().volume)), []);
  return (
    <div class="mixer" data-testid="mixer">
      {BUSES.map((b: Bus) => (
        <label key={b} class="mixer-row">
          <span class="mixer-name">{BUS_LABEL[b]}</span>
          <input
            type="range"
            min="0"
            max="100"
            step="1"
            value={Math.round(vol[b] * 100)}
            data-testid={`vol-${b}`}
            aria-label={`${BUS_LABEL[b]} volume`}
            onInput={(e) => setVolume(b, Number((e.target as HTMLInputElement).value) / 100)}
          />
          <output class="mixer-val">{Math.round(vol[b] * 100)}</output>
        </label>
      ))}
    </div>
  );
}

/** The sound switch with a small mixer that opens under it (Title and Adjourn). */
export function SoundControls() {
  const [open, setOpen] = useState(false);
  useEscape(open, () => setOpen(false));
  return (
    <div class="sound-box">
      <div class="sound-row">
        <SoundToggle />
        <button
          class="btn small sound-mix-btn"
          data-testid="mixer-toggle"
          aria-expanded={open}
          aria-controls="sound-mixer-panel"
          onClick={() => setOpen(!open)}
        >
          Mixer
        </button>
      </div>
      {open && (
        <div class="sound-panel panel" id="sound-mixer-panel" data-testid="mixer-panel">
          <Mixer />
        </div>
      )}
    </div>
  );
}
