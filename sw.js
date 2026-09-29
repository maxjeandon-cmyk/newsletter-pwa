/* sw.js v17 — Service worker de la PWA Newsletter.
 * Stratégies : data/ et editions/ network-first (toujours frais en ligne, repli cache hors ligne) ;
 * le reste (coquille, js/, styles) cache-first pour un démarrage instantané.
 * À chaque déploiement de code : incrémenter CACHE (v17 → v18…) pour invalider les caches clients. */
const CACHE = 'newsletter-v17';
const ASSETS = [
  './',
  './index.html',
  './styles.css',
  './manifest.webmanifest',
  './icons/icon.svg',
  './js/core.js',
  './js/feeds.js',
  './js/views.js',
  './js/app.js',
  './data/chapters.json',
  './data/medias.json'
];
self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (url.origin !== location.origin) return; /* relais RSS et liens externes : hors périmètre */
  const frais = url.pathname.includes('editions/') || url.pathname.includes('/data/');
  if (frais) {
    e.respondWith(fetch(e.request).then(r => {
      const copie = r.clone();
      caches.open(CACHE).then(c => c.put(e.request, copie)).catch(() => {});
      return r;
    }).catch(() => caches.match(e.request)));
  } else {
    e.respondWith(caches.match(e.request).then(r => r || fetch(e.request)));
  }
});
