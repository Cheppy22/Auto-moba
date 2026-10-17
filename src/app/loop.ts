import { TPS } from '../sim';
import type { Session } from '../ui/session';

export class FrameClock {
  private raf = 0;
  private last = 0;
  private acc = 0;
  private lastNotify = 0;
  private running = false;

  constructor(private session: Session) {}

  start(): void {
    if (this.running) return;
    this.running = true;
    this.last = performance.now();
    const tick = (now: number): void => {
      if (!this.running) return;
      this.advance(now);
      this.raf = requestAnimationFrame(tick);
    };
    this.raf = requestAnimationFrame(tick);
  }

  stop(): void {
    this.running = false;
    cancelAnimationFrame(this.raf);
  }

  /**
   * Only Pause, the Adjourn panel, a gambit sheet, a waiting fork, the match intro and the Act
   * break sheet hold the sim. They are separate flags: closing one never releases another. Across the bell's halt the
   * step rate eases from 1 to 0 (`Match.timeScale`) and the renderer slows its clocks to match.
   */
  private advance(now: number): void {
    const s = this.session;
    const dt = Math.min(250, now - this.last);
    this.last = now;
    const m = s.match;
    s.syncForks();
    s.syncIntro();
    const forkWait = !!m && m.state.forks.length > 0;
    const scale = m ? m.timeScale : 1;
    if (
      m &&
      m.state.phase.kind === 'live' &&
      s.ui.speed > 0 &&
      !s.ui.adjourned &&
      !s.ui.info &&
      !s.ui.intro &&
      !forkWait &&
      m.state.bell.stage !== 'break'
    ) {
      this.acc += (dt / 1000) * TPS * s.ui.speed * scale;
      let n = Math.floor(this.acc);
      this.acc -= n;
      n = Math.min(n, 120);
      if (n > 0) m.step(n);
      if (m.state.phase.kind !== 'live') {
        this.acc = 0;
        s.notify();
      }
    } else this.acc = 0;
    s.timeScale = m ? m.timeScale : 1;
    s.syncEvents();
    s.syncBell();
    s.syncSound();
    s.frame(m ? Math.min(1, this.acc) : 1);
    if (now - this.lastNotify > 120) {
      this.lastNotify = now;
      if (m && m.state.phase.kind === 'live') s.notify();
    }
  }
}
