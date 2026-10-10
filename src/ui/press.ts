/**
 * Long-press for touch and mouse. The state lives at module level because the HUD re-renders
 * every few frames: the handlers of the render that saw the pointer go down are not the ones
 * that see the click, so the "a long press already fired" flag cannot live in a closure.
 */
const HOLD_MS = 450;
let timer = 0;
let fired = false;

type PressEvent = { preventDefault(): void };

export function longPress(onLong: () => void): {
  onPointerDown: () => void;
  onPointerUp: () => void;
  onPointerLeave: () => void;
  onPointerCancel: () => void;
  onContextMenu: (e: PressEvent) => void;
} {
  const stop = (): void => window.clearTimeout(timer);
  return {
    onPointerDown: () => {
      fired = false;
      stop();
      timer = window.setTimeout(() => {
        fired = true;
        onLong();
      }, HOLD_MS);
    },
    onPointerUp: stop,
    onPointerLeave: stop,
    onPointerCancel: stop,
    // Right-click on desktop does the same as a hold; on a phone the long-press timer has already
    // fired by the time the browser asks for its menu, so this only suppresses the menu.
    onContextMenu: (e) => {
      e.preventDefault();
      if (fired) return;
      stop();
      fired = true;
      onLong();
    },
  };
}

/** True once after a long press fired: the click that follows it must do nothing. */
export function longPressed(): boolean {
  const was = fired;
  fired = false;
  return was;
}
