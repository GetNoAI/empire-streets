/*
 * Service worker: makes the game installable (Add to Home Screen) and playable offline once
 * everything has been fetched. The app shell is network-first (so a new build shows up as soon as
 * you're online); models, music and textures are cache-first (they never change under a name).
 */
const VERSION = 'es-v1';
const SHELL = ['./', './index.html', './manifest.webmanifest'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;
  const asset = /\.(glb|mp3|png|jpg|webp|woff2?|wasm)$/.test(url.pathname) || /\/assets\//.test(url.pathname);
  if (asset) {
    // Cache-first: hashed bundles and media never change under the same name.
    e.respondWith(caches.open(VERSION).then(async (c) => (await c.match(req)) ?? fetch(req).then((r) => (r.ok && c.put(req, r.clone()), r))));
  } else {
    // Network-first for the shell and JSON, falling back to what we have offline.
    e.respondWith(
      fetch(req)
        .then((r) => {
          if (r.ok) caches.open(VERSION).then((c) => c.put(req, r.clone()));
          return r;
        })
        .catch(() => caches.match(req).then((r) => r ?? caches.match('./index.html'))),
    );
  }
});
