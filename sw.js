/* sw.js v112 — Service worker de la PWA Newsletter.
 * Stratégies : data/ et editions/ network-first (toujours frais en ligne, repli cache hors ligne) ;
 * le reste (coquille, js/, styles) cache-first pour un démarrage instantané.
 * À chaque déploiement de code : incrémenter CACHE (v109 → v110…) pour invalider les caches clients.
 * v112 : ✊ Lycéens — chapitres de la « Version des Lycéens » REPLIÉS par défaut
 * (demande de Maxime) ; le bouton « Aller à la fin du texte » ouvre la carte
 * qui porte l'ancre avant de défiler (js/views/lyceens.js v112).
 * v111 : ✊ Lycéens — fusion « Version des Lycéens » (le sous-onglet de
 * chapitres transverses disparaît, le texte d'intro/compteur/note vit dans la
 * carte déroulante d'en-tête) + pipeline : nouveaux chapitres insérés avant
 * les transverses (js/views/lyceens.js v111, tools/etudiants.js v115).
 * v110 : ✊ Lycéens — l'en-tête « Version des étudiants — la chronique » (et son
 * jumeau d'avant la fusion v111) devient une carte repliable repliée par
 * défaut (js/views/lyceens.js v110 + styles.css).
 * v109 : ✊ Lycéens — l'encart « Révolte lycéenne » devient une carte repliable
 * <details> repliée par défaut, date de maj visible dans le summary
 * (js/views/lyceens.js v109 + styles.css) ; prose de l'encart actualisée dans
 * data/lyceens.json (intro = cinq sous-onglets, échéance du 8 octobre).
 * v108 : ✊ Lycéens — le sous-onglet « 📍 Chronologie » devient « 📍 Chronologie
 * résumée » (js/views/lyceens.js v108), pour le distinguer du fil détaillé
 * de la « Version des étudiants ».
 * v107 : ✊ Lycéens — le sous-onglet « ✅ Faits vérifiés » devient « ✅ Faits
 * multisources » (js/views/lyceens.js v107), plus fidèle aux faits corroborés
 * par plusieurs médias qu il affiche.
 * v106 : ✊ Lycéens — la 📍 Chronologie devient un sous-onglet après les ✅ Faits vérifiés
 * (js/views/lyceens.js v106) et ses jalons sont mis à jour jusqu au 7 octobre
 * (data/lyceens.json, network-first).
 * v105 : lot 5 — badge « ✓ N médias » (corroboration client miroir du serveur, racines+chiffres)
 * sur les articles repris par plusieurs flux, extrait coupé au mot (js/feeds.js v17, views/common.js,
 * styles.css). data/ et tools/ inchangés (les relevés serveur ne comptent que la presse). */
const CACHE = 'newsletter-v112';
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
  './js/views/videos.js',
  './js/views/reglages.js',
  './js/views/lyceens.js',
  './data/etudiants/index.json',
  './data/etudiants/chapitres/01.json',
  './data/etudiants/chapitres/02.json',
  './data/etudiants/chapitres/03.json',
  './data/etudiants/chapitres/04.json',
  './data/etudiants/chapitres/05.json',
  './data/etudiants/chapitres/06.json',
  './data/etudiants/chapitres/07.json',
  './data/etudiants/chapitres/08.json',
  './data/etudiants/chapitres/09.json',
  './data/etudiants/chapitres/10.json',
  './data/etudiants/chapitres/11.json',
  './data/etudiants/chapitres/12.json',
  './data/etudiants/chapitres/13.json',
  './data/etudiants/chapitres/14.json',
  './data/etudiants/chapitres/15.json',
  './data/etudiants/chapitres/16.json',
  './data/etudiants/chapitres/17.json',
  './data/lyceens.json',
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
  './data/compte.json',
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
