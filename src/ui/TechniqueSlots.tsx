import type { ComponentChildren } from 'preact';
import type { Content, Grade, HeldTechnique, PieceId, TechTally, TechniqueSlot } from '../sim';
import { TECHNIQUE_SLOTS, techniqueText } from '../sim';
import { n0 } from './format';
import { RichText } from './richtext';
import { SCHOOL_COLOR, SCHOOL_NAME, SchoolGlyph, type School } from './schools';
import { GRADE_MARK } from './TechniqueChip';
import { GRADE_WORD, slotLabel } from './TechniqueCard';

/** One of a piece's six slots, as the slot row draws it (a `BuildSlotView` is one). */
export interface SlotTile {
  slot: TechniqueSlot;
  name: string;
  /** The Signature slot before the Rank 4 archetype. */
  locked: boolean;
  held: {
    id: string;
    name: string;
    school: School;
    grade: Grade;
    desc: string;
    price: string | null;
    combination: boolean;
    oneAway: string[];
    did?: { lastAct: TechTally; match: TechTally };
    upgradeCost?: number | null;
    nextGrade?: Grade | null;
  } | null;
}

/** The six slots of a piece from what it holds (no tallies): the piece card's view of Black. */
export function slotTiles(
  c: Content,
  piece: PieceId,
  style: string | null,
  held: readonly HeldTechnique[],
): SlotTile[] {
  return TECHNIQUE_SLOTS.map((slot) => {
    const h = held.find((x) => c.techniqueById.get(x.id)?.slot === slot);
    const d = h ? c.techniqueById.get(h.id) : undefined;
    const text = d && h ? techniqueText(d, c.tuning.builds.grades[h.grade]) : null;
    return {
      slot,
      name: slotLabel(c, piece, style, slot),
      locked: slot === 'signature' && style === null,
      held:
        d && h && text
          ? {
              id: d.id,
              name: d.name,
              school: d.school,
              grade: h.grade,
              desc: text.desc,
              price: text.price,
              combination: d.pool === 'combination',
              oneAway: [],
            }
          : null,
    };
  });
}

/**
 * The six slots in a grid: a held Technique (school colour, name, grade mark), an empty slot's
 * outline with its name, or the Signature locked until Rank 4. Held tiles are buttons that select
 * the slot for its details.
 */
export function SlotRow(props: {
  tiles: SlotTile[];
  selected: TechniqueSlot | null;
  onSelect: (slot: TechniqueSlot | null) => void;
  testid: string;
  compact?: boolean;
  /** A slot just filled or upgraded: it lands with a glow. */
  fresh?: TechniqueSlot | null;
}) {
  return (
    <div
      class={`tslots ${props.compact ? 'compact' : ''}`}
      role="group"
      aria-label="Technique slots"
      data-testid={props.testid}
    >
      {props.tiles.map((t) => {
        const id = `${props.testid}-${t.slot}`;
        if (!t.held)
          return (
            <div
              key={t.slot}
              class={`tslot ${t.locked ? 'locked' : 'empty'}`}
              data-testid={id}
              data-state={t.locked ? 'locked' : 'empty'}
            >
              <span class="tslot-label">{t.locked ? 'Signature' : t.name}</span>
              <span class="tslot-name dim">{t.locked ? 'Opens at Rank 4' : 'Empty'}</span>
            </div>
          );
        const on = props.selected === t.slot;
        const gm = GRADE_MARK[t.held.grade];
        return (
          <button
            key={t.slot}
            class={`tslot held ${on ? 'on' : ''} ${props.fresh === t.slot ? 'fresh' : ''}`}
            data-testid={id}
            data-state="held"
            data-technique={t.held.id}
            aria-pressed={on}
            aria-label={`${t.name}: ${t.held.name}, ${GRADE_WORD[t.held.grade]}`}
            style={{ '--school': SCHOOL_COLOR[t.held.school] }}
            onClick={() => props.onSelect(on ? null : t.slot)}
          >
            <span class="tslot-label">{t.name}</span>
            <span class="tslot-name">
              <SchoolGlyph school={t.held.school} size={13} />
              <span class="tslot-text">{t.held.name}</span>
              {gm && <b class="tech-grade">{gm}</b>}
            </span>
            {t.held.oneAway.length > 0 && <i class="tslot-away">1 away</i>}
          </button>
        );
      })}
    </div>
  );
}

/** "1,840 damage, 320 shields, fired 9 times" (empty when it did nothing countable). */
export function didText(t: TechTally): string {
  const bits: string[] = [];
  if (t.damage >= 1) bits.push(`${n0(t.damage)} damage`);
  if (t.heal >= 1) bits.push(`${n0(t.heal)} healing`);
  if (t.shield >= 1) bits.push(`${n0(t.shield)} shields`);
  if (t.procs > 0) bits.push(`fired ${n0(t.procs)} time${t.procs === 1 ? '' : 's'}`);
  return bits.join(', ');
}

/** A held tile's details: the rule at its grade, what it did, and room for an Upgrade control. */
export function SlotDetail(props: {
  tile: SlotTile;
  testid: string;
  /** Show the last Act's tally (at a break) as well as the match's. */
  lastAct?: boolean;
  children?: ComponentChildren;
}) {
  const h = props.tile.held;
  if (!h) return null;
  const gm = GRADE_MARK[h.grade];
  const last = h.did ? didText(h.did.lastAct) : '';
  const all = h.did ? didText(h.did.match) : '';
  return (
    <section
      class="tslot-detail"
      data-testid={props.testid}
      style={{ '--school': SCHOOL_COLOR[h.school] }}
    >
      <header>
        <SchoolGlyph school={h.school} size={16} />
        <b>
          {h.name}
          {gm && <span class="tech-grade"> {gm}</span>}
        </b>
        <span class="tslot-detail-tags">
          {props.tile.name} · {SCHOOL_NAME[h.school]} · {GRADE_WORD[h.grade]}
        </span>
      </header>
      <p class="tslot-detail-desc">
        <RichText text={h.desc} />
      </p>
      {h.price && (
        <p class="tcard-price">
          <RichText text={h.price} />
        </p>
      )}
      {h.did && (
        <p class="tslot-did" data-testid={`${props.testid}-did`}>
          {props.lastAct && (
            <>
              <i>Last Act</i> {last || 'nothing counted'}.{' '}
            </>
          )}
          <i>This match</i> {all || 'nothing counted yet'}.
          {!last && !all && <span class="dim"> Stat bonuses are not counted.</span>}
        </p>
      )}
      {h.oneAway.length > 0 && (
        <p class="tslot-did">
          <i>1 away</i> from {h.oneAway.join(', ')}.
        </p>
      )}
      {props.children}
    </section>
  );
}
