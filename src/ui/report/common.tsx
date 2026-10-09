import { useEffect, useRef, useState } from 'preact/hooks';
import type { Content, PieceId } from '../../sim';
import { n0 } from '../format';

export const heroName = (c: Content, def: string): string =>
  c.pieceById.get(def as PieceId)?.name ?? def;

export const itemName = (c: Content, id: string): string =>
  c.itemById.get(id)?.name ?? c.cursedById.get(id)?.name ?? c.holyById.get(id)?.name ?? id;

export function Num(props: { value: number; skip: boolean }) {
  const [shown, setShown] = useState(props.skip ? props.value : 0);
  const ref = useRef(0);
  useEffect(() => {
    if (props.skip) {
      setShown(props.value);
      return;
    }
    const start = performance.now();
    const dur = 650;
    const tick = (now: number): void => {
      const f = Math.min(1, (now - start) / dur);
      setShown(props.value * (1 - Math.pow(1 - f, 3)));
      if (f < 1) ref.current = requestAnimationFrame(tick);
    };
    ref.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(ref.current);
  }, [props.value, props.skip]);
  return <span>{n0(shown)}</span>;
}
