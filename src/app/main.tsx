import { render } from 'preact';
import { App } from '../ui/App';
import { Session, SessionContext } from '../ui/session';
import { preloadViews } from '../ui/lazy';
import { play, unlock } from '../ui/sound';
import '../ui/styles.css';
import { loadBrowserContent } from './content';
import { registerServiceWorker } from './pwa';
import { FrameClock } from './loop';

const session = new Session(loadBrowserContent());
const clock = new FrameClock(session);
clock.start();

declare global {
  interface Window {
    __session?: Session;
  }
}
window.__session = session;

// sound starts with the first tap or key (browsers allow nothing sooner); every tap on a control ticks
window.addEventListener(
  'pointerdown',
  (e) => {
    unlock();
    const hit = e.target instanceof Element ? e.target.closest('button, [role="tab"]') : null;
    if (hit && !(hit as HTMLButtonElement).disabled) play('tap');
  },
  { capture: true },
);
window.addEventListener('keydown', unlock);

// a phone can kill a hidden page at any moment: save the match the moment the page is left
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') session.autosave(performance.now(), true);
});
window.addEventListener('pagehide', () => session.autosave(performance.now(), true));

preloadViews();
registerServiceWorker();

const root = document.getElementById('app');
if (root) {
  render(
    <SessionContext.Provider value={session}>
      <App />
    </SessionContext.Provider>,
    root,
  );
}
