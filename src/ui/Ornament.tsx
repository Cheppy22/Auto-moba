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
