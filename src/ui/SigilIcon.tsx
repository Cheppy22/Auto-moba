import { useEffect, useRef } from 'preact/hooks';
import { drawSigil, teamColor, type SigilSpec } from '../render';

export function SigilIcon(props: {
  spec: SigilSpec;
  team?: string;
  size?: number;
  alive?: boolean;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const size = props.size ?? 36;
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const g = c.getContext('2d');
    if (!g) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    c.width = size * dpr;
    c.height = size * dpr;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, size, size);
    drawSigil(
      g,
      size / 2,
      size / 2,
      size / 2 - 2,
      props.spec,
      teamColor(props.team ?? 'A'),
      props.alive ?? true,
    );
  }, [props.spec, props.team, size, props.alive]);
  return <canvas ref={ref} style={{ width: `${size}px`, height: `${size}px` }} />;
}
