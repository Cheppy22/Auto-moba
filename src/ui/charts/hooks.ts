import { useEffect, useRef, useState } from 'preact/hooks';

/** Width of an element in CSS pixels, kept current with a ResizeObserver. */
export function useWidth<T extends HTMLElement>(fallback = 0): [{ current: T | null }, number] {
  const ref = useRef<T | null>(null);
  const [w, setW] = useState(fallback);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const read = (): void => setW(Math.floor(el.getBoundingClientRect().width));
    read();
    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', read);
      return () => window.removeEventListener('resize', read);
    }
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, w];
}

let counter = 0;
/** A stable id for SVG defs (clip paths) in one chart instance. */
export function useUid(prefix: string): string {
  const [id] = useState(() => `${prefix}${++counter}`);
  return id;
}
