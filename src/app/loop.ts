import type { Session } from '../ui/session';

const TPS = 20;

export class FrameClock {
  private raf = 0;
  private last = 0;
  private acc = 0;
  private lastNotify = 0;
  private running = false;
  private seenSeq = -1;

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

  private openShopOnArrival(m: NonNullable<Session['match']>): void {
    const ev = m.events;
    const pid = m.state.playerHeroId;
    if (ev.length === 0 || ev[ev.length - 1].seq < this.seenSeq) this.seenSeq = -1;
    for (let i = ev.length - 1; i >= 0 && ev[i].seq > this.seenSeq; i--) {
      const e = ev[i];
      if (
        (e.type === 'recall' && e.payload.stage === 'done' && e.payload.id === pid) ||
        (e.type === 'shopVisit' && e.payload.id === pid)
      ) {
        this.session.setUi({ shopOpen: true });
        break;
      }
    }
    if (ev.length) this.seenSeq = ev[ev.length - 1].seq;
  }

  private advance(now: number): void {
    const s = this.session;
    const dt = Math.min(250, now - this.last);
    this.last = now;
    const m = s.match;
    if (m && m.state.phase.kind === 'live' && s.ui.speed > 0 && !s.ui.shopOpen) {
      this.acc += (dt / 1000) * TPS * s.ui.speed;
      let n = Math.floor(this.acc);
      this.acc -= n;
      n = Math.min(n, 120);
      if (n > 0) {
        m.step(n);
        this.openShopOnArrival(m);
      }
      if (m.state.phase.kind !== 'live') {
        this.acc = 0;
        s.notify();
      }
    } else this.acc = 0;
    s.syncNotices();
    s.frame(m ? Math.min(1, this.acc) : 1);
    if (now - this.lastNotify > 120) {
      this.lastNotify = now;
      if (m && m.state.phase.kind === 'live') s.notify();
    }
  }
}
