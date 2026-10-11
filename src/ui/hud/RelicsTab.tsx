import { useState } from 'preact/hooks';
import type {
  HeldRelic,
  LaneId,
  RelicAim,
  RelicDef,
  RelicOffer,
  SealedTrigger,
  Snapshot,
} from '../../sim';
import { SEALED_TRIGGERS } from '../../sim';
import { whitePieces } from '../Orders';
import { LANES, LANE_LABEL, LANE_TAG, PieceGlyph, pieceLabel } from '../pieces';
import {
  FAMILY_COLOR,
  FamilyChip,
  RelicSeal,
  TRIGGER_LABEL,
  aimText,
  bindsLane,
  relicDesc,
} from '../relics';
import { SCHOOL_NAME } from '../schools';
import { useSession } from '../session';

type Pick = Partial<RelicAim>;

/** Left / Mid / Right chips for a lane-bound relic. */
function LaneChips(props: {
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

/** One chip per White piece for a piece-bound relic. */
function PieceChips(props: {
  value: number | null;
  onChange: (piece: number) => void;
  testid: string;
  label: string;
}) {
  const s = useSession();
  return (
    <div class="rl-aim" role="radiogroup" aria-label={props.label}>
      <span class="rl-aim-label">Piece</span>
      {whitePieces(s).map((u) => {
        const piece = u.hero!.defId;
        return (
          <button
            key={u.id}
            class={`rl-chip piece ${props.value === u.id ? 'on' : ''}`}
            role="radio"
            aria-checked={props.value === u.id}
            aria-label={pieceLabel(s.content, piece)}
            title={pieceLabel(s.content, piece)}
            data-testid={`${props.testid}-${piece}`}
            onClick={() => props.onChange(u.id)}
          >
            <PieceGlyph piece={piece} team="A" size={22} />
          </button>
        );
      })}
    </div>
  );
}

function CardChips(props: {
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
function SealedControls(props: {
  aim: RelicAim;
  guardedOk: boolean;
  onChange: (patch: Pick) => void;
  testid: string;
}) {
  const s = useSession();
  const schools = s.content.openingById.get(s.match!.state.opening.A)?.schools ?? [];
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
                    {g.name} ({Math.max(0, g.cost - discount)} Tempo)
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
function QuotaControls(props: {
  aim: RelicAim;
  cap: number;
  reserves: number[];
  onChange: (patch: Pick) => void;
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
  onChange: (patch: Pick) => void;
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
          value={aim.piece}
          onChange={(piece) => props.onChange({ piece })}
          testid={`${props.testid}-piece`}
          label={`${def.name} piece`}
        />
      )}
    </>
  );
}

function OfferCard(props: {
  offer: RelicOffer;
  def: RelicDef;
  aim: RelicAim;
  snap: Snapshot;
  onAim: (patch: Pick) => void;
  take: { label: string; disabled: boolean; onTake: () => void };
}) {
  const { offer, def } = props;
  return (
    <article
      class={`rcard ${offer.tailored ? 'tailored' : ''} ${def.rally ? 'rally' : ''}`}
      data-family={def.family}
      data-testid={`relic-offer-${def.id}`}
      style={{ '--family': FAMILY_COLOR[def.family] }}
    >
      <header class="rcard-head">
        <RelicSeal family={def.family} size={34} />
        <div class="rcard-title">
          <b>{def.name}</b>
          <span class="rcard-tags">
            <FamilyChip family={def.family} />
            {def.rally && (
              <span class="rally-chip" title="Works only while you are behind">
                Rally
              </span>
            )}
          </span>
        </div>
      </header>
      <p class="rcard-desc">{relicDesc(def)}</p>
      <details class="rcard-more">
        <summary>Rewards and counter</summary>
        <dl class="rcard-facts">
          <dt>Rewards</dt>
          <dd>{def.rewards}</dd>
          <dt>Counter</dt>
          <dd>{def.counter}</dd>
        </dl>
      </details>
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
      <button
        class="btn primary rcard-take"
        disabled={props.take.disabled}
        data-testid={`relic-take-${def.id}`}
        onClick={props.take.onTake}
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
        <RelicSeal family={def.family} size={30} />
        <div class="rcard-title">
          <b>{def.name}</b>
          <span class="rcard-tags">
            <FamilyChip family={def.family} />
            {def.rally && <span class="rally-chip">Rally</span>}
            {where && <span class="rcard-where">{where}</span>}
          </span>
        </div>
      </header>
      <p class="rcard-desc">{relicDesc(def)}</p>
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

/** The Relics tab of the Act break sheet: pick one of three, aim it, and re-aim the ones you hold. */
export function RelicsTab(props: { snap: Snapshot }) {
  const s = useSession();
  const { offers, settled, held } = props.snap.relics;
  const max = s.content.tuning.relics.max;
  const full = held.A.length >= max;
  const [aims, setAims] = useState<Record<string, RelicAim>>({});
  const [replace, setReplace] = useState<string | null>(null);
  const open = !settled && offers.length > 0;
  const aimOf = (o: RelicOffer): RelicAim => aims[o.id] ?? o.aim;
  const take = (o: RelicOffer): void => {
    const aim = aimOf(o);
    s.issue({
      type: 'pickRelic',
      relicId: o.id,
      ...aim,
      ...(full && replace ? { replace } : {}),
    });
    setReplace(null);
  };
  return (
    <div class="relics" data-testid="tab-relics">
      {open ? (
        <>
          <p class="rl-intro">
            Take one relic. It stays with you for the match and starts working next Act.
            {offers.some((o) => o.tailored) && ' The first card answers what went wrong this Act.'}
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
                      ?.scrollIntoView({ block: 'start', behavior: 'smooth' })
                  }
                >
                  <RelicSeal family={def.family} size={18} />
                  <span>{def.name}</span>
                </button>
              );
            })}
          </nav>
          <div class="rl-offers" data-testid="relic-offers">
            {offers.map((o) => {
              const def = s.content.relicById.get(o.id)!;
              return (
                <OfferCard
                  key={o.id}
                  offer={o}
                  def={def}
                  aim={aimOf(o)}
                  snap={props.snap}
                  onAim={(patch) => setAims({ ...aims, [o.id]: { ...aimOf(o), ...patch } })}
                  take={{
                    label: full ? 'Replace and take' : 'Take this relic',
                    disabled: full && !replace,
                    onTake: () => take(o),
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
      <section class="rl-held" data-testid="relic-held">
        <h3 class="bs-h">
          Your relics ({held.A.length}/{max})
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
