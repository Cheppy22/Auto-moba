import { useEffect, useRef, useState } from 'preact/hooks';
import type { Snapshot } from '../../sim';
import { courtName } from '../../analysis/text';
import { Terms } from '../glossary';
import { pieceLabel } from '../pieces';
import { useSession } from '../session';
import { captureLine, firstSentence, type NudgeId } from '../tutorial';

/** How long a live nudge stays up before it fades by itself. */
const SHOW_MS: Record<'tempo' | 'eye' | 'capture', number> = {
  tempo: 15000,
  eye: 13000,
  capture: 12000,
};

interface Live {
  id: 'tempo' | 'eye' | 'capture';
  /** Built when the nudge comes up (a capture's respawn time is read then). */
  text: () => string;
  /** Eye nudge: the unit to ring on the board. */
  unit?: number;
  /** True when the moment has passed (the captured piece is already back): drop it. */
  stale?: () => boolean;
  until: number;
  shown: string;
}

const KILLER_NAME: Record<string, string> = {
  minion: 'pawn',
  tower: 'Bastion',
  guardian: 'guardian',
  camp: 'camp creature',
  obelisk: 'obelisk',
};

/** The buttons every nudge shares: dismiss this one, or switch the tutorial off. */
function Actions(props: { onOk: () => void; onClose: () => void; ok?: string }) {
  const s = useSession();
  return (
    <div class="tutor-actions">
      <button class="btn small primary" data-testid="tutor-ok" onClick={props.onOk}>
        {props.ok ?? 'Got it'}
      </button>
      <button
        class="tutor-skip"
        data-testid="tutor-skip"
        onClick={() => {
          s.tutor.skipAll();
          props.onClose();
        }}
      >
        Skip tutorial
      </button>
    </div>
  );
}

/** A ring on the board around the piece the eye nudge is about; it follows the camera. */
function EyeRing(props: { unit: number }) {
  const s = useSession();
  const el = useRef<HTMLDivElement>(null);
  useEffect(
    () =>
      s.onFrame(() => {
        const node = el.current;
        const u = s.match?.unitById(props.unit);
        const view = s.view;
        if (!node || !u || !view) return;
        const p = view.project(u.x, u.y, 18);
        node.style.transform = `translate(${p.x.toFixed(1)}px, ${p.y.toFixed(1)}px)`;
        node.style.opacity = p.visible ? '1' : '0';
      }),
    [s, props.unit],
  );
  return <div class="tutor-ring" ref={el} data-testid="tutor-ring" aria-hidden="true" />;
}

/**
 * The first-match nudges that float over the board: Tempo full, the first high-ground eye badge
 * and the first capture. One at a time, never over a sheet, never pausing anything; each shows
 * once (see `Tutorial`). The fork and the Act break teach inside their own sheets.
 */
export function Tutor(props: {
  snap: Snapshot;
  held: boolean;
  stopped: boolean;
  drawerOpen: boolean;
}) {
  const s = useSession();
  const t = s.tutor;
  const { snap } = props;
  const [, wake] = useState(0);
  const m = s.match!;
  const st = useRef<{
    cur: Live | null;
    queue: Live[];
    seq: number;
    queued: Set<NudgeId>;
    last: number;
  }>({
    cur: null,
    last: performance.now(),
    queue: [],
    seq: m.events.length ? m.events[m.events.length - 1].seq : -1,
    queued: new Set(),
  });
  const x = st.current;
  const now = performance.now();
  // a paused game does not run the nudge's clock: a player who pauses to read keeps it
  if (x.cur && s.ui.speed === 0) x.cur.until += now - x.last;
  x.last = now;
  const calm =
    !props.held &&
    !props.stopped &&
    !s.ui.adjourned &&
    !s.ui.intro &&
    s.ui.aim === null &&
    s.ui.card === null &&
    s.ui.info === null &&
    snap.phase.kind === 'live';
  const enqueue = (live: Omit<Live, 'until' | 'shown'>): void => {
    if (!t.canShow(live.id) || x.queued.has(live.id)) return;
    x.queued.add(live.id);
    x.queue.push({ ...live, until: 0, shown: '' });
  };
  if (t.active) {
    // Tempo is full for the first time: point at the hand and explain one card
    if (calm && snap.tempo.A >= snap.tempoMax) {
      const card = snap.hand.find((c) => c.cardId !== '');
      enqueue({
        id: 'tempo',
        text: () =>
          `Tempo is full, and unspent Tempo is wasted. Tap Gambits to open your hand.${
            card ? ` For example, ${card.name}: ${firstSentence(card.desc)}` : ''
          }`,
      });
    }
    // the first piece to stand on high ground shows the eye badge
    if (calm && t.canShow('eye') && !x.queued.has('eye')) {
      const u = snap.units.find((v) => v.alive && v.highGround && v.piece);
      if (u)
        enqueue({
          id: 'eye',
          unit: u.id,
          text: () =>
            `Look at the ${pieceLabel(s.content, u.piece!)}: the eye over its health bar means it holds the high ground. It is hitting a target on lower ground, so it hits 20% harder.`,
        });
    }
    // the first capture of a piece: who took whom, and why it matters
    const ev = m.events;
    if (ev.length === 0 || ev[ev.length - 1].seq < x.seq) x.seq = -1;
    for (let i = ev.length - 1; i >= 0 && ev[i].seq > x.seq; i--) {
      const e = ev[i];
      if (e.type !== 'death' || e.payload.kind !== 'hero') continue;
      const victim = m.unitById(e.payload.id);
      if (!victim?.hero) continue;
      const killer = m.unitById(e.payload.killer);
      const taker = e.payload.team === 'A' ? 'B' : 'A';
      enqueue({
        id: 'capture',
        stale: () => victim.alive,
        text: () => {
          const h = victim.hero!;
          const left =
            h.respawnAt === null
              ? null
              : Math.max(0, h.respawnAt - m.state.tick) / s.content.tuning.tickRate;
          return captureLine({
            taker,
            takerName: killer?.hero
              ? pieceLabel(s.content, killer.hero.defId)
              : (KILLER_NAME[e.payload.killerKind] ?? 'piece'),
            victimName: pieceLabel(s.content, h.defId),
            backIn: left,
            courtB: courtName('B'),
            tempo: s.content.tuning.gambits.tempoPieceKill,
          });
        },
      });
    }
    if (ev.length) x.seq = ev[ev.length - 1].seq;
  }
  // end the one on screen, or bring up the next
  if (x.cur && (now >= x.cur.until || props.held || props.stopped)) x.cur = null;
  if (x.cur?.id === 'tempo' && props.drawerOpen) x.cur = null;
  if (!x.cur && calm && t.active) {
    let next = x.queue.shift();
    while (next?.stale?.()) {
      x.queued.delete(next.id);
      next = x.queue.shift();
    }
    if (next && t.canShow(next.id)) {
      t.seen(next.id);
      x.cur = { ...next, until: now + SHOW_MS[next.id], shown: next.text() };
    }
  }
  const cur = x.cur;
  const until = cur?.until ?? 0;
  useEffect(() => {
    if (!until) return undefined;
    const id = window.setTimeout(
      () => wake((v) => v + 1),
      Math.max(0, until - performance.now()) + 30,
    );
    return () => window.clearTimeout(id);
  }, [until]);
  if (!cur) return null;
  const done = (): void => {
    x.cur = null;
    wake((v) => v + 1);
  };
  return (
    <>
      {cur.id === 'eye' && cur.unit !== undefined && <EyeRing unit={cur.unit} />}
      <div class="tutor" data-testid="tutor" data-tutor={cur.id} role="status" key={cur.id}>
        <p class="tutor-text" data-testid="tutor-text">
          <Terms text={cur.shown} max={2} />
        </p>
        <Actions onOk={done} onClose={done} />
      </div>
    </>
  );
}

/**
 * A nudge inside a sheet (the fork or the Act break): shown only if this is the first time, and
 * kept for as long as the sheet is open, so a reader is never rushed.
 */
export function useFirstTime(id: NudgeId): [boolean, () => void] {
  const s = useSession();
  const [on, setOn] = useState(() => s.tutor.canShow(id));
  useEffect(() => {
    if (on) s.tutor.seen(id);
  }, [s, id, on]);
  return [on, () => setOn(false)];
}

/** The fork's explanation: what the choice is, in two sentences. */
export function ForkTutor() {
  const [on, hide] = useFirstTime('fork');
  if (!on) return null;
  return (
    <div class="tutor-inline" data-testid="tutor-fork">
      <p class="tutor-text">
        <Terms
          text="This piece reached Rank 4, so it picks an archetype: a fighting style it keeps for the rest of the match. Tap each one to see its new look and numbers, then Choose, or let the AI choose. The game stays paused until you do."
          max={2}
        />
      </p>
      <Actions onOk={hide} onClose={hide} />
    </div>
  );
}

const TOUR: { tab: 'report' | 'orders' | 'builds' | 'relics'; text: string }[] = [
  {
    tab: 'report',
    text: 'Report: who held each lane, the big fights and how your pieces fell. Read it to see what to fix.',
  },
  {
    tab: 'orders',
    text: 'Orders: set each piece’s lane, and how many pawns to field per lane, for the next Act.',
  },
  {
    tab: 'builds',
    text: 'Builds: each piece is offered three Techniques; it takes one, and its gold buys rerolls and upgrades.',
  },
  {
    tab: 'relics',
    text: 'Relics: take one at every break; it changes your court for the rest of the match. You need one to resume.',
  },
];

/** The first Act break: a walk through its four tabs, one line each. */
export function BreakTour() {
  const s = useSession();
  const [on, hide] = useFirstTime('break');
  const [step, setStep] = useState(0);
  if (!on) return null;
  const at = TOUR[step];
  const last = step === TOUR.length - 1;
  return (
    <div class="tutor-inline tour" data-testid="tutor-break" data-step={at.tab}>
      <p class="tutor-text">
        <Terms text={at.text} max={1} />
      </p>
      <Actions
        ok={last ? 'Done' : 'Next'}
        onClose={hide}
        onOk={() => {
          if (last) return hide();
          const next = TOUR[step + 1];
          setStep(step + 1);
          s.setBreakTab(next.tab);
        }}
      />
    </div>
  );
}
