// FLOOR service worker (v2 — multi-file build)
// The app shell is now index.html + styles.css + js modules. Everything
// same-origin and code-like (html/css/js) is fetched NETWORK-FIRST so a new
// push is picked up on the next online load — the cache only serves as the
// offline fallback. Icons/manifest are cache-first. Project data lives in
// IndexedDB / Supabase and is never touched here.

const CACHE = 'floor-shell-v106';
const SHELL = [
  './',
  './index.html',
  './tokens.css',
  './styles.css',
  './ui2.css',
  './fonts/Geist-Variable.woff2',
  './fonts/GeistMono-Variable.woff2',
  './js/00-theme.js',
  './js/00-catalog.js',
  './js/00-icons.js',
  './js/01-state-render.js',
  './js/02-selection.js',
  './js/03-input.js',
  './js/04-ui.js',
  './js/05-app.js',
  './js/06-tabs.js',
  './js/07-share.js',
  './js/08-native.js',
  './js/09-budget.js',
  './js/10-docs.js',
  './js/11-shotlist.js',
  './js/12-media.js',
  './js/13-rooms.js',
  './js/14-templates.js',
  './js/15-atelier.js',
  './js/16-tour.js',
  './js/17-ui2.js',
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
    // cache under the bare path: ?view= / ?join= tokens never land in Cache Storage
    const key = new Request(url.origin + url.pathname);
    e.respondWith(
      // cache:'no-cache' forces revalidation with the SERVER — without it,
      // Safari answers this fetch from its own HTTP cache and "network-first"
      // quietly becomes "stale-first" (the eternal old-version bug)
      fetch(e.request, {cache: 'no-cache'})
        .then(res => {
          if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(key, copy)); }
          return res;
        })
        .catch(() =>
          caches.match(key).then(hit =>
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
