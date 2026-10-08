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

export function HpRing(props: {
  /** Pixels; leave out to size it with CSS (`--sz`). */
  size?: number;
  frac: number;
  color: string;
  alive?: boolean;
  children: preact.ComponentChildren;
}) {
  const f = Math.max(0, Math.min(1, props.frac));
  return (
    <div
      class={`hpring ${props.alive === false ? 'dead' : ''}`}
      style={{
        ...(props.size ? { '--sz': `${props.size}px` } : {}),
        '--f': `${f * 360}deg`,
        '--c': props.color,
      }}
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
