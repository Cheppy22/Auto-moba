/* global self, caches, fetch, URL, Request, Response */
// Service worker: keeps the built game on the device so it starts offline.
//
// This file is a template. At build time (vite.config.ts, plugin "automoba-sw") VERSION becomes a
// hash of every shipped file and PRECACHE the list of those files (paths relative to this file), and
// the result is written to dist/sw.js. A new build therefore always makes a byte-different sw.js,
// which is what makes the browser install the update.
//
// Rules:
// - Everything in PRECACHE is cached on install, in a cache named for VERSION.
// - Pages and files are answered from the cache first; the network is only used for what is not
//   cached. Nothing else is cached at runtime.
// - An updated worker waits; the page asks it to take over (the "New version" prompt), so a match is
//   never swapped out from under the player. The first-ever install activates at once.
// - It lives in the folder it is served from (/ locally, /v2/ on GitHub Pages) and handles only
//   that folder's requests.

const VERSION = '__VERSION__';
const PRECACHE = ['__PRECACHE__'];
const PREFIX = 'automoba-';
const CACHE = PREFIX + VERSION;
const INDEX = new URL('index.html', self.registration.scope).href;

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) =>
      // "reload" so a stale HTTP cache entry can never be stored under the new version
      cache.addAll(
        PRECACHE.map(
          (path) => new Request(new URL(path, self.registration.scope), { cache: 'reload' }),
        ),
      ),
    ),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.filter((k) => k.startsWith(PREFIX) && k !== CACHE).map((k) => caches.delete(k)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  event.respondWith(answer(req));
});

async function answer(req) {
  const cache = await caches.open(CACHE);
  // any page address in this folder (with or without ?map=... and the like) is the one app page
  const hit = req.mode === 'navigate' ? await cache.match(INDEX) : await cache.match(req);
  if (hit) return hit;
  try {
    return await fetch(req);
  } catch {
    return new Response('Offline, and this file is not stored on the device.', {
      status: 503,
      headers: { 'Content-Type': 'text/plain' },
    });
  }
}
