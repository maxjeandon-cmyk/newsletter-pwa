/* app.js — point d'entrée de la PWA Des Infos (v24) : initialisation, événements, service worker.
 * Architecture : core.js (état + helpers) → feeds.js (flux) / compte.js (auth) → views.js (rendu) → app.js (pilote).
 * v24 : les réglages vivent dans un onglet (#reglages, vue dédiée) — plus de panneau flottant.
 * Le bouton 👤 mène au profil, ⟳ purge le cache (CacheStorage) puis recharge la page fraîche.
 * Contrat de données : editions/ n'est jamais modifié ici ; la config éditoriale vit dans data/. */
import { $, state, getStore, setStore, applyTheme, fmtDate } from './core.js';
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
    if (state.edition) $('#edition-date').textContent = '· ' + fmtDate(state.edition.date);
  } else { state.archiveIdx = []; state.edition = null; }
  state.weeksIdx = await chargerJSON('editions/semaines/index.json', null);
  state.archivesThema = {
    droit: await chargerJSON('editions/archives/droit.json', null),
    economie: await chargerJSON('editions/archives/economie.json', null)
  };
}

/* Purge complète : localStorage hors préférences + CacheStorage, puis rechargement frais */
async function purgeEtRecharger() {
  const b = $('#btn-refresh');
  if (b) { b.disabled = true; b.textContent = '…'; }
  const purgeStore = (await import('./core.js')).purgeStore;
  purgeStore();
  state.feed = { time: 0, articles: [] };
  state.mediaData = {};
  try {
    if (window.caches) {
      const noms = await caches.keys();
      await Promise.all(noms.map(n => caches.delete(n)));
    }
  } catch (e) { /* pas de CacheStorage : localStorage déjà purgé */ }
  location.reload();
}

async function init() {
  if (getStore('theme', null) === null && localStorage.getItem('theme') !== null) {
    try { setStore('theme', JSON.parse(localStorage.getItem('theme'))); } catch (e) { /* défaut */ }
  }
  ['chapters', 'chaptersV', 'feedCache', 'afpOnly', 'theme'].forEach(k => localStorage.removeItem(k));
  initRouter(() => { renderTabs(); renderView(); });
  applyTheme(getStore('theme', 'dark'));
  /* ⟳ purge le cache et recharge — plus de doute sur la fraîcheur de ce qu'on lit */
  $('#btn-refresh').onclick = purgeEtRecharger;
  /* 👤 mène au profil/compte dans l'onglet Réglages */
  $('#btn-profil').onclick = () => { location.hash = '#reglages'; };
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js');
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
