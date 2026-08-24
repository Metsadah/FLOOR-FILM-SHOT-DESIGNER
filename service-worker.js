// FLOOR service worker (v2 — multi-file build)
// The app shell is now index.html + styles.css + js modules. Everything
// same-origin and code-like (html/css/js) is fetched NETWORK-FIRST so a new
// push is picked up on the next online load — the cache only serves as the
// offline fallback. Icons/manifest are cache-first. Project data lives in
// IndexedDB / Supabase and is never touched here.

const CACHE = 'floor-shell-v47';
const SHELL = [
  './',
  './index.html',
  './styles.css',
  './js/00-catalog.js',
  './js/01-state-render.js',
  './js/02-selection.js',
  './js/03-input.js',
  './js/04-ui.js',
  './js/05-app.js',
  './js/06-tabs.js',
  './js/07-share.js',
  './js/vendor/supabase.js',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  if (url.origin !== location.origin) return;

  const p = url.pathname;
  const codeLike = e.request.mode === 'navigate' ||
    p.endsWith('.html') || p.endsWith('/') || p.endsWith('.js') || p.endsWith('.css');

  if (codeLike) {
    e.respondWith(
      fetch(e.request)
        .then(res => {
          const copy = res.clone();
          caches.open(CACHE).then(c => c.put(e.request, copy));
          return res;
        })
        .catch(() =>
          caches.match(e.request).then(hit =>
            hit || (e.request.mode === 'navigate' ? caches.match('./index.html') : undefined)
          )
        )
    );
  } else {
    e.respondWith(
      caches.match(e.request).then(hit => hit || fetch(e.request))
    );
  }
});
