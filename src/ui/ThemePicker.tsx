import { useEffect, useState } from 'preact/hooks';
import { THEMES, mapTheme, setMapTheme, subscribeMapTheme } from './mapTheme';

/**
 * The board theme switch (Title and Adjourn): Slate garden or Lamplit parterre, each shown with a
 * swatch of its floor, felt and paths. The choice is remembered between visits; a match in progress
 * repaints at once.
 */
export function ThemePicker() {
  const [theme, setLocal] = useState(mapTheme);
  useEffect(() => subscribeMapTheme(() => setLocal(mapTheme())), []);
  return (
    <div class="theme-pick" role="radiogroup" aria-label="Board theme" data-testid="theme-picker">
      <span class="theme-pick-label">Board</span>
      {THEMES.map((t) => (
        <button
          key={t.id}
          type="button"
          role="radio"
          aria-checked={theme === t.id}
          class={`theme-opt ${theme === t.id ? 'on' : ''}`}
          data-testid={`theme-${t.id}`}
          onClick={() => setMapTheme(t.id)}
        >
          <i class={`theme-swatch theme-swatch-${t.id}`} aria-hidden="true" />
          <span>{t.name}</span>
        </button>
      ))}
    </div>
  );
}
