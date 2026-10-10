import { useState } from 'preact/hooks';
import type { HeldRelic, LaneId, RelicAim, RelicDef, RelicOffer, Snapshot } from '../../sim';
import { whitePieces } from '../Orders';
import { LANES, LANE_LABEL, LANE_TAG, PieceGlyph, pieceLabel } from '../pieces';
import { FAMILY_COLOR, FamilyChip, RelicSeal, aimText, bindsLane } from '../relics';
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

/** The chips a relic takes: a lane, a piece, or a lane and a card. */
function AimControl(props: {
  def: RelicDef;
  aim: RelicAim;
  onChange: (patch: Pick) => void;
  testid: string;
}) {
  const { def, aim } = props;
  return (
    <>
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
      <p class="rcard-desc">{def.desc}</p>
      <dl class="rcard-facts">
        <dt>Rewards</dt>
        <dd>{def.rewards}</dd>
        <dt>Counter</dt>
        <dd>{def.counter}</dd>
      </dl>
      {offer.why && (
        <p class="rcard-why" data-testid={`relic-why-${def.id}`}>
          <i>Offered because</i> {offer.why}
        </p>
      )}
      {def.bind !== 'none' && (
        <AimControl
          def={def}
          aim={props.aim}
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

function HeldCard(props: { held: HeldRelic; def: RelicDef }) {
  const s = useSession();
  const { held, def } = props;
  const m = s.match!;
  const where = aimText(s.content, held, (id) => m.unitById(id));
  const aim: RelicAim = { lane: held.lane, piece: held.piece, card: held.card };
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
      <p class="rcard-desc">{def.desc}</p>
      {def.bind !== 'none' && (
        <AimControl
          def={def}
          aim={aim}
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
          <div class="rl-offers" data-testid="relic-offers">
            {offers.map((o) => {
              const def = s.content.relicById.get(o.id)!;
              return (
                <OfferCard
                  key={o.id}
                  offer={o}
                  def={def}
                  aim={aimOf(o)}
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
          held.A.map((h) => <HeldCard key={h.id} held={h} def={s.content.relicById.get(h.id)!} />)
        )}
      </section>
    </div>
  );
}
