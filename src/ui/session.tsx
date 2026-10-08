import { createContext } from 'preact';
import { useContext, useEffect, useRef, useState } from 'preact/hooks';
import {
  Match,
  type Command,
  type CommandResult,
  type Content,
  type LaneId,
  type MatchConfig,
  type PlayTeam,
} from '../sim';
import type { CamMode } from '../render/broadcast/types';
import { courtName } from '../analysis/text';
import { cap, pieceLabel } from './pieces';

export type Speed = 0 | 1 | 2 | 4 | 8;

/** What the next tap on the HUD or the 3D view will do. */
export type Aim = { kind: 'gambit'; slot: number; cardId: string } | { kind: 'pawn' };

/** A short-lived banner (Act, Check, Throne) or rank-up chip. */
export interface Chip {
  id: number;
  kind: 'rank' | 'act' | 'check' | 'throne';
  title: string;
  detail: string;
  team: PlayTeam | null;
  /** Wall-clock ms when the chip leaves. */
  until: number;
}

export interface UiState {
  speed: Speed;
  cam: CamMode;
  follow: number | null;
  caption: string | null;
  toast: string | null;
  aim: Aim | null;
  adjourned: boolean;
  chips: Chip[];
  reportHero: number | null;
}

const freshUi = (): UiState => ({
  speed: 1,
  cam: 'auto',
  follow: null,
  caption: null,
  toast: null,
  aim: null,
  adjourned: false,
  chips: [],
  reportHero: null,
});

/** The 3D view's picking calls, set by the game view while it exists. */
export interface PickView {
  pickGround(clientX: number, clientY: number): { x: number; y: number } | null;
  pickUnit(clientX: number, clientY: number): number | null;
}

const RANK_CHIP_MS = 5200;
const BANNER_MS = 3400;
const MAX_RANK_CHIPS = 2;
const MAX_BANNERS = 2;
/** How far (map units) a tap may miss a unit and still count when it picks the ground. */
const NEAR_PICK = 90;
const same = (a: Chip, b: Chip): boolean => a.kind === b.kind && a.title === b.title;
const isMap = (kind: string): boolean => kind === 'tower' || kind === 'guardian';

export class Session {
  match: Match | null = null;
  ui: UiState = freshUi();
  version = 0;
  alpha = 1;
  view: PickView | null = null;
  private chipId = 0;
  private seenSeq = -1;
  private toastTimer = 0;
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

  /** A short message near the hand (the sim's refusals, small hints). */
  toast(message: string, ms = 3200): void {
    window.clearTimeout(this.toastTimer);
    this.setUi({ toast: cap(message) });
    this.toastTimer = window.setTimeout(() => this.setUi({ toast: null }), ms);
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

  // ------------------------------------------------------------ match

  newMatch(config?: Partial<MatchConfig>): void {
    const seed = config?.seed ?? Math.floor(Math.random() * 1e9);
    this.match = Match.create(this.content, { seed, ...config });
    this.seenSeq = -1;
    this.ui = { ...freshUi(), cam: this.ui.cam };
    this.notify();
  }

  issue(cmd: Command): CommandResult {
    if (!this.match) return { ok: false, reason: 'no match' };
    const r = this.match.issue(cmd);
    if (!r.ok) this.toast(r.reason ?? 'rejected');
    else this.notify();
    return r;
  }

  reset(): void {
    this.match = null;
    this.ui = freshUi();
    this.notify();
  }

  adjourn(): void {
    if (this.match?.state.phase.kind !== 'live') return;
    this.setUi({ adjourned: true, aim: null });
  }

  resume(): void {
    this.setUi({ adjourned: false });
  }

  // ------------------------------------------------------------ gambits, pawns, forks

  /** Tap on a hand card: play it, or start aiming it. */
  playCard(slot: number): void {
    const m = this.match;
    if (!m) return;
    const card = m.snapshot().hand[slot];
    if (!card || card.cardId === '') return;
    if (this.ui.aim?.kind === 'gambit' && this.ui.aim.slot === slot) {
      this.setUi({ aim: null });
      return;
    }
    if (!card.usable) {
      this.setUi({ aim: null });
      this.toast(card.reason || 'that card cannot be played now');
      return;
    }
    if (card.target === 'none') {
      this.setUi({ aim: null });
      this.issue({ type: 'playGambit', slot });
      return;
    }
    this.setUi({ aim: { kind: 'gambit', slot, cardId: card.cardId }, toast: null });
  }

  /** Tap on Field Pawn: check the cost and cap, then ask for a lane. */
  fieldPawn(): void {
    const m = this.match;
    if (!m) return;
    if (this.ui.aim?.kind === 'pawn') {
      this.setUi({ aim: null });
      return;
    }
    const snap = m.snapshot();
    const p = snap.pawns.A;
    if (snap.phase.kind !== 'live') return this.toast('Pawns are fielded during the match');
    if (snap.tempo.A < p.cost) return this.toast('Not enough Tempo');
    if (p.alive >= p.cap) return this.toast('Pawn cap reached');
    this.setUi({ aim: { kind: 'pawn' }, toast: null });
  }

  cancelAim(): void {
    if (this.ui.aim) this.setUi({ aim: null });
  }

  /** A lane button of the aim tray. */
  aimLane(lane: LaneId): void {
    const aim = this.ui.aim;
    if (!aim) return;
    if (aim.kind === 'pawn') this.issue({ type: 'fieldPawn', lane });
    else this.issue({ type: 'playGambit', slot: aim.slot, lane });
    this.setUi({ aim: null });
  }

  /** A tap on the 3D view while a point or enemy gambit is being aimed. */
  aimTap(clientX: number, clientY: number): void {
    const aim = this.ui.aim;
    const m = this.match;
    if (!aim || aim.kind !== 'gambit' || !m) return;
    if (!this.view) return this.toast('The 3D view is not ready: pick a lane card instead');
    const card = m.snapshot().hand[aim.slot];
    if (!card || card.cardId !== aim.cardId) {
      this.setUi({ aim: null });
      return;
    }
    let r: CommandResult | null = null;
    if (card.target === 'point') {
      const g = this.view.pickGround(clientX, clientY);
      if (!g) return this.toast('Tap the board to choose a spot');
      r = this.issue({ type: 'playGambit', slot: aim.slot, x: g.x, y: g.y });
    } else if (card.target === 'enemy') {
      const wantStructure = card.cardId === 'siege';
      const targetId = this.pickEnemy(clientX, clientY, wantStructure);
      if (targetId === null)
        return this.toast(wantStructure ? 'Tap a Black Bastion or Throne' : 'Tap a Black piece');
      r = this.issue({ type: 'playGambit', slot: aim.slot, targetId });
    }
    if (r?.ok) this.setUi({ aim: null });
  }

  /** The enemy unit under a tap; falls back to the nearest valid one around the tapped ground. */
  private pickEnemy(clientX: number, clientY: number, structure: boolean): number | null {
    const m = this.match!;
    const view = this.view!;
    const good = (id: number | null): boolean => {
      const u = id === null ? undefined : m.unitById(id);
      if (!u || !u.alive || u.team !== 'B') return false;
      return structure ? isMap(u.kind) : !!u.hero;
    };
    const direct = view.pickUnit(clientX, clientY);
    if (good(direct)) return direct;
    const g = view.pickGround(clientX, clientY);
    if (!g) return null;
    let best: number | null = null;
    let bestD = NEAR_PICK;
    for (const u of m.state.units) {
      if (!u.alive || !good(u.id)) continue;
      const d = Math.hypot(u.x - g.x, u.y - g.y);
      if (d < bestD) {
        bestD = d;
        best = u.id;
      }
    }
    return best;
  }

  chooseFork(heroId: number, optionId: string): void {
    this.issue({ type: 'chooseFork', heroId, optionId });
  }

  // ------------------------------------------------------------ events -> chips

  private chip(c: Omit<Chip, 'id' | 'until'>, ms: number): Chip {
    return { ...c, id: ++this.chipId, until: performance.now() + ms };
  }

  /** Turns new sim events into banners and chips, and drops the expired ones. */
  syncEvents(): void {
    const m = this.match;
    if (!m) return;
    const ev = m.events;
    if (ev.length === 0 || ev[ev.length - 1].seq < this.seenSeq) this.seenSeq = -1;
    const fresh: Chip[] = [];
    for (let i = ev.length - 1; i >= 0 && ev[i].seq > this.seenSeq; i--) {
      const e = ev[i];
      if (e.type === 'phaseStart' && e.payload.kind === 'live') {
        fresh.unshift(
          this.chip(
            { kind: 'act', title: `Act ${e.payload.phase}`, detail: '', team: null },
            BANNER_MS,
          ),
        );
      } else if (e.type === 'check') {
        fresh.unshift(
          this.chip(
            {
              kind: 'check',
              title: `${courtName(e.payload.team)} in Check`,
              detail: 'Until the King returns',
              team: e.payload.team,
            },
            BANNER_MS + 800,
          ),
        );
      } else if (e.type === 'throneDown') {
        fresh.unshift(
          this.chip(
            {
              kind: 'throne',
              title: `${courtName(e.payload.team)} Throne has fallen`,
              detail: 'Its King can no longer return',
              team: e.payload.team,
            },
            BANNER_MS + 1200,
          ),
        );
      } else if (e.type === 'rankUp' || e.type === 'fork') {
        const u = m.unitById(e.payload.id);
        if (!u || u.team !== 'A' || !u.hero) continue;
        const piece = pieceLabel(this.content, u.hero.defId);
        if (e.type === 'rankUp') {
          if (e.payload.rank === 4 || e.payload.rank === 8) continue;
          fresh.unshift(
            this.chip(
              {
                kind: 'rank',
                title: `${piece} · Rank ${e.payload.rank}`,
                detail: e.payload.bonus,
                team: 'A',
              },
              RANK_CHIP_MS,
            ),
          );
        } else {
          const st = this.content.styleByKey.get(`${u.hero.defId}/${u.hero.style}`);
          const forks = st?.forks[String(e.payload.rank) as '4' | '8'] ?? [];
          const name = forks.find((f) => f.id === e.payload.optionId)?.name ?? '';
          fresh.unshift(
            this.chip(
              {
                kind: 'rank',
                title: `${piece} · Rank ${e.payload.rank}`,
                detail: name + (e.payload.auto ? ' (court’s pick)' : ''),
                team: 'A',
              },
              RANK_CHIP_MS,
            ),
          );
        }
      }
    }
    if (ev.length) this.seenSeq = ev[ev.length - 1].seq;
    const now = performance.now();
    const alive = this.ui.chips.filter((c) => c.until > now);
    // the same notice twice (two Checks in a row) shows once, with a fresh timer
    const latest = fresh.filter((c, i) => !fresh.some((d, j) => j > i && same(c, d)));
    const next = latest.length
      ? [...alive.filter((c) => !latest.some((d) => same(c, d))), ...latest]
      : alive;
    const keep = new Set([
      ...next.filter((c) => c.kind === 'rank').slice(-MAX_RANK_CHIPS),
      ...next.filter((c) => c.kind !== 'rank').slice(-MAX_BANNERS),
    ]);
    const trimmed = next.filter((c) => keep.has(c));
    if (latest.length > 0 || trimmed.length !== this.ui.chips.length) {
      this.ui = { ...this.ui, chips: trimmed };
      this.notify();
    }
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
