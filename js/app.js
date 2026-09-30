/* app.js — point d'entrée de la PWA Newsletter (v16) : initialisation, événements, service worker.
 * Architecture : core.js (état + helpers) → feeds.js (couche flux) → views.js (rendu) → app.js (pilote).
 * Contrat de données : editions/ (généré chaque nuit à 23h59) n'est jamais modifié ici ;
 * la config éditoriale vit dans data/chapters.json (chapitres) et data/medias.json (médias suivis). */

import { $, state, getStore, setStore, purgeStore, applyTheme, fmtDate } from './core.js';
import { chargerChapitres, chargerMedia } from './feeds.js';
import { renderTabs, renderView, renderChaptersEditor, majMedias } from './views.js';

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
  /* Archives thématiques (v20) : chapitres Droit & Économie conservés édition après édition */
  state.archivesThema = {
    droit: await chargerJSON('editions/archives/droit.json', null),
    economie: await chargerJSON('editions/archives/economie.json', null)
  };
}

async function init() {
  /* Migration depuis la v15 : les anciennes clés non préfixées migrent puis disparaissent */
  if (getStore('theme', null) === null && localStorage.getItem('theme') !== null) {
    try { setStore('theme', JSON.parse(localStorage.getItem('theme'))); } catch (e) { /* défaut */ }
  }
  ['chapters', 'chaptersV', 'feedCache', 'afpOnly', 'theme'].forEach(k => localStorage.removeItem(k));

  const theme = getStore('theme', 'dark');
  applyTheme(theme);
  $('#sel-theme').value = theme;
  $('#sel-theme').onchange = e => { setStore('theme', e.target.value); applyTheme(e.target.value); };

  $('#btn-refresh').onclick = async () => {
    $('#stale-banner').hidden = false;
    $('#stale-banner').textContent = 'Actualisation en cours…';
    const taches = [loadEdition(), chargerChapitres(),
      chargerJSON('data/climat.json', null).then(c => { state.climat = c; })];
    if (state.activeTab === 'medias') {
      const m = state.medias.find(x => x.id === state.activeMedia);
      if (m) taches.push(chargerMedia(m, true));
    }
    await Promise.allSettled(taches);
    $('#stale-banner').hidden = true;
    renderTabs(); renderChaptersEditor(); renderView();
  };

  $('#btn-settings').onclick = () => { $('#settings-panel').removeAttribute('hidden'); $('#settings-panel').classList.add('open'); };
  $('#btn-close-settings').onclick = () => { $('#settings-panel').classList.remove('open'); };
  $('#settings-panel').onclick = e => { if (e.target.id === 'settings-panel') $('#settings-panel').classList.remove('open'); };
  $('#btn-install-hint').onclick = () => alert('Sur iPhone : bouton Partager ⬆️ en bas de Safari, puis « Sur l’écran d’accueil ». L’app s’ouvrira plein écran, comme une vraie app.');
  $('#btn-purge').onclick = () => {
    purgeStore(); // préférences (médias ajoutés, masques, thème) préservées
    state.feed = { time: 0, articles: [] };
    state.mediaData = {};
    renderView();
  };
  $('#btn-reset-chapters').onclick = () => { setStore('masques', {}); renderChaptersEditor(); chargerChapitres().then(renderView).catch(() => {}); };

  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js');

  /* Config éditoriale : data/ est servi network-first par le service worker —
   * toujours frais en ligne, repli sur cache hors ligne. Tout est chargé en
   * parallèle : le premier rendu n'attend que le plus lent de ces fichiers.
   * Médias effectifs = data/medias.json + médias ajoutés depuis l'onglet Médias (nl.mediasPerso). */
  const [chapters, jm, fluxRss, climat] = await Promise.all([
    chargerJSON('data/chapters.json', []),
    chargerJSON('data/medias.json', {}),
    chargerJSON('data/flux-rss.json', {}),
    chargerJSON('data/climat.json', null)
  ]);
  state.chapters = chapters;
  state.mediasBase = jm.medias || [];
  /* Catalogue de flux RSS vérifiés (v21) : propose les médias connus dans ➕ Ajouter */
  state.fluxCatalogue = fluxRss.catalogue || [];
  /* Bulletin climat Copernicus (v22) : onglet Climat */
  state.climat = climat;
  majMedias();
  /* Hygiène localStorage : les caches media:* des médias supprimés ne servent plus. */
  const idsConnus = new Set(state.medias.map(m => m.id));
  Object.keys(localStorage)
    .filter(k => k.startsWith('nl.media:') && !idsConnus.has(k.slice('nl.media:'.length)))
    .forEach(k => localStorage.removeItem(k));

  state.feed = getStore('feed', { time: 0, articles: [] });

  renderTabs();
  renderChaptersEditor();
  renderView();

  await loadEdition();
  renderTabs();
  renderView();

  /* Flux chaud en arrière-plan au démarrage (onglet Articles) */
  $('#stale-banner').hidden = false;
  $('#stale-banner').textContent = 'Flux chaud en cours de récupération…';
  chargerChapitres().then(() => { $('#stale-banner').hidden = true; renderView(); })
    .catch(() => { $('#stale-banner').hidden = true; });

  /* Rythme de croisière : le flux chaud ne se rafraîchit que si l'onglet
   * Articles est ouvert, la page visible, et le cache de plus de 20 minutes —
   * chaque visiteur a ses propres quotas de relais gratuits, 100 visiteurs ne
   * pèsent pas plus lourd qu'un. */
  setInterval(() => {
    if (document.visibilityState === 'visible' && state.activeTab === 'articles'
      && Date.now() - state.feed.time > 20 * 60e3) {
      chargerChapitres().then(renderView).catch(() => {});
    }
  }, 5 * 60 * 1000);
}
init();
