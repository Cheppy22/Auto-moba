import { createContext } from 'preact';
import { useContext, useEffect, useRef, useState } from 'preact/hooks';
import { Match, type Command, type CommandResult, type Content, type MatchConfig } from '../sim';
import type { CamMode } from '../render/broadcast/types';
import { plainText } from './richtext';

export type Speed = 0 | 1 | 2 | 4 | 8;

export interface Notice {
  id: number;
  heroId: number;
  team: 'A' | 'B';
  title: string;
  detail: string;
  startTick: number;
  own: boolean;
}

export const NOTICE_TICKS = 200;

export interface UiState {
  notices: Notice[];
  speed: Speed;
  reportHero: number | null;
  reportScope: 'phase' | 'match';
  reportPhase: number;
  prepTab: 'upgrade' | 'shop' | 'auction' | 'curse';
  shopOpen: boolean;
  toast: string | null;
  info: string | null;
  view: 'map' | 'broadcast';
  cam: CamMode;
  follow: number | null;
  caption: string | null;
}

const freshUi = (): UiState => ({
  notices: [],
  speed: 1,
  reportHero: null,
  reportScope: 'phase',
  reportPhase: 1,
  prepTab: 'upgrade',
  shopOpen: false,
  toast: null,
  info: null,
  view: 'map',
  cam: 'auto',
  follow: null,
  caption: null,
});

export class Session {
  match: Match | null = null;
  ui: UiState = freshUi();
  version = 0;
  alpha = 1;
  private curseSeq = -1;
  private pendingCurses: { hero: number; item: string; flaw: string }[] = [];
  private noticeId = 0;
  flashHalo: () => void = () => {};
  private infoTimer = 0;
  private escapes: (() => void)[] = [];
  private listeners = new Set<() => void>();
  private frameListeners = new Set<(alpha: number) => void>();

  constructor(readonly content: Content) {}

  subscribe(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  onFrame(fn: (alpha: number) => void): () => void {
    this.frameListeners.add(fn);
    return () => this.frameListeners.delete(fn);
  }

  frame(alpha: number): void {
    this.alpha = alpha;
    for (const fn of this.frameListeners) fn(alpha);
  }

  notify(): void {
    this.version++;
    for (const fn of this.listeners) fn();
  }

  setUi(patch: Partial<UiState>): void {
    this.ui = { ...this.ui, ...patch };
    this.notify();
  }

  flash(message: string, ms = 4000): void {
    window.clearTimeout(this.infoTimer);
    this.setUi({ info: message });
    this.infoTimer = window.setTimeout(() => this.setUi({ info: null }), ms);
  }

  pushEscape(close: () => void): () => void {
    this.escapes.push(close);
    return () => {
      this.escapes = this.escapes.filter((fn) => fn !== close);
    };
  }

  closeTopOverlay(): void {
    this.escapes[this.escapes.length - 1]?.();
  }

  syncNotices(): void {
    const m = this.match;
    if (!m) return;
    const ev = m.events;
    if (ev.length === 0 || ev[ev.length - 1].seq < this.curseSeq) {
      this.curseSeq = -1;
      this.pendingCurses = [];
    }
    for (let i = ev.length - 1; i >= 0 && ev[i].seq > this.curseSeq; i--) {
      const e = ev[i];
      if (e.type === 'curseAccepted') this.pendingCurses.unshift(e.payload);
    }
    if (ev.length) this.curseSeq = ev[ev.length - 1].seq;
    const tick = m.state.tick;
    let notices = this.ui.notices;
    let changed = false;
    if (m.state.phase.kind === 'live' && this.pendingCurses.length > 0) {
      const fresh: Notice[] = this.pendingCurses.flatMap((c, i) => {
        const u = m.unitById(c.hero);
        if (!u || u.team === 'neutral') return [];
        const hero = this.content.heroById.get(u.defId);
        const item = this.content.cursedById.get(c.item);
        const flaw = item?.flaws.find((f) => f.id === c.flaw);
        return [
          {
            id: ++this.noticeId,
            heroId: u.id,
            team: u.team,
            title: item?.name ?? c.item,
            detail: `${hero?.name.split(',')[0] ?? 'A hero'} took a cursed bargain. ${plainText(item?.boonText ?? '')}${flaw ? ` Price: ${plainText(flaw.text).replace(/^The price: /, '')}.` : ''}`,
            startTick: tick + i * 12,
            own: u.hero?.isPlayer ?? false,
          },
        ];
      });
      this.pendingCurses = [];
      notices = [...notices, ...fresh];
      changed = true;
    }
    const alive = notices.filter((n) => tick < n.startTick + NOTICE_TICKS);
    if (alive.length !== notices.length) changed = true;
    if (changed) {
      this.ui = { ...this.ui, notices: alive };
      this.notify();
    }
  }

  newMatch(config?: Partial<MatchConfig>): void {
    const seed = config?.seed ?? Math.floor(Math.random() * 1e9);
    this.match = Match.create(this.content, { seed, ...config });
    this.curseSeq = -1;
    this.pendingCurses = [];
    this.ui = { ...freshUi(), view: this.ui.view, cam: this.ui.cam };
    this.notify();
  }

  issue(cmd: Command): CommandResult {
    if (!this.match) return { ok: false, reason: 'no match' };
    const r = this.match.issue(cmd);
    this.ui = {
      ...this.ui,
      toast: r.ok ? null : (r.reason ?? 'rejected'),
      prepTab:
        r.ok && (cmd.type === 'continue' || cmd.type === 'startMatch')
          ? 'upgrade'
          : this.ui.prepTab,
    };
    this.notify();
    return r;
  }

  reset(): void {
    this.match = null;
    this.ui = freshUi();
    this.notify();
  }
}

export function useEscape(active: boolean, close: () => void): void {
  const s = useSession();
  const latest = useRef(close);
  latest.current = close;
  useEffect(() => (active ? s.pushEscape(() => latest.current()) : undefined), [s, active]);
}

export const SessionContext = createContext<Session | null>(null);

export function useSession(): Session {
  const s = useContext(SessionContext);
  if (!s) throw new Error('SessionContext missing');
  const [, setV] = useState(0);
  useEffect(() => s.subscribe(() => setV((v) => v + 1)), [s]);
  return s;
}
