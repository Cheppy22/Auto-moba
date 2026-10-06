import { createContext } from 'preact';
import { useContext, useEffect, useState } from 'preact/hooks';
import { Match, type Command, type CommandResult, type Content, type MatchConfig } from '../sim';

export type Speed = 0 | 1 | 2 | 4;

export interface UiState {
  speed: Speed;
  reportHero: number | null;
  reportScope: 'phase' | 'match';
  reportPhase: number;
  prepTab: 'upgrade' | 'shop' | 'auction' | 'curse';
  shopOpen: boolean;
  toast: string | null;
}

const freshUi = (): UiState => ({
  speed: 1,
  reportHero: null,
  reportScope: 'phase',
  reportPhase: 1,
  prepTab: 'upgrade',
  shopOpen: false,
  toast: null,
});

export class Session {
  match: Match | null = null;
  ui: UiState = freshUi();
  version = 0;
  alpha = 1;
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

  newMatch(config?: Partial<MatchConfig>): void {
    const seed = config?.seed ?? Math.floor(Math.random() * 1e9);
    this.match = Match.create(this.content, { seed, ...config });
    this.ui = freshUi();
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

export const SessionContext = createContext<Session | null>(null);

export function useSession(): Session {
  const s = useContext(SessionContext);
  if (!s) throw new Error('SessionContext missing');
  const [, setV] = useState(0);
  useEffect(() => s.subscribe(() => setV((v) => v + 1)), [s]);
  return s;
}
