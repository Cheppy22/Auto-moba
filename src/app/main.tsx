import { render } from 'preact';
import { App } from '../ui/App';
import { Session, SessionContext } from '../ui/session';
import '../ui/styles.css';
import { loadBrowserContent } from './content';
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

const root = document.getElementById('app');
if (root) {
  render(
    <SessionContext.Provider value={session}>
      <App />
    </SessionContext.Provider>,
    root,
  );
}
