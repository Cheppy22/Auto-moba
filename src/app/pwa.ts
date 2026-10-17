// Registers the service worker (production builds only; the dev server and Playwright run without
// one) and turns "a new version finished downloading" into the update prompt.
import { offerUpdate } from '../ui/update';

const RECHECK_MS = 60 * 60 * 1000;

export function registerServiceWorker(): void {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return;
  const sw = navigator.serviceWorker;
  // the swap is only reloaded for when the player asked for it, never for the first install taking control
  let reloadOnSwap = false;
  sw.addEventListener('controllerchange', () => {
    if (reloadOnSwap) window.location.reload();
  });

  const ready = (worker: ServiceWorker): void =>
    offerUpdate(() => {
      reloadOnSwap = true;
      worker.postMessage({ type: 'SKIP_WAITING' });
    });

  window.addEventListener('load', () => {
    sw.register('./sw.js', { updateViaCache: 'none' })
      .then((reg) => {
        // an update already downloaded in an earlier visit
        if (reg.waiting && sw.controller) ready(reg.waiting);
        reg.addEventListener('updatefound', () => {
          const next = reg.installing;
          next?.addEventListener('statechange', () => {
            if (next.state === 'installed' && sw.controller) ready(next);
          });
        });
        const check = (): void => {
          reg.update().catch(() => undefined); // offline: try again later
        };
        document.addEventListener('visibilitychange', () => {
          if (document.visibilityState === 'visible') check();
        });
        window.setInterval(check, RECHECK_MS);
      })
      .catch((err: unknown) => {
        console.error(
          'The service worker could not be registered; the game still works online.',
          err,
        );
      });
  });
}
