import { render } from 'preact';
import { App } from '../ui/App';
import { Session, SessionContext } from '../ui/session';
import { tapCue } from '../ui/audio/cues';
import { mapTheme, subscribeMapTheme } from '../ui/mapTheme';
import { play, setSoundTheme, soundDebug, unlock } from '../ui/sound';
import '../ui/styles.css';
import { loadBrowserContent } from './content';
import { FrameClock } from './loop';

const session = new Session(loadBrowserContent());
const clock = new FrameClock(session);
clock.start();

declare global {
  interface Window {
    __session?: Session;
    __sound?: typeof soundDebug;
  }
}
window.__session = session;
window.__sound = soundDebug;

// sound starts with the first tap or key (browsers allow nothing sooner); every tap on a control ticks
window.addEventListener(
  'pointerdown',
  (e) => {
    unlock();
    const hit = e.target instanceof Element ? e.target.closest('button, [role="tab"]') : null;
    if (hit && !(hit as HTMLButtonElement).disabled)
      play(tapCue(hit.getAttribute('role') === 'tab'));
  },
  { capture: true },
);
window.addEventListener('keydown', unlock);
// a touch only counts as a gesture for audio when the finger lifts
window.addEventListener('pointerup', unlock);

// the garden follows the board theme
setSoundTheme(mapTheme());
subscribeMapTheme(() => setSoundTheme(mapTheme()));

const root = document.getElementById('app');
if (root) {
  render(
    <SessionContext.Provider value={session}>
      <App />
    </SessionContext.Provider>,
    root,
  );
}
