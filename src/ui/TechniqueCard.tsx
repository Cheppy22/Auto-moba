import type { ComponentChildren } from 'preact';
import type {
  BuildCardView,
  Content,
  EstimateCount,
  Grade,
  PieceId,
  TechniquePreview,
  TechniqueSlot,
} from '../sim';
import { SLOT_ABILITY, techniqueText } from '../sim';
import { n0 } from './format';
import { num } from './relicPlan';
import { RichText } from './richtext';
import { SCHOOL_COLOR, SCHOOL_NAME, SchoolGlyph } from './schools';
import { statDeltas } from './statDeltas';
import { GRADE_MARK } from './TechniqueChip';

/** A grade's name, as cards and the slot row print it. */
export const GRADE_WORD: Record<Grade, string> = {
  plain: 'Plain',
  sharp: 'Sharp',
  brilliant: 'Brilliant',
};

/**
 * Everything a Technique's card face shows. An offer's card (`BuildCardView`) is one already; a held
 * Technique (Spoils, Run kit, a slot's details) gets one from `techniqueFace`.
 */
export type TechniqueFace = Pick<
  BuildCardView,
  | 'id'
  | 'name'
  | 'school'
  | 'grade'
  | 'slot'
  | 'slotName'
  | 'replaces'
  | 'playsLike'
  | 'desc'
  | 'price'
  | 'combination'
  | 'leadsTo'
> & { preview?: TechniquePreview | null };

const FIXED_SLOT_NAME: Partial<Record<TechniqueSlot, string>> = {
  attack: 'Attack',
  trait: 'Trait',
};

/** A slot's name for a piece: "Attack", "Trait", or the skill's own name ("L-Leap"). */
export function slotLabel(
  c: Content,
  piece: PieceId | null,
  style: string | null,
  slot: TechniqueSlot,
): string {
  const fixed = FIXED_SLOT_NAME[slot];
  if (fixed) return fixed;
  const idx = SLOT_ABILITY[slot];
  if (idx === null || !piece) return slot === 'signature' ? 'Signature' : `Skill ${idx! + 1}`;
  const kit = style ? c.kitByKey.get(`${piece}/${style}`) : c.pieceById.get(piece)?.abilities;
  return kit?.[idx]?.name ?? (slot === 'signature' ? 'Signature' : `Skill ${idx + 1}`);
}

/** The card face of a held Technique (no offer behind it): its text at that grade. */
export function techniqueFace(
  c: Content,
  id: string,
  grade: Grade,
  piece: PieceId | null = null,
  style: string | null = null,
): TechniqueFace | null {
  const d = c.techniqueById.get(id);
  if (!d) return null;
  const text = techniqueText(d, c.tuning.builds.grades[grade]);
  return {
    id: d.id,
    name: d.name,
    school: d.school,
    grade,
    slot: d.slot,
    slotName: slotLabel(c, piece ?? d.piece ?? null, style ?? d.archetype ?? null, d.slot),
    replaces: null,
    playsLike: d.playsLike,
    desc: text.desc,
    price: text.price,
    combination: d.pool === 'combination',
    leadsTo: [],
  };
}

export interface LedgerRow {
  label: string;
  before: string;
  after: string;
  /** True: better for the piece; false: worse (a Dubious price); null: neither. */
  better: boolean | null;
}

/** The "What changes" rows of a preview: the piece's stats, then the changed skill's numbers. */
export function ledgerRows(p: TechniquePreview): LedgerRow[] {
  const rows: LedgerRow[] = statDeltas(p).map((d) => ({
    label: d.label,
    before: d.before,
    after: d.after,
    // a cooldown cut shows as "−10%", and a larger cut is better
    better: d.up,
  }));
  const a = p.ability;
  if (a) {
    const add = (label: string, b: number, x: number, fmt: (v: number) => string, up: boolean) => {
      if (fmt(b) === fmt(x)) return;
      rows.push({ label, before: fmt(b), after: fmt(x), better: x > b === up });
    };
    const name = a.after.name;
    add(`${name} power`, a.before.power, a.after.power, (v) => `${Math.round(v * 100)}%`, true);
    add(`${name} cooldown`, a.before.cooldownSec, a.after.cooldownSec, (v) => `${num(v)} s`, false);
    add(`${name} reach`, a.before.range, a.after.range, num, true);
    add(`${name} area`, a.before.radius, a.after.radius, num, true);
  }
  return rows;
}

const COUNT_WORD: Record<EstimateCount, string> = {
  hits: 'hits',
  pieceHits: 'hits on pieces',
  casts: 'skill casts',
  damageTaken: 'damage taken',
};

/** The "last Act" line: "212 hits last Act: about 53 extra strikes" (null without one). */
export function estimateLine(p: TechniquePreview | null | undefined): string | null {
  const e = p?.estimate;
  if (!e || e.last <= 0) return null;
  return `${n0(e.last)} ${COUNT_WORD[e.count]} last Act: about ${n0(e.value)} ${e.label}`;
}

/** The What changes ledger, in the relic card's style (green up, seal red down). */
export function TechLedger(props: { rows: LedgerRow[]; testid?: string; empty?: string }) {
  return (
    <section class="tcard-change" data-testid={props.testid}>
      <span class="tcard-change-h">What changes</span>
      {props.rows.length > 0 ? (
        <dl>
          {props.rows.map((r) => (
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
        <p class="tcard-change-empty">
          {props.empty ?? 'No stat moves: the rule above is the change.'}
        </p>
      )}
    </section>
  );
}

/** How a card is marked: the AI's pick pre-selected ("Picked for you"), only suggested, or not. */
export type CardMark = 'picked' | 'suggested' | null;

/**
 * A Technique's big card (the relic card's look in its school's colour): school medallion with the
 * grade mark, name, school and grade, the slot it changes or the Technique it replaces, "plays like",
 * the rule with this grade's numbers, a Dubious price, the What changes ledger with the piece's own
 * numbers (when a preview is given), the "last Act" estimate and the Combination line. Buttons go in
 * `children`.
 */
export function TechniqueCard(props: {
  card: TechniqueFace;
  mark?: CardMark;
  testid?: string;
  /** Position in a dealt row (the turn-over delay). */
  index?: number;
  children?: ComponentChildren;
}) {
  const { card } = props;
  const mark = props.mark ?? null;
  const gm = GRADE_MARK[card.grade];
  const est = estimateLine(card.preview);
  const ready = card.leadsTo.filter((l) => l.partnerHeld);
  const later = card.leadsTo.filter((l) => !l.partnerHeld);
  return (
    <article
      class={`tcard ${mark ? `mark-${mark}` : ''} grade-${card.grade}`}
      data-testid={props.testid}
      data-technique={card.id}
      data-school={card.school}
      data-mark={mark ?? 'none'}
      style={{ '--school': SCHOOL_COLOR[card.school], '--i': props.index ?? 0 }}
    >
      {mark && (
        <span class="tcard-mark" data-testid={props.testid ? `${props.testid}-mark` : undefined}>
          {mark === 'picked' ? 'Picked for you' : 'AI suggests'}
        </span>
      )}
      <header class="tcard-plate">
        <span class="tcard-medal" aria-hidden="true">
          <SchoolGlyph school={card.school} size={28} />
          {gm && <b class="tcard-grade">{gm}</b>}
        </span>
        <span class="tcard-title">
          <b class="tcard-name">{card.name}</b>
          <span class="tcard-tags">
            <span class="tcard-school">{SCHOOL_NAME[card.school]}</span>
            {gm && (
              <span class={`tcard-gradeword ${card.grade}`}>
                {GRADE_WORD[card.grade]} {gm}
              </span>
            )}
            {card.price && <span class="tcard-dubious">Dubious ?!</span>}
          </span>
        </span>
      </header>
      <p class="tcard-slot">
        {card.combination ? (
          <>
            <span class="tcard-combo">Combination</span>
            {card.replaces ? (
              <>
                {' '}
                upgrades <b>{card.replaces}</b>
              </>
            ) : null}
          </>
        ) : card.replaces ? (
          <span class="tcard-replaces">
            Replaces <b>{card.replaces}</b>
          </span>
        ) : (
          <>
            Changes: <b>{card.slotName}</b>
          </>
        )}
      </p>
      {card.playsLike && <p class="tcard-plays">{card.playsLike}</p>}
      <p class="tcard-desc">
        <RichText text={card.desc} />
      </p>
      {card.price && (
        <p class="tcard-price">
          <RichText text={card.price} />
        </p>
      )}
      {card.preview && ledgerRows(card.preview).length > 0 && (
        <TechLedger
          rows={ledgerRows(card.preview)}
          testid={props.testid ? `${props.testid}-change` : undefined}
        />
      )}
      {est && (
        <p class="tcard-est" data-testid={props.testid ? `${props.testid}-est` : undefined}>
          {est}
        </p>
      )}
      {ready.map((l) => (
        <p
          class="tcard-leads ready"
          key={l.id}
          data-testid={props.testid ? `${props.testid}-pair` : undefined}
        >
          <i>Completes a pair</i> with {l.partnerName}: <b>{l.name}</b>{' '}
          {l.now
            ? 'is added at once (no offer follows this one).'
            : 'comes in this piece’s next offer.'}
        </p>
      ))}
      {later.length > 0 && (
        <p class="tcard-leads">
          <i>Leads to</i>{' '}
          {later.map((l, k) => (
            <span key={l.id}>
              {k > 0 ? '; ' : ''}
              <b>{l.name}</b> (with {l.partnerName})
            </span>
          ))}
        </p>
      )}
      {props.children}
    </article>
  );
}
