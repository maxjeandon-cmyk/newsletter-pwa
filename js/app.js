/* app.js — point d'entrée de la PWA Des Infos (v24) : initialisation, événements, service worker.
 * Architecture : core.js (état + helpers) → feeds.js (flux) / compte.js (auth) → views.js (rendu) → app.js (pilote).
 * v24 : les réglages vivent dans un onglet (#reglages, vue dédiée) — plus de panneau flottant.
 * Le bouton 👤 mène au profil, ⟳ purge le cache (CacheStorage) puis recharge la page fraîche.
 * Contrat de données : editions/ n'est jamais modifié ici ; la config éditoriale vit dans data/. */
import { $, state, getStore, setStore, applyTheme, applyTaille } from './core.js';
import { chargerChapitres, chargerMedia } from './feeds.js';
import { renderTabs, renderView, majMedias } from './views.js';
import { initRouter } from './router.js';
import { restaurerSession, synchroniserPrefs } from './compte.js';

async function chargerJSON(url, def) {
  try { return await (await fetch(url, { cache: 'no-store' })).json(); } catch (e) { return def; }
}

/* Édition du jour + index d'archives + récaps hebdo (contrat inchangé avec la génération 23h59) */
async function loadEdition() {
  const idx = await chargerJSON('editions/latest.json', null);
  if (idx?.editions?.length) {
    state.archiveIdx = idx.editions;
    state.edition = await chargerJSON(idx.editions[0].fichier, null);
  } else { state.archiveIdx = []; state.edition = null; }
  state.weeksIdx = await chargerJSON('editions/semaines/index.json', null);
  state.archivesThema = {
    droit: await chargerJSON('editions/archives/droit.json', null),
    economie: await chargerJSON('editions/archives/economie.json', null)
  };
}

/* Actualisation (⟳) : recharge les données réseau — édition, climat, flux chaud,
 * média ouvert — SANS toucher au cache ni aux préférences. Rapide et sans risque.
 * La purge complète (CacheStorage) vit dans Réglages > Maintenance. */
async function actualiser() {
  const b = $('#btn-refresh');
  if (b) { b.disabled = true; b.textContent = '…'; }
  const taches = [loadEdition(), chargerChapitres(),
    chargerJSON('data/climat.json', null).then(c => { state.climat = c; })];
  if (state.activeTab === 'medias') {
    const m = state.medias.find(x => x.id === state.activeMedia);
    if (m) taches.push(chargerMedia(m, true));
  }
  await Promise.allSettled(taches);
  if (b) { b.disabled = false; b.textContent = '⟳'; }
  renderTabs();
  renderView();
}

function afficherDateJour() {
  const d = new Date();
  const opts = { weekday: 'long', day: 'numeric', month: 'long' };
  $('#date-jour').textContent = new Intl.DateTimeFormat('fr-FR', opts).format(d);
}

async function init() {
  if (getStore('theme', null) === null && localStorage.getItem('theme') !== null) {
    try { setStore('theme', JSON.parse(localStorage.getItem('theme'))); } catch (e) { /* défaut */ }
  }
  ['chapters', 'chaptersV', 'feedCache', 'afpOnly', 'theme'].forEach(k => localStorage.removeItem(k));
  initRouter(() => { renderTabs(); renderView(); });
  applyTheme(getStore('theme', 'nuit'));
  afficherDateJour();
  applyTaille(getStore('taillePolice', 1));
  /* ⟳ purge le cache et recharge — plus de doute sur la fraîcheur de ce qu'on lit */
  $('#btn-refresh').onclick = actualiser;
  /* 👤 mène au profil/compte dans l'onglet Réglages */
  $('#btn-profil').onclick = () => { location.hash = '#reglages'; };
  /* v75 : enregistrement + actualisation du SW. Sans update() explicite, un SW
   * « waiting » (ancien onglet ouvert, iOS) n'active JAMAIS — et
   * navigator.serviceWorker.ready attend indéfiniment : c'est ce qui bloquait
   * l'abonnement push (figé sur « service worker prêt ? »). */
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js')
      .then(reg => { reg.update().catch(() => {}); if (reg.waiting) reg.waiting.postMessage({ type: 'SKIP_WAITING' }); })
      .catch(() => {});
    navigator.serviceWorker.addEventListener('message', e => {
      if (e.data && e.data.type === 'SW_ACTIF') console.info('[sw] actif :', e.data.version);
    });
  }
  const [chapters, jm, fluxRss, climat, recos] = await Promise.all([
    chargerJSON('data/chapters.json', []),
    chargerJSON('data/medias.json', {}),
    chargerJSON('data/flux-rss.json', {}),
    chargerJSON('data/climat.json', null),
    chargerJSON('data/lecture-reco.json', {})
  ]);
  state.chapters = chapters;
  state.mediasBase = jm.medias || [];
  const shards = await Promise.all((fluxRss.suite || []).map(u => chargerJSON(u, {})));
  state.fluxCatalogue = shards.reduce((acc, s) => acc.concat(s.catalogue || []), fluxRss.catalogue || []);
  state.climat = climat;
  state.lectureRecos = recos.recommandations || [];
  majMedias();
  const idsConnus = new Set(state.medias.map(m => m.id));
  Object.keys(localStorage)
    .filter(k => k.startsWith('nl.media:') && !idsConnus.has(k.slice('nl.media:'.length)))
    .forEach(k => localStorage.removeItem(k));
  state.feed = getStore('feed', { time: 0, articles: [] });
  (state.feed.articles || []).forEach(a => { if (!(a.date instanceof Date)) a.date = new Date(a.date); });
  renderTabs();
  renderView();
  /* Session de compte restaurée en silence : la sync des préférences suit si connecté */
  restaurerSession().then(u => {
    if (!u) return;
    state.compte = { id: u.id, email: u.email };
    synchroniserPrefs().then(() => { if (state.activeTab === 'reglages') renderView(); }).catch(() => {});
  }).catch(() => {});
  await loadEdition();
  renderTabs();
  renderView();
  $('#stale-banner').hidden = false;
  $('#stale-banner').textContent = 'Flux chaud en cours de récupération…';
  chargerChapitres().then(() => { $('#stale-banner').hidden = true; renderView(); })
    .catch(() => { $('#stale-banner').hidden = true; });
  setInterval(() => {
    if (document.visibilityState === 'visible' && state.activeTab === 'articles'
      && Date.now() - state.feed.time > 20 * 60e3) {
      chargerChapitres().then(renderView).catch(() => {});
    }
  }, 5 * 60 * 1000);
}

init().catch(e => console.error('init', e));
