import type { School } from '../sim';

export type { School };

export const SCHOOL_ORDER: School[] = [
  'march',
  'initiative',
  'fortress',
  'sacrifice',
  'position',
  'clock',
];

export const SCHOOL_NAME: Record<School, string> = {
  march: 'March',
  initiative: 'Initiative',
  fortress: 'Fortress',
  sacrifice: 'Sacrifice',
  position: 'Position',
  clock: 'Clock',
};

/** School colours: brass, ruby, slate blue, amethyst, baize green, bone. */
export const SCHOOL_COLOR: Record<School, string> = {
  march: '#c9a35a',
  initiative: '#b5475c',
  fortress: '#6f8fb3',
  sacrifice: '#8b6bb8',
  position: '#3d8a63',
  clock: '#cbbd9f',
};

export const SCHOOL_JOB: Record<School, string> = {
  march: 'Push lanes with pawns and pawnlings, break structures',
  initiative: 'Pick off or lock down enemy pieces',
  fortress: 'Hold, absorb, save',
  sacrifice: 'Give something up now for a bigger swing',
  position: 'Reshape the board for a while',
  clock: 'Bend the Tempo economy and gather information',
};

/** Which schools beat each school through their effects (docs/CHESS.md, "Gambit schools"). */
export const COUNTERED_BY: Record<School, School[]> = {
  march: ['fortress', 'position'],
  initiative: ['fortress'],
  fortress: ['sacrifice', 'initiative'],
  sacrifice: ['clock', 'position'],
  position: ['initiative'],
  clock: ['march'],
};

/** The inverse: the schools a school is good against. */
export const COUNTERS: Record<School, School[]> = Object.fromEntries(
  SCHOOL_ORDER.map((s) => [s, SCHOOL_ORDER.filter((o) => COUNTERED_BY[o].includes(s))]),
) as Record<School, School[]>;

export const schoolNames = (list: School[]): string =>
  list.length ? list.map((s) => SCHOOL_NAME[s]).join(', ') : 'none';

/** A simple 24x24 line glyph per school, drawn in the school colour. */
export function SchoolGlyph(props: { school: School; size?: number; class?: string }) {
  const size = props.size ?? 16;
  const c = SCHOOL_COLOR[props.school];
  return (
    <svg
      class={props.class}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={c}
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
      data-school={props.school}
    >
      {props.school === 'march' && (
        <>
          <circle cx="7" cy="6.5" r="2.6" fill={c} stroke="none" />
          <path d="M3.6 18.5c0-3 1.4-5 3.4-5s3.4 2 3.4 5z" fill={c} stroke="none" />
          <path d="M13 12h8M17.6 7.6 22 12l-4.4 4.4" />
        </>
      )}
      {props.school === 'initiative' && (
        <>
          <path d="M4 4l11 11M20 4 9 15" />
          <path d="M13 17l3 3M11 17l-3 3M6.4 17.6l2 2M17.6 17.6l-2 2" />
        </>
      )}
      {props.school === 'fortress' && (
        <path
          d="M5 21V11l1.5-1.5V4h3v2.5h1.5V4h2v2.5h1.5V4h3v5.5L19 11v10zM10 21v-4.5a2 2 0 0 1 4 0V21"
          stroke-width="1.8"
        />
      )}
      {props.school === 'sacrifice' && (
        <>
          <circle cx="12" cy="6" r="3" fill={c} stroke="none" />
          <path d="M7.5 20c0-3.4 1.4-5.6 3.5-6.6" fill={c} />
          <path d="M16.5 20c0-3.4-1.4-5.6-3.5-6.6" />
          <path d="M12.5 10l-2 3 3 1.6-2.2 3.4" stroke-width="1.6" />
          <path d="M5 21h14" />
        </>
      )}
      {props.school === 'position' && (
        <>
          <rect x="3" y="14" width="18" height="7" rx="1" />
          <path d="M7 14V3.5M7 3.5l9 3-9 3" fill={c} />
        </>
      )}
      {props.school === 'clock' && (
        <>
          <circle cx="12" cy="12" r="9" />
          <path d="M12 6.5V12l3.6 2.2" />
        </>
      )}
    </svg>
  );
}

/** Glyph and name in the school colour, as a small chip. */
export function SchoolChip(props: { school: School; glyph?: number }) {
  return (
    <span
      class="school-chip"
      data-school={props.school}
      style={{ '--school': SCHOOL_COLOR[props.school] }}
    >
      <SchoolGlyph school={props.school} size={props.glyph ?? 13} />
      {SCHOOL_NAME[props.school]}
    </span>
  );
}
