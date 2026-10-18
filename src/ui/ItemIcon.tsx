function hash(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function seeded(seed: number): () => number {
  let s = seed || 1;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

export function ItemIcon({ id, size = 26 }: { id: string; size?: number }) {
  const rnd = seeded(hash(id));
  const n = 4 + Math.floor(rnd() * 3);
  const pts: [number, number][] = [];
  const base = rnd() * Math.PI * 2;
  for (let i = 0; i < n; i++) {
    const a = base + (i / n) * Math.PI * 2 + (rnd() - 0.5) * 0.6;
    const r = 6 + rnd() * 7;
    pts.push([16 + Math.cos(a) * r, 16 + Math.sin(a) * r]);
  }
  const closed = rnd() > 0.35;
  const d = pts
    .map((p, i) => `${i === 0 ? 'M' : 'L'}${p[0].toFixed(1)} ${p[1].toFixed(1)}`)
    .join(' ');
  const spoke = pts[Math.floor(rnd() * n)];
  const dot = pts[Math.floor(rnd() * n)];
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      stroke="currentColor"
      stroke-width="1.6"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
    >
      <path d={closed ? `${d} Z` : d} />
      <path d={`M16 16L${spoke[0].toFixed(1)} ${spoke[1].toFixed(1)}`} stroke-opacity=".6" />
      <circle cx={dot[0]} cy={dot[1]} r="2" fill="currentColor" stroke="none" />
      <circle cx="16" cy="16" r="1.4" fill="currentColor" stroke="none" />
    </svg>
  );
}
