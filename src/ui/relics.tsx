import type {
  Content,
  HeldRelic,
  PlayTeam,
  RelicAim,
  RelicDef,
  RelicFamily,
  SealedTrigger,
  Snapshot,
  Unit,
} from '../sim';
import { LANES, LANE_LABEL, LANE_TAG, pieceLabel } from './pieces';

/** Sealed Move triggers in full (the picker) and in brief (the seal row and held card). */
export const TRIGGER_LABEL: Record<SealedTrigger, string> = {
  bastion: 'One of my Bastions drops below 50%',
  kill: 'An enemy piece dies',
  guarded: 'My Crown Jewel or Guarded piece drops below 40%',
  lane3: '3 or more enemy pieces in one lane',
  clock: 'The Act clock reaches 2:00',
};
export const TRIGGER_SHORT: Record<SealedTrigger, string> = {
  bastion: 'Bastion under 50%',
  kill: 'Enemy piece dies',
  guarded: 'Key piece under 40%',
  lane3: '3+ enemies in a lane',
  clock: 'Clock at 2:00',
};

export const FAMILY_ORDER: RelicFamily[] = ['lane', 'carry', 'pawns', 'siege', 'orders'];

export const FAMILY_NAME: Record<RelicFamily, string> = {
  lane: 'Lane Doctrine',
  carry: 'Carry & Court',
  pawns: 'Pawns & Tempo',
  siege: 'Siege & Structure',
  orders: 'Standing Orders',
};

export const FAMILY_JOB: Record<RelicFamily, string> = {
  lane: 'Which lane you push, hold or give up',
  carry: 'Which piece carries, who protects it',
  pawns: 'How Tempo is spent',
  siege: 'Where you break through, how you hold',
  orders: 'Cards and schools set at the break',
};

/** Family colours: verdigris, amber, sage, terracotta, periwinkle (apart from the school colours). */
export const FAMILY_COLOR: Record<RelicFamily, string> = {
  lane: '#5aa3a0',
  carry: '#d9a066',
  pawns: '#9fb36a',
  siege: '#c97a5e',
  orders: '#8e9bc9',
};

/** What a relic is aimed at, in words ("Left lane", "Queen", "Left lane · Advance"). */
export function aimText(
  content: Content,
  held: RelicAim,
  unitById: (id: number) => Unit | undefined,
): string {
  const parts: string[] = [];
  if (held.lane) parts.push(`${LANE_LABEL[held.lane]} lane`);
  if (held.piece !== null) {
    const piece = unitById(held.piece)?.hero?.defId;
    if (piece) parts.push(pieceLabel(content, piece));
  }
  if (held.card) parts.push(content.gambitById.get(held.card)?.name ?? held.card);
  if (held.trigger) parts.push(TRIGGER_SHORT[held.trigger]);
  const q = held.quota;
  if (q) {
    const lanes = LANES.map((l) => `${LANE_TAG[l]}${q[l]}`).join(' ');
    parts.push(`${lanes}, reserve ${held.reserve ?? 0}`);
  }
  return parts.join(' · ');
}

/**
 * A team's held relics as the player may see them. Black's pick at the break stays secret until the
 * next Act starts (the sheet and the seal row show it on resume).
 */
export function shownRelics(snap: Snapshot, team: PlayTeam): HeldRelic[] {
  const held = snap.relics.held[team];
  if (team === 'A' || snap.act.bell !== 'break') return held;
  const fresh = snap.relics.latest.B;
  return held.filter((h) => h.id !== fresh);
}

/** A relic's effect line. A Rally relic already wears a Rally chip, so the "Rally." that opens its text is dropped. */
export const relicDesc = (def: RelicDef): string => def.desc.replace(/^Rally\.\s+/, '');

/**
 * A relic's text for a side. The card text is written for White ("your Opening", "Italian Game:
 * every card costs 2 less"); Black's reads as its own Opening, French Defence, and so on.
 */
export function relicText(
  content: Content,
  def: RelicDef,
  team: PlayTeam,
  opening: string,
): string {
  const desc = relicDesc(def);
  if (team === 'A') return desc;
  const name = content.openingById.get(opening)?.name ?? "Black's";
  let text = desc.replace(/your Opening's/g, `${name}'s`).replace(/your Opening/g, name);
  if (opening !== 'italian')
    text = text
      .replace(/ ?Italian Game: [^.]*\./, '')
      .replace(/ \(any school for Italian Game\)/, '');
  return text;
}

export const bindsLane = (def: RelicDef): boolean => def.bind === 'lane' || def.bind === 'laneCard';

/** A 24x24 line glyph per family, drawn in the family colour. */
function FamilyGlyph(props: { family: RelicFamily; color: string }) {
  const c = props.color;
  switch (props.family) {
    case 'lane':
      return (
        <>
          <path d="M5 4v16M19 4v16" stroke-dasharray="2.5 2.5" />
          <rect x="9.5" y="4" width="5" height="16" rx="1" fill={c} stroke="none" />
        </>
      );
    case 'carry':
      return (
        <>
          <path d="M4 18 3 8l5 4 4-7 4 7 5-4-1 10z" fill={c} fill-opacity="0.55" />
          <path d="M4 21h16" />
        </>
      );
    case 'pawns':
      return (
        <>
          <circle cx="12" cy="6.6" r="3" fill={c} stroke="none" />
          <path
            d="M8.4 10.8h7.2l-1.2 1.8c1.1 1 1.8 2.4 1.8 4.2 0 1-.3 1.9-.8 2.7H8.6c-.5-.8-.8-1.7-.8-2.7 0-1.8.7-3.2 1.8-4.2z"
            fill={c}
            stroke="none"
          />
          <path d="M5.5 21h13" />
        </>
      );
    case 'siege':
      return (
        <>
          <path d="M4 20V6h16v14zM4 11h16M4 15.5h16M12 6v5M8 11v4.5M16 11v4.5M12 15.5V20" />
          <path d="M13.5 6.5 11 11l3 1.5" stroke={c} stroke-width="2" />
        </>
      );
    case 'orders':
      return (
        <>
          <path d="M6 4h11a2 2 0 0 1 2 2v12a2 2 0 0 0 2 2H8a2 2 0 0 1-2-2z" />
          <path d="M9.5 9h6M9.5 13h6" />
          <circle cx="16" cy="18" r="2.4" fill={c} stroke="none" />
        </>
      );
  }
}

/** The relic seal: a shield in the family colour with the family glyph. */
export function RelicSeal(props: { family: RelicFamily; size?: number; class?: string }) {
  const size = props.size ?? 28;
  const c = FAMILY_COLOR[props.family];
  return (
    <svg
      class={props.class}
      width={size}
      height={size}
      viewBox="0 0 32 32"
      aria-hidden="true"
      data-family={props.family}
    >
      <path
        d="M16 1.8 28 6.6v10.1c0 6.2-4.9 10.5-12 13.5C8.9 27.2 4 22.9 4 16.7V6.6z"
        fill={c}
        fill-opacity="0.16"
        stroke={c}
        stroke-width="1.6"
        stroke-linejoin="round"
      />
      <g
        transform="translate(4 4.5)"
        fill="none"
        stroke={c}
        stroke-width="1.8"
        stroke-linecap="round"
        stroke-linejoin="round"
      >
        <FamilyGlyph family={props.family} color={c} />
      </g>
    </svg>
  );
}

/** Seal and family name in the family colour, as a small chip. */
export function FamilyChip(props: { family: RelicFamily }) {
  return (
    <span
      class="family-chip"
      data-family={props.family}
      style={{ '--family': FAMILY_COLOR[props.family] }}
    >
      {FAMILY_NAME[props.family]}
    </span>
  );
}
