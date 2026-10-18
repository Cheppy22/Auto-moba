import type { ComponentChildren } from 'preact';
import {
  techniqueText,
  type BuildCardView,
  type Content,
  type Grade,
  type PieceId,
  type School,
  type TechniquePreview,
  type TechniqueSlot,
} from '../../sim';
import { Term } from '../glossary';
import { RichText } from '../richtext';
import { SCHOOL_COLOR, SCHOOL_NAME, SchoolGlyph } from '../schools';
import { GRADE_MARK } from '../TechniqueChip';
import { ledgerRows } from './ledger';

/** Everything a Technique card face draws; built from an offer card or straight from content. */
export interface CardFace {
  id: string;
  name: string;
  school: School;
  grade: Grade;
  /** "Attack", "Trait", or the skill's own name ("L-Leap"). */
  slotName: string;
  playsLike: string;
  desc: string;
  /** A Dubious card's stated price. */
  price: string | null;
  combination: boolean;
  /** The held Technique this card replaces (an offer only). */
  replaces?: string | null;
  /** Combinations this card is a parent of (an offer only). */
  leadsTo?: BuildCardView['leadsTo'];
  /** Real numbers on the piece it is offered to (an offer only). */
  preview?: TechniquePreview | null;
}

export const GRADE_NAME: Record<Grade, string> = {
  plain: 'Plain',
  sharp: 'Sharp',
  brilliant: 'Brilliant',
};

/** An offer card as a face. */
export function faceOfView(v: BuildCardView): CardFace {
  return {
    id: v.id,
    name: v.name,
    school: v.school,
    grade: v.grade,
    slotName: v.slotName,
    playsLike: v.playsLike,
    desc: v.desc,
    price: v.price,
    combination: v.combination,
    replaces: v.replaces,
    leadsTo: v.leadsTo,
    preview: v.preview,
  };
}

const SLOT_WORD: Record<TechniqueSlot, string | number> = {
  attack: 'Attack',
  skill1: 0,
  skill2: 1,
  skill3: 2,
  signature: 3,
  trait: 'Trait',
};

/** The part of a piece a slot changes: "Attack", "Trait" or the skill's own name. */
export function slotWord(c: Content, piece: PieceId | null, slot: TechniqueSlot): string {
  const w = SLOT_WORD[slot];
  if (typeof w === 'string') return w;
  const skill = piece ? c.pieceById.get(piece)?.abilities[w]?.name : undefined;
  if (skill) return skill;
  return w === 3 ? 'Signature' : `Skill ${'I'.repeat(w + 1)}`;
}

/** A card face from content alone (Spoils, the Run kit): the text at the grade's own numbers. */
export function faceOfDef(
  c: Content,
  id: string,
  grade: Grade = 'plain',
  piece: PieceId | null = null,
): CardFace | null {
  const d = c.techniqueById.get(id);
  if (!d) return null;
  const mult = c.tuning.builds.grades[grade];
  const text = techniqueText(d, mult);
  return {
    id: d.id,
    name: d.name,
    school: d.school,
    grade,
    slotName: slotWord(c, piece, d.slot),
    playsLike: d.playsLike,
    desc: text.desc,
    price: text.price,
    combination: d.pool === 'combination',
  };
}

/** "What changes": the card's real before → after numbers on its piece (nothing when it changes none). */
function Ledger(props: { preview: TechniquePreview | null | undefined }) {
  const rows = props.preview ? ledgerRows(props.preview) : [];
  if (rows.length === 0) return null;
  return (
    <section class="tc-change" data-testid="tc-change">
      <span class="tc-change-h">What changes</span>
      <dl>
        {rows.map((r) => (
          <div key={r.label} class={`rrow ${r.better ? 'gain' : 'cost'}`}>
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
    </section>
  );
}

/**
 * A Technique card: school colour and mark, the slot it changes, its name and grade, how it plays,
 * the rule with its numbers, the price of a Dubious card and the Combination it leads to.
 * `children` is the footer (Take, Chosen, Upgrade).
 */
export function TechniqueCard(props: {
  face: CardFace;
  testid?: string;
  /** Chosen: a brass border. */
  on?: boolean;
  /** The AI's pick (the "AI suggests" pip). */
  suggested?: boolean;
  /** Smaller type and no "plays like" line. */
  compact?: boolean;
  /** A line above the name, e.g. "Heirloom". */
  tag?: ComponentChildren;
  children?: ComponentChildren;
}) {
  const f = props.face;
  const mark = GRADE_MARK[f.grade];
  return (
    <article
      class={`tc ${props.on ? 'on' : ''} ${props.compact ? 'compact' : ''}`}
      data-testid={props.testid}
      data-technique={f.id}
      data-school={f.school}
      data-grade={f.grade}
      style={{ '--school': SCHOOL_COLOR[f.school] }}
    >
      <header class="tc-top">
        <span class="tc-school">
          <SchoolGlyph school={f.school} size={16} />
          {SCHOOL_NAME[f.school]}
        </span>
        {props.suggested && <i class="tc-ai tiny">AI suggests</i>}
        {props.tag}
      </header>
      <h4 class="tc-name">
        {f.name}
        {mark && (
          <b class="tech-grade" title={`${GRADE_NAME[f.grade]} grade`}>
            {' '}
            {mark}
          </b>
        )}
      </h4>
      <p class="tc-slot tiny">
        <span class="tc-slotchip">Changes: {f.slotName}</span>
        {f.price && (
          <span class="tc-tag dubious">
            <Term id="dubious">Dubious</Term> ?!
          </span>
        )}
        {f.combination && (
          <span class="tc-tag combo">
            <Term id="combination">Combination</Term>
          </span>
        )}
      </p>
      {!props.compact && f.playsLike && <p class="tc-plays">{f.playsLike}</p>}
      <p class="tc-rule">
        <RichText text={f.desc} />
      </p>
      {f.price && (
        <p class="tc-price tiny">
          <b>Price:</b> <RichText text={f.price} />
        </p>
      )}
      <Ledger preview={f.preview} />
      {f.replaces && <p class="tc-note tiny">Replaces {f.replaces}.</p>}
      {f.leadsTo && f.leadsTo.length > 0 && (
        <p class="tc-leads tiny">
          {f.leadsTo.map((k, i) => (
            <span key={k.id}>
              {i > 0 && ' · '}
              Leads to <b>{k.name}</b> with {k.partnerName}
              {k.partnerHeld ? ' (held)' : ''}
            </span>
          ))}
        </p>
      )}
      {props.children}
    </article>
  );
}
