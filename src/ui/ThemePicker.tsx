import { useEffect, useState } from 'preact/hooks';
import { inkStyle, setInkStyle, subscribeInkStyle } from './inkStyle';
import { THEMES, mapTheme, setMapTheme, subscribeMapTheme } from './mapTheme';

/**
 * The board theme switch (Title and Adjourn): Slate garden or Lamplit parterre, each shown with a
 * swatch of its floor, felt and paths, and the "Ink style" switch (ink lines and paper grain on the
 * board). Both are remembered between visits; a match in progress repaints at once.
 */
export function ThemePicker() {
  const [theme, setLocal] = useState(mapTheme);
  const [ink, setInk] = useState(inkStyle);
  useEffect(() => subscribeMapTheme(() => setLocal(mapTheme())), []);
  useEffect(() => subscribeInkStyle(() => setInk(inkStyle())), []);
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
      <button
        type="button"
        role="switch"
        aria-checked={ink}
        class={`theme-opt ink-opt ${ink ? 'on' : ''}`}
        data-testid="ink-toggle"
        title="Ink lines and paper grain on the board"
        onClick={() => setInkStyle(!ink)}
      >
        <i class="theme-swatch ink-swatch" aria-hidden="true" />
        <span>Ink style</span>
      </button>
    </div>
  );
}
