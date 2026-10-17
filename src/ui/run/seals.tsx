// A hand-made court's heraldry, drawn in code (3B): a round seal whose field is divided between the
// court's two colours and which carries one emblem, and a portrait plate that frames the court's
// 3D figure. Nothing here is an image file.
import type { ComponentChildren } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import type { CourtDef, CourtEmblem } from '../../sim';
import { PieceGlyph } from '../pieces';

/** Emblems on a 100 x 100 plate, centred: the main shapes take the charge colour, cut-outs the dark. */
const CUT = 'rgba(10, 8, 6, 0.55)';
const EMBLEMS: Record<CourtEmblem, () => ComponentChildren> = {
  bell: () => (
    <>
      <circle cx="50" cy="22" r="3.5" />
      <path d="M50 25c-10 0-16 8-16 18v9l-6 9h44l-6-9V43c0-10-6-18-16-18z" />
      <circle cx="50" cy="68" r="4.5" />
      <path
        d="M43 36c3-4 7-6 11-6"
        fill="none"
        stroke={CUT}
        stroke-width="2.4"
        stroke-linecap="round"
      />
    </>
  ),
  lantern: () => (
    <>
      <path d="M41 33c1-9 17-9 18 0" fill="none" stroke-width="3.4" stroke-linecap="round" />
      <path d="M35 33h30l-4 8H39z" />
      <rect x="38" y="41" width="24" height="26" rx="3" />
      <rect x="43" y="46" width="14" height="16" rx="2" fill={CUT} stroke="none" />
      <path d="M50 48c4 4 5 8 0 12c-5-4-4-8 0-12z" stroke="none" />
      <rect x="34" y="67" width="32" height="5" rx="2" />
    </>
  ),
  oak: () => (
    <>
      <path d="M46 78l1-20h6l1 20z" />
      <circle cx="38" cy="47" r="12" />
      <circle cx="62" cy="47" r="12" />
      <circle cx="50" cy="35" r="13" />
      <circle cx="50" cy="52" r="12" />
      <path
        d="M50 70V44M50 56l-7-7M50 50l7-7"
        fill="none"
        stroke={CUT}
        stroke-width="2"
        stroke-linecap="round"
      />
    </>
  ),
  rose: () => (
    <>
      {[0, 1, 2, 3, 4].map((i) => {
        const a = (i * 72 - 90) * (Math.PI / 180);
        return <circle key={i} cx={50 + 15 * Math.cos(a)} cy={50 + 15 * Math.sin(a)} r="11" />;
      })}
      <circle cx="50" cy="50" r="11" fill={CUT} stroke="none" />
      <circle cx="50" cy="50" r="5" stroke="none" />
    </>
  ),
  flame: () => (
    <>
      <path d="M50 18c9 13 19 21 17 36c-1 12-8 21-17 21s-16-9-17-19c-1-8 4-12 7-18c1 6 4 8 6 8c-1-8-1-18 4-28z" />
      <path d="M50 50c4 6 8 10 6 16c-1 4-4 5-6 5s-6-2-6-6c0-5 4-9 6-15z" fill={CUT} stroke="none" />
    </>
  ),
  compass: () => (
    <>
      <circle cx="50" cy="50" r="26" fill="none" stroke-width="3" />
      <path d="M50 18l6 26l26 6l-26 6l-6 26l-6-26l-26-6l26-6z" />
      <circle cx="50" cy="50" r="4" fill={CUT} stroke="none" />
    </>
  ),
  gear: () => (
    <>
      {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
        <rect
          key={i}
          x="45.5"
          y="22"
          width="9"
          height="14"
          rx="1.5"
          transform={`rotate(${i * 45} 50 50)`}
        />
      ))}
      <circle cx="50" cy="50" r="21" />
      <circle cx="50" cy="50" r="9" fill={CUT} stroke="none" />
    </>
  ),
  tower: () => (
    <>
      <path d="M34 22h8v7h5v-7h6v7h5v-7h8v18l-5 4v22l5 4v7H34v-7l5-4V44l-5-4z" />
      <path
        d="M50 58a5.5 5.5 0 0 1 5.5 5.5V74h-11V63.5A5.5 5.5 0 0 1 50 58z"
        fill={CUT}
        stroke="none"
      />
    </>
  ),
  crown: () => (
    <>
      <path d="M26 68l-5-34l15 14l14-22l14 22l15-14l-5 34z" />
      <rect x="26" y="69" width="48" height="7" rx="1.5" />
      <circle cx="21" cy="33" r="3.2" />
      <circle cx="50" cy="24" r="3.2" />
      <circle cx="79" cy="33" r="3.2" />
      <circle cx="40" cy="72.5" r="1.8" fill={CUT} stroke="none" />
      <circle cx="50" cy="72.5" r="1.8" fill={CUT} stroke="none" />
      <circle cx="60" cy="72.5" r="1.8" fill={CUT} stroke="none" />
    </>
  ),
  mirror: () => (
    <>
      <ellipse cx="50" cy="42" rx="19" ry="24" />
      <ellipse cx="50" cy="42" rx="14" ry="19" fill={CUT} stroke="none" />
      <path
        d="M43 36l8-8M42 45l14-14"
        fill="none"
        stroke-width="2.4"
        stroke-linecap="round"
        opacity="0.9"
      />
      <path d="M46 66h8l1 12h-10z" />
      <rect x="40" y="78" width="20" height="5" rx="2" />
    </>
  ),
};

/** The field's division: a shape over the first colour, in the second. */
function Division(props: { kind: CourtDef['seal']['division']; colour: string }) {
  const { kind, colour } = props;
  switch (kind) {
    case 'pale':
      return <rect x="50" y="0" width="50" height="100" fill={colour} />;
    case 'fess':
      return <rect x="0" y="50" width="100" height="50" fill={colour} />;
    case 'chief':
      return <rect x="0" y="0" width="100" height="36" fill={colour} />;
    case 'bend':
      return <path d="M0 24L24 0H100V4L4 100H0z M20 100L100 20V76L76 100z" fill={colour} />;
    case 'quarterly':
      return (
        <>
          <rect x="50" y="0" width="50" height="50" fill={colour} />
          <rect x="0" y="50" width="50" height="50" fill={colour} />
        </>
      );
    default:
      return null;
  }
}

/**
 * A court's seal: the field in its two colours, one emblem in its charge colour with a dark edge so
 * it reads on either half, a bead ring and a soft gloss. The Final's courts get a gold rim.
 */
export function HeraldicSeal(props: {
  court: CourtDef;
  size?: number;
  final?: boolean;
  class?: string;
}) {
  const { court } = props;
  const size = props.size ?? 52;
  const { field, charge, division, emblem } = court.seal;
  const id = `seal-${court.id}`;
  return (
    <svg
      class={`heraldic-seal ${props.final ? 'final' : ''} ${props.class ?? ''}`}
      width={size}
      height={size}
      viewBox="0 0 100 100"
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <clipPath id={`${id}-clip`}>
          <circle cx="50" cy="50" r="43" />
        </clipPath>
        <radialGradient id={`${id}-gloss`} cx="34%" cy="26%" r="75%">
          <stop offset="0" stop-color="#fff" stop-opacity="0.34" />
          <stop offset="0.45" stop-color="#fff" stop-opacity="0" />
          <stop offset="1" stop-color="#000" stop-opacity="0.38" />
        </radialGradient>
      </defs>
      <circle cx="50" cy="50" r="49" fill={props.final ? '#e2bd6a' : '#0d0b09'} />
      <circle cx="50" cy="50" r="46.5" fill="#0d0b09" />
      <circle
        cx="50"
        cy="50"
        r="45"
        fill={field[0]}
        stroke={props.final ? '#e2bd6a' : charge}
        stroke-opacity="0.8"
        stroke-width="1"
      />
      <g clip-path={`url(#${id}-clip)`}>
        <rect width="100" height="100" fill={field[0]} />
        <Division kind={division} colour={field[1]} />
        <rect width="100" height="100" fill={`url(#${id}-gloss)`} />
      </g>
      <circle
        cx="50"
        cy="50"
        r="43"
        fill="none"
        stroke={charge}
        stroke-opacity="0.55"
        stroke-width="1.2"
        stroke-dasharray="0.1 3.4"
        stroke-linecap="round"
      />
      <g
        fill={charge}
        stroke="rgba(8, 6, 4, 0.7)"
        stroke-width="3"
        stroke-linejoin="round"
        style={{ paintOrder: 'stroke' }}
        transform="translate(50 50) scale(0.82) translate(-50 -50)"
      >
        {EMBLEMS[emblem]()}
      </g>
    </svg>
  );
}

/** URLs of portraits already drawn this session, so a screen that comes back shows them at once. */
const drawn = new Map<string, string | null>();
/** Portrait width in image pixels: about twice the largest size shown, so it stays sharp on a phone. */
const PORTRAIT_PX = 320;

/**
 * A court's portrait: its signature piece's own 3D figure (drawn once offscreen by the render layer,
 * in the court's archetype and pose) in an arched niche lit in the seal's colours. Until the figure
 * is drawn, or where WebGL is missing, the plain piece glyph stands in.
 */
export function CourtPortrait(props: {
  court: CourtDef;
  /** Pixels, or a CSS length such as a `var()` (the height follows at 5:4). */
  width?: number | string;
  final?: boolean;
}) {
  const { court } = props;
  const width = props.width ?? 88;
  const key = `${court.portrait.piece}:${court.portrait.style}:${court.portrait.pose}`;
  const [src, setSrc] = useState<string | null>(drawn.get(key) ?? null);
  useEffect(() => {
    if (drawn.has(key)) {
      setSrc(drawn.get(key) ?? null);
      return;
    }
    let live = true;
    const t = setTimeout(() => {
      import('../../render/portraits')
        .then(({ renderCourtPortrait }) => {
          const url = renderCourtPortrait(court.portrait, PORTRAIT_PX);
          drawn.set(key, url);
          if (live) setSrc(url);
        })
        .catch((err) => console.error('A court portrait failed to load', err));
    }, 0);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [key, court.portrait]);
  const [a, b] = court.seal.field;
  return (
    <span
      class={`court-portrait ${props.final ? 'final' : ''}`}
      data-testid="court-portrait"
      data-court={court.id}
      style={{
        '--p-a': a,
        '--p-b': b,
        '--p-charge': court.seal.charge,
        width: typeof width === 'number' ? `${width}px` : width,
        height:
          typeof width === 'number' ? `${Math.round(width * 1.25)}px` : `calc(${width} * 1.25)`,
      }}
      aria-hidden="true"
    >
      {src ? (
        <img src={src} alt="" draggable={false} />
      ) : (
        <PieceGlyph
          piece={court.portrait.piece}
          team="B"
          size={typeof width === 'number' ? Math.round(width * 0.5) : 36}
        />
      )}
    </span>
  );
}
