import { useEffect, useState } from 'preact/hooks';

export type Layout = 'desktop' | 'portrait' | 'landscape';

export function detectLayout(w: number, h: number): Layout {
  if (w <= 720 && h > w) return 'portrait';
  if (h <= 500 && w > h) return 'landscape';
  return 'desktop';
}

export function useLayout(): Layout {
  const read = (): Layout => detectLayout(window.innerWidth, window.innerHeight);
  const [layout, setLayout] = useState<Layout>(read);
  useEffect(() => {
    const on = (): void => setLayout(read());
    window.addEventListener('resize', on);
    window.addEventListener('orientationchange', on);
    return () => {
      window.removeEventListener('resize', on);
      window.removeEventListener('orientationchange', on);
    };
  }, []);
  return layout;
}
