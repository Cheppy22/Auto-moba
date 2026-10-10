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
import { cardLine, decisive, fallToast, fightLine, fightVerdict } from '../analysis/feedback';
import { mmss } from './format';
import { cap, pieceLabel } from './pieces';

export type Speed = 0 | 1 | 2 | 4 | 8;

/** What the next tap on the HUD or the 3D view will do. */
export type Aim = { kind: 'gambit'; slot: number; cardId: string } | { kind: 'pawn' };

/** A short-lived banner (Act, Check, Throne) or rank-up chip. */
export interface Chip {
  id: number;
  kind: 'rank' | 'act' | 'check' | 'throne' | 'bell' | 'relic';
  title: string;
  detail: string;
  team: PlayTeam | null;
  /** Wall-clock ms when the chip leaves. */
  until: number;
  /** How long it lives, for its fade-out. */
  ms: number;
}

/** A calm one-liner from the combat feedback: a fight verdict, why a piece fell, or what a gambit did. */
export interface Note {
  id: number;
  kind: 'fight' | 'fall' | 'card';
  text: string;
  tone: 'good' | 'bad' | 'even' | 'plain';
  /** Fight verdicts: the fight's place in map units; the tag sits there in the 3D view. */
  at: { x: number; y: number } | null;
  until: number;
  ms: number;
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
  /** Fight verdicts, falls and gambit lines share one lane: at most two show, the newest wins. */
  notes: Note[];
  reportHero: number | null;
  /** The piece whose card is open (any team). */
  card: number | null;
  /** The gambit sheet (long-press on a card): the hand slot shown enlarged. The game is paused while it is open. */
  info: { slot: number; cardId: string } | null;
  /** The tab open on the Act break sheet. */
  breakTab: 'report' | 'orders' | 'relics';
  /** When (ms) a countdown alert last flashed the Act clock; 0 before the first. */
  clockFlash: number;
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
  notes: [],
  reportHero: null,
  card: null,
  info: null,
  breakTab: 'report',
  clockFlash: 0,
});

/** The 3D view's picking calls, set by the game view while it exists. */
export interface PickView {
  pickGround(clientX: number, clientY: number): { x: number; y: number } | null;
  pickUnit(clientX: number, clientY: number): number | null;
  /** Where a map point lands on the canvas (CSS pixels from its top-left). */
  project(x: number, y: number, lift?: number): { x: number; y: number; visible: boolean };
}

const RANK_CHIP_MS = 3200;
const BANNER_MS = 2400;
const BELL_CHIP_MS = 2200;
const MAX_RANK_CHIPS = 1;
const MAX_BANNERS = 2;
const MAX_NOTES = 2;
const FIGHT_NOTE_MS = 4200;
const NOTE_MS = 3200;
/** The run speeds the chip cycles through; 0 is paused. */
const SPEEDS: Speed[] = [1, 2, 4, 8, 0];
const CAMS: CamMode[] = ['auto', 'follow', 'free'];
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
  /** The sim's step-rate multiplier this frame (1, easing to 0 across the bell's halt). */
  timeScale = 1;
  private lastLeft: number | null = null;
  private chipId = 0;
  private noteId = 0;
  private seenSeq = -1;
  private toastTimer = 0;
  /** Camera mode and target to restore when the fork sheet closes. */
  private forkCam: { cam: CamMode; follow: number | null } | null = null;
  /** When the gambit sheet opened (ms), so the lifting finger cannot close it at once. */
  infoAt = 0;
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
  toast(message: string, ms = 2600): void {
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
    // the browser game stops for White's forks and for the Act break sheet
    this.match = Match.create(this.content, {
      seed,
      pauseForForks: true,
      pauseForBreak: true,
      ...config,
    });
    this.seenSeq = -1;
    this.lastLeft = null;
    this.forkCam = null;
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
    this.forkCam = null;
    this.ui = freshUi();
    this.notify();
  }

  adjourn(): void {
    if (this.match?.state.phase.kind !== 'live' || this.match.state.bell.stage === 'break') return;
    this.setUi({ adjourned: true, aim: null, card: null, info: null });
  }

  /** The speed chip: 1x, 2x, 4x, 8x, then paused, then 1x again. */
  cycleSpeed(): void {
    const i = SPEEDS.indexOf(this.ui.speed);
    this.setUi({ speed: SPEEDS[(i + 1) % SPEEDS.length] });
  }

  /** The camera button: Auto, Follow (the followed piece, or the King), Free. */
  cycleCam(): void {
    const i = CAMS.indexOf(this.ui.cam);
    const cam = CAMS[(i + 1) % CAMS.length];
    this.setUi({ cam, follow: cam === 'follow' ? this.ui.follow : null });
  }

  /** Opens the piece card (any team); a second call for the same piece closes it. */
  openCard(id: number | null): void {
    this.setUi({ card: id === this.ui.card ? null : id, info: null });
  }

  closeCard(): void {
    if (this.ui.card !== null) this.setUi({ card: null });
  }

  /**
   * Opens a gambit card enlarged (long-press or right-click). The loop holds the sim while
   * `ui.info` is set; the speed is untouched, so closing the sheet resumes at the old speed.
   */
  showInfo(slot: number): void {
    const m = this.match;
    if (
      !m ||
      m.state.phase.kind !== 'live' ||
      this.ui.adjourned ||
      m.state.forks.length > 0 ||
      m.state.bell.stage === 'break'
    )
      return;
    const card = m.snapshot().hand[slot];
    if (!card || card.cardId === '') return;
    this.infoAt = performance.now();
    this.setUi({ info: { slot, cardId: card.cardId }, card: null, aim: null });
  }

  closeInfo(): void {
    if (this.ui.info) this.setUi({ info: null });
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
    if (snap.act.bell === 'halt' || snap.act.bell === 'break')
      return this.toast('Play is stopped for the bell');
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
    } else if (card.target === 'ally') {
      const targetId = this.pickAlly(clientX, clientY);
      if (targetId === null) return this.toast('Tap one of your pieces');
      r = this.issue({ type: 'playGambit', slot: aim.slot, targetId });
    } else if (card.target === 'enemy') {
      const wantStructure = card.cardId === 'siege';
      const targetId = this.pickEnemy(clientX, clientY, wantStructure);
      if (targetId === null)
        return this.toast(wantStructure ? 'Tap a Black Bastion or Throne' : 'Tap a Black piece');
      r = this.issue({ type: 'playGambit', slot: aim.slot, targetId });
    }
    if (r?.ok) this.setUi({ aim: null });
  }

  /** A White portrait tapped while an ally card is being aimed: plays the card on that piece. */
  aimUnit(id: number): boolean {
    const aim = this.ui.aim;
    const m = this.match;
    if (!aim || aim.kind !== 'gambit' || !m) return false;
    const card = m.snapshot().hand[aim.slot];
    if (!card || card.cardId !== aim.cardId || card.target !== 'ally') return false;
    const r = this.issue({ type: 'playGambit', slot: aim.slot, targetId: id });
    if (r.ok) this.setUi({ aim: null });
    return true;
  }

  /** True while an ally card (Exchange) waits for one of White's pieces to be tapped. */
  aimingAlly(): boolean {
    const aim = this.ui.aim;
    if (!aim || aim.kind !== 'gambit' || !this.match) return false;
    return this.match.snapshot().hand[aim.slot]?.target === 'ally';
  }

  /** One of White's pieces under a tap, or the nearest one around the tapped ground. */
  private pickAlly(clientX: number, clientY: number): number | null {
    const m = this.match!;
    const view = this.view!;
    const good = (id: number | null): boolean => {
      const u = id === null ? undefined : m.unitById(id);
      return !!u && u.alive && u.team === 'A' && !!u.hero;
    };
    const direct = view.pickUnit(clientX, clientY);
    if (good(direct)) return direct;
    const g = view.pickGround(clientX, clientY);
    if (!g) return null;
    let best: number | null = null;
    let bestD = NEAR_PICK;
    for (const u of m.state.units) {
      if (!good(u.id)) continue;
      const d = Math.hypot(u.x - g.x, u.y - g.y);
      if (d < bestD) {
        bestD = d;
        best = u.id;
      }
    }
    return best;
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

  /** "Let the AI choose": the AI answers every waiting fork. */
  autoForks(): void {
    this.issue({ type: 'autoForks' });
  }

  /**
   * While a fork waits the camera frames the piece that is choosing; the old camera comes back
   * when the last fork is answered. Called every frame.
   */
  syncForks(): void {
    const m = this.match;
    if (!m) return;
    const head = m.state.forks.length > 0 ? m.state.forks[0].heroId : null;
    if (head !== null) {
      if (!this.forkCam) {
        this.forkCam = { cam: this.ui.cam, follow: this.ui.follow };
        this.setUi({ cam: 'follow', follow: head, aim: null, card: null, info: null });
      } else if (this.ui.cam !== 'follow' || this.ui.follow !== head) {
        this.setUi({ cam: 'follow', follow: head });
      }
    } else if (this.forkCam) {
      const back = this.forkCam;
      this.forkCam = null;
      this.setUi({ cam: back.cam, follow: back.follow });
    }
  }

  /** Leaves the Act break sheet: the next Act begins. */
  resumeAct(): void {
    if (this.issue({ type: 'resumeAct' }).ok) this.setUi({ breakTab: 'report' });
  }

  setBreakTab(tab: UiState['breakTab']): void {
    this.setUi({ breakTab: tab });
  }

  /** Flashes the Act clock and drops a small notice as the clock passes each alert time. */
  syncBell(): void {
    const m = this.match;
    if (!m) return;
    const st = m.state;
    if (st.phase.kind !== 'live' || st.bell.stage !== 'none') {
      this.lastLeft = null;
      return;
    }
    const t = this.content.tuning;
    const left = t.phaseSeconds - (st.tick - st.phase.startTick) / t.tickRate;
    const prev = this.lastLeft;
    this.lastLeft = left;
    if (prev === null || left >= prev) return;
    const hit = t.bell.alertsSec.find((a) => prev > a && left <= a);
    if (hit === undefined) return;
    const chip = this.chip(
      { kind: 'bell', title: `${mmss(hit * t.tickRate)} to the bell`, detail: '', team: null },
      BELL_CHIP_MS,
    );
    this.ui = {
      ...this.ui,
      clockFlash: performance.now(),
      chips: [...this.ui.chips.filter((c) => c.kind !== 'bell'), chip],
    };
    this.notify();
  }

  // ------------------------------------------------------------ events -> chips

  private chip(c: Omit<Chip, 'id' | 'until' | 'ms'>, ms: number): Chip {
    return { ...c, id: ++this.chipId, until: performance.now() + ms, ms };
  }

  /** Turns new sim events into banners and chips, and drops the expired ones. */
  syncEvents(): void {
    const m = this.match;
    if (!m) return;
    const ev = m.events;
    if (ev.length === 0 || ev[ev.length - 1].seq < this.seenSeq) this.seenSeq = -1;
    const fresh: Chip[] = [];
    const notes: Note[] = [];
    const quiet = m.state.bell.stage === 'halt' || m.state.bell.stage === 'break';
    const note = (n: Omit<Note, 'id' | 'until' | 'ms'>, ms: number): void => {
      if (!quiet) notes.unshift({ ...n, id: ++this.noteId, until: performance.now() + ms, ms });
    };
    for (let i = ev.length - 1; i >= 0 && ev[i].seq > this.seenSeq; i--) {
      const e = ev[i];
      if (e.type === 'phaseStart' && e.payload.kind === 'live') {
        fresh.unshift(
          this.chip(
            { kind: 'act', title: `Act ${e.payload.phase}`, detail: '', team: null },
            BANNER_MS,
          ),
        );
        const theirs = m.state.relics.latest.B;
        const name = theirs ? this.content.relicById.get(theirs)?.name : undefined;
        if (e.payload.phase > 1 && name)
          fresh.push(
            this.chip(
              {
                kind: 'relic',
                title: `Black took ${name}`,
                detail: 'Tap the seal under their pieces',
                team: 'B',
              },
              BANNER_MS + 600,
            ),
          );
      } else if (e.type === 'fightEnd') {
        if (!decisive(e.payload)) continue;
        const v = fightVerdict(e.payload).verdict;
        note(
          {
            kind: 'fight',
            text: fightLine(e.payload),
            tone: v === 'won' ? 'good' : v === 'lost' ? 'bad' : 'even',
            at: { x: e.payload.x, y: e.payload.y },
          },
          FIGHT_NOTE_MS,
        );
      } else if (e.type === 'death') {
        const piece = m.unitById(e.payload.id)?.hero?.defId;
        if (e.payload.team !== 'A' || !e.payload.fall || !piece) continue;
        note(
          { kind: 'fall', text: fallToast(piece, e.payload.fall), tone: 'plain', at: null },
          NOTE_MS,
        );
      } else if (e.type === 'gambitEnd') {
        const name = this.content.gambitById.get(e.payload.cardId)?.name;
        if (e.payload.team !== 'A' || !name) continue;
        note(
          {
            kind: 'card',
            text: cardLine(name, e.payload, this.content.tuning.tickRate),
            tone: 'plain',
            at: null,
          },
          NOTE_MS,
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
            BANNER_MS + 500,
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
            BANNER_MS + 700,
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
          const name = forkOptionName(
            this.content,
            u.hero.defId,
            u.hero.style,
            e.payload.rank,
            e.payload.optionId,
          );
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
      ...next.filter((c) => c.kind !== 'rank' && c.kind !== 'bell').slice(-MAX_BANNERS),
      ...next.filter((c) => c.kind === 'bell').slice(-1),
    ]);
    const trimmed = next.filter((c) => keep.has(c));
    const heldNotes = this.ui.notes.filter((n) => n.until > now);
    const nextNotes = notes.length > 0 ? [...heldNotes, ...notes].slice(-MAX_NOTES) : heldNotes;
    const notesChanged = notes.length > 0 || nextNotes.length !== this.ui.notes.length;
    if (latest.length > 0 || trimmed.length !== this.ui.chips.length || notesChanged) {
      this.ui = { ...this.ui, chips: trimmed, notes: nextNotes };
      this.notify();
    }
  }
}

/** The name of a fork option taken: a style at Rank 4, a skill path of the chosen style at Rank 8. */
export function forkOptionName(
  c: Content,
  piece: string,
  style: string | null,
  rank: number,
  optionId: string,
): string {
  if (rank === 4) return c.styleByKey.get(`${piece}/${optionId}`)?.name ?? '';
  const st = style ? c.styleByKey.get(`${piece}/${style}`) : undefined;
  return st?.forks['8'].find((f) => f.id === optionId)?.name ?? '';
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
