// A bare view of every court's heraldry for screenshots: the browser test imports this module
// through the dev server and mounts the sheet over the app's own styles (it is not part of the game).
import { render } from 'preact';
import { loadBrowserContent } from '../../../src/app/content';
import { roundName } from '../../../src/sim';
import { CourtPortrait } from '../../../src/ui/run/seals';
import { CourtSeal } from '../../../src/ui/run/parts';

export function mountSheet(el: HTMLElement): void {
  const c = loadBrowserContent();
  render(
    <div class="seal-sheet">
      {c.courts.map((court) => (
        <figure key={court.id} class="sheet-court" data-court={court.id}>
          <div class="sheet-art">
            <CourtPortrait court={court} width={128} final={court.round === 4} />
            <CourtSeal name={court.name} court={court} final={court.round === 4} size={72} />
          </div>
          <figcaption>
            <span>{roundName(c, court.round - 1)}</span>
            <b>{court.name}</b>
            <i>{court.motto}</i>
          </figcaption>
        </figure>
      ))}
    </div>,
    el,
  );
}
