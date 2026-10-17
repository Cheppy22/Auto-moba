import { useId } from 'preact/hooks';
import type { RelicFamily } from '../sim';
import { FAMILY_COLOR } from './relics';

/**
 * The relic draft card's art: an engraved brass medallion with an enamel disc in the family
 * colour and the family's emblem in ink and brass. One emblem per family, drawn by code like
 * every other mark in the game (no image files).
 */

const INK = '#1d140d';
const PAPER = '#eadcb8';

/** A pawn standing on (x, base), `k` its scale. */
const pawn = (x: number, base: number, k: number): string => {
  const w = 9 * k;
  const h = 20 * k;
  const head = 4.6 * k;
  const top = base - h;
  return [
    `M${x - w} ${base}h${2 * w}`,
    `c0-${3 * k} -${2 * k}-${5 * k} -${4.4 * k}-${6.4 * k}`,
    `c${1.6 * k}-${1.4 * k} ${2.4 * k}-${3.4 * k} ${2.4 * k}-${5.6 * k}`,
    `h-${2 * (w - 2.4 * k) - 4 * k}`,
    `c0 ${2.2 * k} ${0.8 * k} ${4.2 * k} ${2.4 * k} ${5.6 * k}`,
    `C${x - w + 2.4 * k} ${base - 3 * k} ${x - w} ${base - 1 * k} ${x - w} ${base}z`,
    `M${x} ${top + head * 2 + 1.5 * k}a${head} ${head} 0 1 1 0.01 0z`,
  ].join('');
};

function Emblem(props: { family: RelicFamily; id: string }) {
  const brass = `url(#${props.id}-brass)`;
  const stroke = { stroke: INK, 'stroke-width': 2.4, 'stroke-linejoin': 'round' as const };
  switch (props.family) {
    case 'lane':
      // a file running away from you, its centre line, and a pennant planted at the far end
      return (
        <>
          <path d="M33 74 44 30h8l11 44z" fill={PAPER} fill-opacity="0.18" {...stroke} />
          <path
            d="M48 70v-6M48 58v-5M48 48v-4M48 40v-3"
            stroke={brass}
            stroke-width="3"
            stroke-linecap="round"
          />
          <path d="M52 31V13" {...stroke} stroke-linecap="round" />
          <path d="M52 13l13 4.5-13 4.5z" fill={brass} {...stroke} stroke-width="2" />
          <path
            d="M38 82l10-6 10 6"
            fill="none"
            {...stroke}
            stroke={brass}
            stroke-width="3"
            stroke-linecap="round"
          />
        </>
      );
    case 'carry':
      // a crown with three jewels over a raised plinth
      return (
        <>
          <path d="M28 60 25 34l12 10 11-17 11 17 12-10-3 26z" fill={brass} {...stroke} />
          <path d="M29 63h38v7H29z" fill={brass} {...stroke} />
          <circle cx="48" cy="26" r="3.6" fill={PAPER} {...stroke} stroke-width="2" />
          <circle cx="25" cy="33" r="3" fill={PAPER} {...stroke} stroke-width="2" />
          <circle cx="71" cy="33" r="3" fill={PAPER} {...stroke} stroke-width="2" />
          <path d="M48 47l4 5-4 5-4-5z" fill={INK} />
          <path d="M34 76h28" {...stroke} stroke-linecap="round" />
        </>
      );
    case 'pawns':
      // three pawns shoulder to shoulder, the middle one forward
      return (
        <>
          <path
            d={pawn(29, 70, 1.15)}
            fill={PAPER}
            fill-opacity="0.85"
            {...stroke}
            stroke-width="2"
          />
          <path
            d={pawn(67, 70, 1.15)}
            fill={PAPER}
            fill-opacity="0.85"
            {...stroke}
            stroke-width="2"
          />
          <path d={pawn(48, 75, 1.5)} fill={brass} {...stroke} />
          <path d="M22 78h52" {...stroke} stroke-linecap="round" />
        </>
      );
    case 'siege':
      // a crenellated Bastion with its gate, split by a bright crack
      return (
        <>
          <path
            d="M33 76V42h-3v-11h7v5h5v-5h5v5h5v-5h5v5h5v-5h7v11h-3v34z"
            fill={PAPER}
            fill-opacity="0.2"
            {...stroke}
          />
          <path d="M42 76v-10a6 6 0 0 1 12 0v10" fill={INK} />
          <path d="M33 50h30M33 60h30" stroke={INK} stroke-width="1.4" stroke-opacity="0.6" />
          <path
            d="M57 33l-5 9 6 4-6 9 4 3"
            fill="none"
            stroke={brass}
            stroke-width="3.2"
            stroke-linecap="round"
            stroke-linejoin="round"
          />
          <path d="M26 80h44" {...stroke} stroke-linecap="round" />
        </>
      );
    case 'orders':
      // a card held behind a sealed order
      return (
        <>
          <path d="M37 22l23 4-6 36-23-4z" fill={brass} {...stroke} stroke-width="2" />
          <path d="M26 38h44v32H26z" fill={PAPER} {...stroke} />
          <path d="M26 38l22 17 22-17" fill="none" {...stroke} stroke-width="2" />
          <circle cx="48" cy="61" r="7.5" fill="#b8392c" {...stroke} stroke-width="2" />
          <path
            d="M48 56.5l1.4 2.9 3.1.4-2.3 2.2.6 3.1-2.8-1.5-2.8 1.5.6-3.1-2.3-2.2 3.1-.4z"
            fill={PAPER}
          />
        </>
      );
  }
}

/** The medallion: brass bezel with ticks, ink ring, enamel disc and the family emblem. */
export function RelicEmblem(props: { family: RelicFamily; size?: number; class?: string }) {
  const size = props.size ?? 88;
  const c = FAMILY_COLOR[props.family];
  const id = `rart-${props.family}-${useId().replace(/[^a-zA-Z0-9-]/g, '')}`;
  const ticks = Array.from({ length: 36 }, (_, i) => i * 10);
  return (
    <svg
      class={props.class}
      width={size}
      height={size}
      viewBox="0 0 96 96"
      aria-hidden="true"
      data-family={props.family}
    >
      <defs>
        <linearGradient id={`${id}-brass`} x1="0" y1="0" x2="0.4" y2="1">
          <stop offset="0" stop-color="#fbe7a6" />
          <stop offset="0.45" stop-color="#d4ae62" />
          <stop offset="1" stop-color="#7a6330" />
        </linearGradient>
        <radialGradient id={`${id}-enamel`} cx="0.42" cy="0.36" r="0.7">
          <stop offset="0" stop-color={c} stop-opacity="1" />
          <stop offset="0.65" stop-color={c} stop-opacity="0.72" />
          <stop offset="1" stop-color="#140e09" stop-opacity="0.9" />
        </radialGradient>
      </defs>
      <circle cx="48" cy="48" r="47" fill={`url(#${id}-brass)`} />
      <circle cx="48" cy="48" r="47" fill="none" stroke={INK} stroke-opacity="0.55" />
      <g stroke={INK} stroke-opacity="0.5" stroke-width="1.1">
        {ticks.map((a) => (
          <line
            key={a}
            x1="48"
            y1="3"
            x2="48"
            y2={a % 90 === 0 ? 8.5 : 6.5}
            transform={`rotate(${a} 48 48)`}
          />
        ))}
      </g>
      <circle cx="48" cy="48" r="40.5" fill={INK} />
      <circle cx="48" cy="48" r="38" fill={`url(#${id}-enamel)`} />
      <circle
        cx="48"
        cy="48"
        r="31"
        fill="none"
        stroke={PAPER}
        stroke-opacity="0.16"
        stroke-dasharray="1.5 3"
      />
      <Emblem family={props.family} id={id} />
      <path
        d="M20 30a33 33 0 0 1 22-18"
        fill="none"
        stroke="white"
        stroke-opacity="0.28"
        stroke-width="2.4"
        stroke-linecap="round"
      />
    </svg>
  );
}
