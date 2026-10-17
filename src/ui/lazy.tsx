// Screens that are not on the title path load as their own chunk, so the first paint parses less
// code. `lazyView` renders nothing until its chunk is in, then the component; `preloadViews`
// fetches them all once the page is idle, so by the time a match starts they are already here.
import type { ComponentType, FunctionComponent } from 'preact';
import { useEffect, useState } from 'preact/hooks';

const loaders: Array<() => Promise<unknown>> = [];

export function lazyView<P extends object>(
  load: () => Promise<ComponentType<P>>,
  name: string,
): FunctionComponent<P> {
  let ready: ComponentType<P> | null = null;
  let pending: Promise<void> | null = null;
  let failed = false;
  const start = (): Promise<void> => {
    pending ??= load()
      .then((c) => {
        ready = c;
        failed = false;
      })
      .catch((err: unknown) => {
        pending = null; // a later render may try again (back online)
        failed = true;
        console.error(`The ${name} screen could not be loaded`, err);
      });
    return pending;
  };
  loaders.push(start);
  return function LazyView(props: P) {
    const [, redraw] = useState(0);
    useEffect(() => {
      if (!ready) void start().then(() => redraw((n) => n + 1));
    }, []);
    const View = ready;
    if (View) return <View {...props} />;
    return failed ? (
      <div class="dim small" role="alert">
        This screen could not load. Check the connection and reload.
      </div>
    ) : null;
  };
}

/** Loads every lazy screen in the background (once the page is idle). */
export function preloadViews(): void {
  const run = (): void => {
    for (const start of loaders) void start();
  };
  // Safari has no requestIdleCallback
  const idle = (window as Partial<Window>).requestIdleCallback;
  if (idle) idle.call(window, run, { timeout: 4000 });
  else window.setTimeout(run, 1500);
}
