export function Butterfly({ size = 18 }: { size?: number }) {
  return (
    <svg
      class="butterfly"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      aria-hidden="true"
      fill="currentColor"
    >
      <path d="M12 7c-1.2-2.6-4.4-4.8-7.6-4.4C2 2.9 1.6 5.6 2.6 8c1 2.3 3.4 3.6 6 3.8-2.6.6-4.6 2.4-4.4 4.6.2 2.4 2.8 3.6 5 2.6 1.4-.6 2.3-2 2.8-3.4.5 1.4 1.4 2.8 2.8 3.4 2.2 1 4.8-.2 5-2.6.2-2.2-1.8-4-4.4-4.6 2.6-.2 5-1.5 6-3.8 1-2.4.6-5.1-1.8-5.4C16.4 2.2 13.2 4.4 12 7z" />
      <rect x="11.4" y="6" width="1.2" height="12" rx="0.6" fill="#0b0a10" />
    </svg>
  );
}

export function Divider() {
  return (
    <div class="ornament" aria-hidden="true">
      <Butterfly />
    </div>
  );
}

export function Seal({ text = '対価' }: { text?: string }) {
  return (
    <div class="seal" aria-label="price" title="対価: the price paid for every wish">
      {text}
    </div>
  );
}

export function Icon({
  name,
  size = 20,
}: {
  name: 'base' | 'keeper' | 'shop' | 'farm';
  size?: number;
}) {
  if (name === 'keeper') return <Butterfly size={size} />;
  const common = {
    class: 'ico',
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    'stroke-width': 1.7,
    'stroke-linecap': 'round' as const,
    'stroke-linejoin': 'round' as const,
    'aria-hidden': true,
  };
  if (name === 'base')
    return (
      <svg {...common}>
        <path d="M3 11l9-7 9 7" />
        <path d="M5 10v10h14V10" />
        <path d="M10 20v-6h4v6" />
      </svg>
    );
  if (name === 'shop')
    return (
      <svg {...common}>
        <path d="M5 8h14l-1.2 12H6.2z" />
        <path d="M9 8V6a3 3 0 0 1 6 0v2" />
      </svg>
    );
  return (
    <svg {...common}>
      <path d="M5 19C5 10 10 5 20 4c0 10-5 15-14 15" />
      <path d="M5 19c3-5 6-8 11-11" />
    </svg>
  );
}

export function HpRing(props: {
  size: number;
  frac: number;
  color: string;
  alive?: boolean;
  me?: boolean;
  children: preact.ComponentChildren;
}) {
  const f = Math.max(0, Math.min(1, props.frac));
  return (
    <div
      class={`hpring ${props.me ? 'me' : ''} ${props.alive === false ? 'dead' : ''}`}
      style={{ '--sz': `${props.size}px`, '--f': `${f * 360}deg`, '--c': props.color }}
    >
      <div class="in">{props.children}</div>
    </div>
  );
}

export function RitualRing(props: { class?: string }) {
  return (
    <svg
      class={props.class}
      viewBox="-100 -100 200 200"
      fill="none"
      stroke="#c4a8f0"
      stroke-width=".35"
      aria-hidden="true"
    >
      <circle r="96" />
      <circle r="90" stroke-dasharray="1 3" />
      <circle r="62" />
      <circle r="30" />
      <path d="M0-62L53.7 31H-53.7Z M0 62L53.7-31H-53.7Z" />
      <path d="M0-96V96M-96 0H96M-68-68L68 68M68-68L-68 68" stroke-dasharray="2 4" />
    </svg>
  );
}
