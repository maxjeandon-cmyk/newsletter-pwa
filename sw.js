/* sw.js v101 — Service worker de la PWA Newsletter.
 * Stratégies : data/ et editions/ network-first (toujours frais en ligne, repli cache hors ligne) ;
 * le reste (coquille, js/, styles) cache-first pour un démarrage instantané.
 * À chaque déploiement de code : incrémenter CACHE (v22 → v23…) pour invalider les caches clients. */
const CACHE = 'newsletter-v101';
const ASSETS = [
  './',
  './index.html',
  './styles.css',
  './manifest.webmanifest',
  './icons/icon.svg',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/maskable-512.png',
  './icons/apple-touch-icon.png',
  './js/core.js',
  './js/onglets.js',
  './js/feeds.js',
  './js/github.js',
  './js/views.js',
  './js/views/common.js',
  './js/views/edition.js',
  './js/views/sources.js',
  './js/views/newsletters.js',
  './js/views/archives.js',
  './js/views/articles.js',
  './js/views/medias.js',
  './js/views/lecture.js',
  './js/views/videos.js',
  './js/views/reglages.js',
  './js/feedback.js',
  './js/views/feedback.js',
  './js/views/lyceens.js',
  './data/etudiants/index.json',
  './data/feedback.json',
  './data/lyceens.json',
  './js/lecture.js',
  './js/compte.js',
  './js/push.js',
  './js/meteo.js',
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
  './data/climat.json',
  './data/newsletters.json'
];
/* v79 : mise en cache RESILIENTE — addAll() est tout-ou-rien : une seule
 * ressource lente ou en échec laissait le SW bloqué en « installing »
 * pour toujours (donc .ready jamais résolu, push impossible). Chaque
 * ressource est cachée indépendamment ; un échec est logué mais n'empêche
 * plus l'activation. */
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(async c => {
      await Promise.all(ASSETS.map(async a => {
        try { await c.add(a); } catch (err) { console.warn('[sw] pas caché :', a, err && err.message); }
      }));
    }).then(() => self.skipWaiting())
  );
});
/* v75 : SKIP_WAITING à la demande de la page + message d'activation —
 * sans ça, un SW « waiting » (ancien onglet ouvert, iOS Safari) n'active
 * jamais et navigator.serviceWorker.ready attend pour toujours. */
self.addEventListener('message', e => { if (e.data && e.data.type === 'SKIP_WAITING') self.skipWaiting(); });
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()).then(() => {
    self.clients.matchAll().then(cs => cs.forEach(c => c.postMessage({ type: 'SW_ACTIF', version: CACHE })));
  }));
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
  e.waitUntil(self.registration.showNotification(d.titre || 'DiY/H24', {
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
