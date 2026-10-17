import { createPortal } from 'preact/compat';
import { useLayoutEffect, useRef, useState } from 'preact/hooks';
import type {
  HeldRelic,
  PawnQuota,
  PieceId,
  LaneId,
  RelicAim,
  RelicDef,
  RelicFamily,
  RelicOffer,
  SealedTrigger,
  Snapshot,
} from '../../sim';
import { SEALED_TRIGGERS } from '../../sim';
import { Term, Terms } from '../glossary';
import { whitePieces } from '../Orders';
import { LANES, LANE_LABEL, LANE_TAG, PieceGlyph, pieceLabel } from '../pieces';
import { RelicEmblem } from '../relicArt';
import { relicHeadline, relicPlan, type PlanInput, type RelicPlan } from '../relicPlan';
import {
  FAMILY_COLOR,
  FamilyChip,
  RelicSeal,
  TRIGGER_LABEL,
  aimText,
  bindsLane,
  relicText,
} from '../relics';
import { SCHOOL_NAME } from '../schools';
import { useSession } from '../session';

type AimPatch = Partial<RelicAim>;

/** Left / Mid / Right chips for a lane-bound relic. */
export function LaneChips(props: {
  value: LaneId | null;
  onChange: (lane: LaneId) => void;
  testid: string;
  label: string;
}) {
  return (
    <div class="rl-aim" role="radiogroup" aria-label={props.label}>
      <span class="rl-aim-label">Lane</span>
      {LANES.map((lane) => (
        <button
          key={lane}
          class={`rl-chip ${props.value === lane ? 'on' : ''}`}
          role="radio"
          aria-checked={props.value === lane}
          aria-label={`${LANE_LABEL[lane]} lane`}
          data-testid={`${props.testid}-${lane}`}
          onClick={() => props.onChange(lane)}
        >
          {LANE_TAG[lane]}
        </button>
      ))}
    </div>
  );
}

/**
 * One chip per White piece for a piece-bound relic. In a match a piece is its unit id; in the Run
 * kit (between matches) it is the piece type.
 */
export function PieceChips<T extends number | string>(props: {
  options: { id: T; piece: PieceId }[];
  value: T | null;
  onChange: (piece: T) => void;
  testid: string;
  label: string;
}) {
  const s = useSession();
  return (
    <div class="rl-aim" role="radiogroup" aria-label={props.label}>
      <span class="rl-aim-label">Piece</span>
      {props.options.map(({ id, piece }) => (
        <button
          key={id}
          class={`rl-chip piece ${props.value === id ? 'on' : ''}`}
          role="radio"
          aria-checked={props.value === id}
          aria-label={pieceLabel(s.content, piece)}
          title={pieceLabel(s.content, piece)}
          data-testid={`${props.testid}-${piece}`}
          onClick={() => props.onChange(id)}
        >
          <PieceGlyph piece={piece} team="A" size={22} />
        </button>
      ))}
    </div>
  );
}

export function CardChips(props: {
  def: RelicDef;
  value: string | null;
  onChange: (card: string) => void;
  testid: string;
}) {
  const s = useSession();
  return (
    <div class="rl-aim" role="radiogroup" aria-label="Lane card">
      <span class="rl-aim-label">Card</span>
      {props.def.cards.map((id) => (
        <button
          key={id}
          class={`rl-chip wide ${props.value === id ? 'on' : ''}`}
          role="radio"
          aria-checked={props.value === id}
          data-testid={`${props.testid}-${id}`}
          onClick={() => props.onChange(id)}
        >
          {s.content.gambitById.get(id)?.name ?? id}
        </button>
      ))}
    </div>
  );
}

/** Sealed Move: a card from the Opening's schools and a trigger, as two compact pickers. */
export function SealedControls(props: {
  aim: { card: string | null; trigger: SealedTrigger | null };
  guardedOk: boolean;
  /** The Opening the cards come from (a match's, or the run court's). */
  opening: string;
  /** A card's Tempo cost with the relic's discount; absent between matches. */
  costOf?: (cardId: string, discount: number) => number;
  onChange: (patch: { card?: string; trigger?: SealedTrigger }) => void;
  testid: string;
}) {
  const s = useSession();
  const schools = s.content.openingById.get(props.opening)?.schools ?? [];
  const cards = s.content.gambits.filter(
    (g) => g.weight > 0 && (schools.length === 0 || schools.includes(g.school)),
  );
  const groups = [...new Set(cards.map((g) => g.school))];
  const discount = s.content.relicById.get('sealed_move')?.params.discount ?? 10;
  return (
    <div class="rl-sealed">
      <label class="rl-pick">
        <span class="rl-aim-label">Card</span>
        <select
          value={props.aim.card ?? ''}
          data-testid={`${props.testid}-card`}
          aria-label="Sealed card"
          onChange={(e) => props.onChange({ card: e.currentTarget.value })}
        >
          {groups.map((school) => (
            <optgroup key={school} label={SCHOOL_NAME[school]}>
              {cards
                .filter((g) => g.school === school)
                .map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                    {props.costOf ? ` (${props.costOf(g.id, discount)} Tempo)` : ''}
                  </option>
                ))}
            </optgroup>
          ))}
        </select>
      </label>
      <label class="rl-pick">
        <span class="rl-aim-label">When</span>
        <select
          value={props.aim.trigger ?? ''}
          data-testid={`${props.testid}-trigger`}
          aria-label="Sealed trigger"
          onChange={(e) => props.onChange({ trigger: e.currentTarget.value as SealedTrigger })}
        >
          {SEALED_TRIGGERS.map((t) => (
            <option key={t} value={t} disabled={t === 'guarded' && !props.guardedOk}>
              {TRIGGER_LABEL[t]}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}

/** Pawn Structure: a stepper per lane (at most the pawn cap in all) and three Tempo reserves. */
export function QuotaControls(props: {
  aim: { quota: PawnQuota | null; reserve: number | null };
  cap: number;
  reserves: number[];
  onChange: (patch: { quota?: PawnQuota; reserve?: number }) => void;
  testid: string;
}) {
  const quota = props.aim.quota ?? { top: 0, mid: 0, bot: 0 };
  const total = LANES.reduce((n, l) => n + quota[l], 0);
  const set = (lane: LaneId, delta: number): void => {
    const value = quota[lane] + delta;
    if (value < 0 || total + delta > props.cap) return;
    props.onChange({ quota: { ...quota, [lane]: value } });
  };
  return (
    <div class="rl-quota">
      <div class="rl-steppers" role="group" aria-label="Pawns to keep in each lane">
        {LANES.map((lane) => (
          <div class="rl-stepper" key={lane}>
            <span class="rl-aim-label">{LANE_LABEL[lane]}</span>
            <button
              class="rl-step"
              aria-label={`Fewer pawns in the ${LANE_LABEL[lane]} lane`}
              data-testid={`${props.testid}-${lane}-minus`}
              disabled={quota[lane] <= 0}
              onClick={() => set(lane, -1)}
            >
              −
            </button>
            <b data-testid={`${props.testid}-${lane}`}>{quota[lane]}</b>
            <button
              class="rl-step"
              aria-label={`More pawns in the ${LANE_LABEL[lane]} lane`}
              data-testid={`${props.testid}-${lane}-plus`}
              disabled={total >= props.cap}
              onClick={() => set(lane, 1)}
            >
              +
            </button>
          </div>
        ))}
        <span class="rl-total" data-testid={`${props.testid}-total`}>
          {total}/{props.cap}
        </span>
      </div>
      <div class="rl-aim" role="radiogroup" aria-label="Tempo reserve">
        <span class="rl-aim-label">Reserve</span>
        {props.reserves.map((r) => (
          <button
            key={r}
            class={`rl-chip ${props.aim.reserve === r ? 'on' : ''}`}
            role="radio"
            aria-checked={props.aim.reserve === r}
            data-testid={`${props.testid}-reserve-${r}`}
            onClick={() => props.onChange({ reserve: r })}
          >
            {r}
          </button>
        ))}
      </div>
    </div>
  );
}

/** The controls a relic takes: a lane, a piece, a lane and a card, a card and a trigger, or quotas. */
function AimControl(props: {
  def: RelicDef;
  aim: RelicAim;
  snap: Snapshot;
  onChange: (patch: AimPatch) => void;
  testid: string;
}) {
  const s = useSession();
  const { def, aim } = props;
  const guardedOk = props.snap.relics.held.A.some(
    (h) => (h.id === 'crown_jewel' || h.id === 'guarded_piece') && h.piece !== null,
  );
  return (
    <>
      {def.bind === 'sealed' && (
        <SealedControls
          aim={aim}
          guardedOk={guardedOk}
          opening={s.match!.state.opening.A}
          costOf={(id, discount) => s.match!.cardCost(id, discount)}
          onChange={props.onChange}
          testid={`${props.testid}-sealed`}
        />
      )}
      {def.bind === 'quota' && (
        <QuotaControls
          aim={aim}
          cap={props.snap.relics.pawnCap}
          reserves={s.content.tuning.relics.reserves}
          onChange={props.onChange}
          testid={`${props.testid}-quota`}
        />
      )}
      {def.bind === 'laneCard' && (
        <CardChips
          def={def}
          value={aim.card}
          onChange={(card) => props.onChange({ card })}
          testid={`${props.testid}-card`}
        />
      )}
      {bindsLane(def) && (
        <LaneChips
          value={aim.lane}
          onChange={(lane) => props.onChange({ lane })}
          testid={`${props.testid}-lane`}
          label={`${def.name} lane`}
        />
      )}
      {def.id === 'battery' && (
        <p class="rl-note">Taking or aiming it moves your pieces to 3/1/1. Fine-tune in Orders.</p>
      )}
      {def.bind === 'piece' && (
        <PieceChips
          options={whitePieces(s).map((u) => ({ id: u.id, piece: u.hero!.defId }))}
          value={aim.piece}
          onChange={(piece) => props.onChange({ piece })}
          testid={`${props.testid}-piece`}
          label={`${def.name} piece`}
        />
      )}
    </>
  );
}

/** What the relic plan reads from the match: White's pieces, Tempo, pawns and cards. */
function planInput(s: ReturnType<typeof useSession>, snap: Snapshot): PlanInput {
  const m = s.match!;
  return {
    content: s.content,
    pieces: whitePieces(s).map((u) => ({
      id: u.id,
      piece: u.hero!.defId,
      lane: u.hero!.lane,
      stats: u.stats,
    })),
    nextAct: snap.phase.n + 1,
    tempo: snap.tempo.A,
    tempoMax: snap.tempoMax,
    pawnCap: snap.relics.pawnCap,
    pawnCost: snap.pawns.A.cost,
    handRefillSec: snap.handRefillSec,
    opening: m.state.opening.A,
    cardCost: (id, discount) => m.cardCost(id, discount),
  };
}

/** The "what changes" ledger: what the relic aims at, then each number before → after. */
function ChangeTable(props: { plan: RelicPlan; id: string }) {
  const { plan } = props;
  return (
    <section class="rcard-change" data-testid={`relic-change-${props.id}`}>
      <header>
        <span class="rcard-change-h">What changes</span>
        <span class="rcard-target">
          {plan.piece && <PieceGlyph piece={plan.piece} team="A" size={16} />}
          {plan.target}
        </span>
      </header>
      {plan.rows.length > 0 ? (
        <dl>
          {plan.rows.map((r) => (
            <div
              key={r.label}
              class={`rrow ${r.better === true ? 'gain' : r.better === false ? 'cost' : ''}`}
            >
              <dt>{r.label}</dt>
              <dd>
                <span class="rrow-b">{r.before}</span>
                <span class="rrow-arrow" aria-label="becomes">
                  →
                </span>
                <b>{r.after}</b>
              </dd>
            </div>
          ))}
        </dl>
      ) : (
        <p class="rcard-change-empty">Aim it below to see the numbers.</p>
      )}
    </section>
  );
}

function OfferCard(props: {
  offer: RelicOffer;
  def: RelicDef;
  aim: RelicAim;
  snap: Snapshot;
  input: PlanInput;
  index: number;
  onAim: (patch: AimPatch) => void;
  take: { label: string; disabled: boolean; onTake: (el: HTMLElement) => void };
}) {
  const { offer, def } = props;
  const s = useSession();
  const plan = relicPlan(props.input, def, props.aim);
  return (
    <article
      class={`rcard offer ${offer.tailored ? 'tailored' : ''} ${def.rally ? 'rally' : ''}`}
      data-family={def.family}
      data-testid={`relic-offer-${def.id}`}
      style={{ '--family': FAMILY_COLOR[def.family], '--i': props.index }}
    >
      <header class="rcard-plate">
        <RelicEmblem family={def.family} size={84} class="rcard-art" />
        <b class="rcard-name">{def.name}</b>
        <span class="rcard-tags">
          <FamilyChip family={def.family} />
          {def.rally && (
            <span class="rally-chip" title="Works only while you are behind">
              <Term id="rally">Rally</Term>
            </span>
          )}
        </span>
      </header>
      <p class="rcard-headline" data-testid={`relic-headline-${def.id}`}>
        {relicHeadline(s.content, def, props.aim, plan.piece)}
      </p>
      <ChangeTable plan={plan} id={def.id} />
      {offer.why && (
        <p class="rcard-why" data-testid={`relic-why-${def.id}`}>
          <i>Offered because</i> {offer.why}
        </p>
      )}
      {def.bind !== 'none' && (
        <AimControl
          def={def}
          aim={props.aim}
          snap={props.snap}
          onChange={props.onAim}
          testid={`relic-aim-${def.id}`}
        />
      )}
      <details class="rcard-more">
        <summary>Rules, reward and counter</summary>
        <p class="rcard-desc">
          <Terms text={relicText(s.content, def, 'A', s.match!.state.opening.A)} max={1} />
        </p>
        <dl class="rcard-facts">
          <dt>Rewards</dt>
          <dd>{def.rewards}</dd>
          <dt>Counter</dt>
          <dd>{def.counter}</dd>
        </dl>
      </details>
      <button
        class="btn primary rcard-take"
        disabled={props.take.disabled}
        data-testid={`relic-take-${def.id}`}
        onClick={(e) => props.take.onTake(e.currentTarget)}
      >
        {props.take.label}
      </button>
    </article>
  );
}

function HeldCard(props: { held: HeldRelic; def: RelicDef; snap: Snapshot }) {
  const s = useSession();
  const { held, def } = props;
  const m = s.match!;
  const where = aimText(s.content, held, (id) => m.unitById(id));
  const aim: RelicAim = {
    lane: held.lane,
    piece: held.piece,
    card: held.card,
    trigger: held.trigger,
    quota: held.quota,
    reserve: held.reserve,
  };
  return (
    <article
      class="rcard held"
      data-family={def.family}
      data-testid={`relic-held-${def.id}`}
      style={{ '--family': FAMILY_COLOR[def.family] }}
    >
      <header class="rcard-head">
        <RelicEmblem family={def.family} size={44} />
        <div class="rcard-title">
          <b>{def.name}</b>
          <span class="rcard-tags">
            <FamilyChip family={def.family} />
            {def.rally && <span class="rally-chip">Rally</span>}
            {where && <span class="rcard-where">{where}</span>}
          </span>
        </div>
      </header>
      <p class="rcard-held-plan">
        {relicHeadline(
          s.content,
          def,
          aim,
          aim.piece !== null ? (m.unitById(aim.piece)?.hero?.defId ?? null) : null,
        )}
      </p>
      <p class="rcard-desc">{relicText(s.content, def, 'A', s.match!.state.opening.A)}</p>
      {def.bind !== 'none' && (
        <AimControl
          def={def}
          aim={aim}
          snap={props.snap}
          onChange={(patch) => s.issue({ type: 'aimRelic', relicId: def.id, ...patch })}
          testid={`relic-reaim-${def.id}`}
        />
      )}
    </article>
  );
}

/** A taken card on its way into the held row. */
interface Flight {
  id: string;
  family: RelicFamily;
  name: string;
  headline: string;
  from: DOMRect;
}

/** The break (its tick) whose cards were last dealt, so they turn over once per break. */
let dealtAt = -1;

const reducedMotion = (): boolean =>
  typeof window.matchMedia === 'function' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * The pick: the taken card lifts, shrinks and flies into its place among the held relics, which
 * lands with a stamp (the `relic` sound plays as the pick is made). With reduced motion only the
 * stamp shows.
 */
function RelicFlight(props: { flight: Flight; onDone: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const { flight } = props;
  const done = useRef(props.onDone);
  done.current = props.onDone;
  useLayoutEffect(() => {
    let anim: Animation | null = null;
    let frame = 0;
    let tries = 0;
    // the landing, as an animation so a re-render of the held card cannot cut it short
    const stamp = (target: HTMLElement | null): void => {
      if (target && typeof target.animate === 'function' && !reducedMotion()) {
        const glow = getComputedStyle(target).getPropertyValue('--family').trim() || '#c9a35a';
        target.animate(
          [
            {
              transform: 'scale(1.05)',
              boxShadow: `0 0 0 3px ${glow}, 0 0 34px ${glow}`,
            },
            { transform: 'scale(0.985)', offset: 0.4 },
            { transform: 'none', boxShadow: '0 0 0 0 transparent' },
          ],
          { duration: 620, easing: 'cubic-bezier(0.2, 0.9, 0.3, 1.2)' },
        );
      }
      target?.setAttribute('data-stamped', 'true');
      done.current();
    };
    // the held card appears with the next snapshot, a frame or two after the pick
    const fly = (): void => {
      const ghost = ref.current;
      const target = document.querySelector<HTMLElement>(`[data-testid="relic-held-${flight.id}"]`);
      if (!target && tries++ < 30) {
        frame = requestAnimationFrame(fly);
        return;
      }
      if (!ghost || !target || reducedMotion() || typeof ghost.animate !== 'function') {
        stamp(target);
        return;
      }
      target.scrollIntoView({ block: 'nearest' });
      const to = target.getBoundingClientRect();
      const from = flight.from;
      const k = Math.max(
        0.2,
        Math.min(1, to.width / from.width, to.height / Math.max(1, ghost.offsetHeight)),
      );
      anim = ghost.animate(
        [
          { transform: 'none', opacity: 1, offset: 0 },
          { transform: 'translateY(-12px) scale(1.05)', opacity: 1, offset: 0.24 },
          {
            transform: `translate(${to.left - from.left}px, ${to.top - from.top}px) scale(${k})`,
            opacity: 0.55,
            offset: 1,
          },
        ],
        { duration: 640, easing: 'cubic-bezier(0.55, 0, 0.25, 1)', fill: 'forwards' },
      );
      anim.onfinish = () => stamp(target);
    };
    fly();
    return () => {
      cancelAnimationFrame(frame);
      if (anim) anim.onfinish = null;
    };
  }, [flight]);
  const f = flight.from;
  // on the page itself: the sheet's transform would otherwise shift a fixed position
  return createPortal(
    <div
      ref={ref}
      class="rflight"
      aria-hidden="true"
      style={{
        left: `${f.left}px`,
        top: `${f.top}px`,
        width: `${f.width}px`,
        minHeight: `${Math.min(f.height, 220)}px`,
        '--family': FAMILY_COLOR[flight.family],
      }}
    >
      <RelicEmblem family={flight.family} size={64} />
      <b>{flight.name}</b>
      <span>{flight.headline}</span>
    </div>,
    document.body,
  );
}

/** The Relics tab of the Act break sheet: pick one of three, aim it, and re-aim the ones you hold. */
export function RelicsTab(props: { snap: Snapshot }) {
  const s = useSession();
  const { offers, settled, held } = props.snap.relics;
  // a Tournament run raises the cap (the snapshot carries it); an Exhibition uses the tuning value
  const max = props.snap.relics.max ?? s.content.tuning.relics.max;
  const full = held.A.length >= max;
  const [aims, setAims] = useState<Record<string, RelicAim>>({});
  const [replace, setReplace] = useState<string | null>(null);
  const [flight, setFlight] = useState<Flight | null>(null);
  const open = !settled && offers.length > 0;
  // the cards are dealt face down and turn over once per break, not on every visit to the tab
  const [deal] = useState(() => {
    const first = dealtAt !== props.snap.tick;
    dealtAt = props.snap.tick;
    return first;
  });
  const input = planInput(s, props.snap);
  const aimOf = (o: RelicOffer): RelicAim => aims[o.id] ?? o.aim;
  const take = (o: RelicOffer, el: HTMLElement): void => {
    const aim = aimOf(o);
    const card = el.closest('article');
    const def = s.content.relicById.get(o.id)!;
    const ok = s.issue({
      type: 'pickRelic',
      relicId: o.id,
      ...aim,
      ...(full && replace ? { replace } : {}),
    }).ok;
    if (ok && card)
      setFlight({
        id: o.id,
        family: def.family,
        name: def.name,
        headline: relicHeadline(s.content, def, aim, relicPlan(input, def, aim).piece),
        from: card.getBoundingClientRect(),
      });
    setReplace(null);
  };
  return (
    <div class="relics" data-testid="tab-relics">
      {open ? (
        <>
          <p class="rl-intro">
            <Terms
              text={`Take one relic. It stays with you for the match and starts working next Act.${
                offers.some((o) => o.tailored)
                  ? ' The first card answers what went wrong this Act.'
                  : ''
              }`}
            />
          </p>
          {full && (
            <section class="rl-replace" data-testid="relic-replace">
              <p>
                You hold {max} relics. Choose one to replace, or keep all {max}.
              </p>
              <div class="rl-aim" role="radiogroup" aria-label="Relic to replace">
                {held.A.map((h) => {
                  const def = s.content.relicById.get(h.id)!;
                  return (
                    <button
                      key={h.id}
                      class={`rl-chip wide ${replace === h.id ? 'on' : ''}`}
                      role="radio"
                      aria-checked={replace === h.id}
                      data-testid={`relic-replace-${h.id}`}
                      onClick={() => setReplace(h.id)}
                    >
                      {def.name}
                    </button>
                  );
                })}
              </div>
              <button
                class="btn"
                data-testid="relic-decline"
                onClick={() => s.issue({ type: 'declineRelic' })}
              >
                Keep all {max}
              </button>
            </section>
          )}
          <nav class="rl-strip" aria-label={`${offers.length} offers`} data-testid="relic-strip">
            {offers.map((o) => {
              const def = s.content.relicById.get(o.id)!;
              return (
                <button
                  key={o.id}
                  class="rl-strip-chip"
                  data-testid={`relic-strip-${def.id}`}
                  style={{ '--family': FAMILY_COLOR[def.family] }}
                  onClick={() =>
                    document
                      .querySelector(`[data-testid="relic-offer-${def.id}"]`)
                      ?.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' })
                  }
                >
                  <RelicSeal family={def.family} size={18} />
                  <span>{def.name}</span>
                </button>
              );
            })}
          </nav>
          <div class={`rl-offers ${deal ? 'deal' : ''}`} data-testid="relic-offers">
            {offers.map((o, i) => {
              const def = s.content.relicById.get(o.id)!;
              return (
                <OfferCard
                  key={o.id}
                  offer={o}
                  def={def}
                  aim={aimOf(o)}
                  snap={props.snap}
                  input={input}
                  index={i}
                  onAim={(patch) => setAims({ ...aims, [o.id]: { ...aimOf(o), ...patch } })}
                  take={{
                    label: full ? 'Replace and take' : 'Take this relic',
                    disabled: full && !replace,
                    onTake: (el) => take(o, el),
                  }}
                />
              );
            })}
          </div>
          <button
            class="btn rl-auto"
            data-testid="relic-auto"
            onClick={() => s.issue({ type: 'autoRelic' })}
          >
            Let the AI choose
          </button>
        </>
      ) : (
        <p class="rl-intro" data-testid="relic-done">
          {props.snap.relics.latest.A
            ? `${s.content.relicById.get(props.snap.relics.latest.A)?.name} taken. It starts working next Act.`
            : offers.length === 0 && held.A.length < max
              ? 'No relic is on offer at this break.'
              : 'Your relics are unchanged.'}
        </p>
      )}
      {flight && <RelicFlight flight={flight} onDone={() => setFlight(null)} />}
      <section class="rl-held" data-testid="relic-held">
        <h3 class="bs-h">
          Your <Term id="relic">relics</Term> ({held.A.length}/{max})
        </h3>
        {held.A.length === 0 ? (
          <p class="bs-line dim">
            None yet. Relics are permanent; lane and piece relics can be re-aimed here at every
            break.
          </p>
        ) : (
          held.A.map((h) => (
            <HeldCard key={h.id} held={h} def={s.content.relicById.get(h.id)!} snap={props.snap} />
          ))
        )}
      </section>
    </div>
  );
}
