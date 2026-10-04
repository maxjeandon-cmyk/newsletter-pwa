/* sw.js v66 — Service worker de la PWA Newsletter.
 * Stratégies : data/ et editions/ network-first (toujours frais en ligne, repli cache hors ligne) ;
 * le reste (coquille, js/, styles) cache-first pour un démarrage instantané.
 * À chaque déploiement de code : incrémenter CACHE (v22 → v23…) pour invalider les caches clients. */
const CACHE = 'newsletter-v72';
const ASSETS = [
  './',
  './index.html',
  './styles.css',
  './manifest.webmanifest',
  './icons/icon.svg',
  './js/core.js',
  './js/onglets.js',
  './js/feeds.js',
  './js/github.js',
  './js/views.js',
  './js/views/common.js',
  './js/views/edition.js',
  './js/views/sources.js',
  './js/views/climat.js',
  './js/views/archives.js',
  './js/views/articles.js',
  './js/views/medias.js',
  './js/views/lecture.js',
  './js/views/videos.js',
  './js/views/reglages.js',
  './js/feedback.js',
  './js/views/feedback.js',
  './data/feedback.json',
  './js/lecture.js',
  './js/compte.js',
  './js/push.js',
  './js/router.js',
  './js/app.js',
  './data/chapters.json',
  './data/medias.json',
  './data/flux-rss.json',
  './data/flux-rss-2.json',
  './data/flux-rss-3.json',
  './data/lecture-reco.json',
  './data/compte.json',
  './data/flux-rss-2.json',
  './data/climat.json'
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

/* v28 : notifications push — affichage réceptionné depuis le serveur */
self.addEventListener('push', e => {
  const d = e.data ? e.data.json() : {};
  e.waitUntil(self.registration.showNotification(d.titre || 'Des Infos, y\u2019en a H24', {
    body: d.corps || '',
    icon: './icons/icon.svg',
    badge: './icons/icon.svg',
    data: { url: d.url || './' }
  }));
});
self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(clients.openWindow(e.notification.data?.url || './'));
});
