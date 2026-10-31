// Service worker. Build-time placeholders in the two constants below are filled in by vite.config.ts,
// so every build gets its own cache and old caches are removed on activate.
const VERSION = '__BUILD_VERSION__';
const PRECACHE = __PRECACHE__;
const SHELL = `tsl-shell-${VERSION}`;
const DATA = 'tsl-data';

self.addEventListener('install', (event) => {
  // No skipWaiting here: the page shows "update available" and asks us to take over.
  event.waitUntil(caches.open(SHELL).then((c) => c.addAll(PRECACHE)));
});

self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      for (const key of await caches.keys()) {
        if (key !== SHELL && key !== DATA) await caches.delete(key);
      }
      await self.clients.claim();
    })(),
  );
});

async function networkFirst(request, timeoutMs) {
  const cache = await caches.open(DATA);
  try {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), timeoutMs);
    const res = await fetch(request, { cache: 'no-cache', signal: ctl.signal });
    clearTimeout(t);
    if (res.ok) cache.put(request, res.clone());
    return res;
  } catch (err) {
    const hit = await cache.match(request);
    if (hit) return hit;
    throw err;
  }
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  const path = url.pathname;

  // Clips are cached by the app in IndexedDB; keep the worker out of video range requests.
  if (path.includes('/clips/')) return;

  if (path.includes('/data/') || path.endsWith('/content-source.json')) {
    event.respondWith(networkFirst(req, 4000));
    return;
  }

  event.respondWith(
    (async () => {
      const cache = await caches.open(SHELL);
      const hit = (await cache.match(req, { ignoreSearch: true })) || (req.mode === 'navigate' ? await cache.match('./') : undefined);
      if (hit) return hit;
      try {
        const res = await fetch(req);
        if (res.ok) cache.put(req, res.clone());
        return res;
      } catch (err) {
        // Offline and the saved copy of the app is gone (storage was cleared): say so instead of a browser error page.
        if (req.mode === 'navigate') {
          return new Response(
            '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width"><body style="font-family:system-ui;padding:24px"><h1>TSL Learn</h1><p id="sw-offline">The saved copy of the app was cleared and you are offline. Connect to the internet once and reload to restore it. Your progress is not affected.</p>',
            { status: 503, headers: { 'content-type': 'text/html; charset=utf-8' } },
          );
        }
        throw err;
      }
    })(),
  );
});
