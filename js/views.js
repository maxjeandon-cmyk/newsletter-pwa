/* views.js — dispatcher des onglets (v17). Chaque onglet vit dans son module
 * js/views/*.js ; ce fichier enregistre les vues dans le registre de common.js
 * puis expose l'API historique (renderView, renderTabs, majMedias…) inchangée.
 * Règle d'hygiène : tout texte externe (flux RSS, éditions) passe par esc() avant innerHTML. */
import { $, state, esc, getStore, setStore, nomJourEdition } from './core.js';
import { chargerChapitres } from './feeds.js';
import { ONGLETS_BASE } from './onglets.js';
import { enregistrerVue, renderView as rendu } from './views/common.js';
import { vueEdition } from './views/edition.js';
import { vueNewsletters } from './views/newsletters.js';
import { vueArchives } from './views/archives.js';
import { vueArticles } from './views/articles.js';
import { vueMedias, majMedias as maj, mediaVisible } from './views/medias.js';
import { vueLecture } from './views/lecture.js';
import { vueReglages } from './views/reglages.js';
import { vueVideos } from './views/videos.js';
import { vueFeedback } from './views/feedback.js';

export const renderView = rendu;
export const majMedias = maj;
export { mediaVisible };

Object.entries({ edition: vueEdition, archives: vueArchives, climat: vueNewsletters, articles: vueArticles, medias: vueMedias, lecture: vueLecture, videos: vueVideos, reglages: vueReglages, feedback: vueFeedback })
  .forEach(([id, vue]) => enregistrerVue(id, vue));

/* Barre d'onglets : definitions centrales dans onglets.js — tout nouvel
 * onglet ajoute la-bas apparait ici automatiquement. */
const TABS_BASE = ONGLETS_BASE.map(o => ({ ...o, nom: () => o.id === 'edition' ? 'Édition du ' + nomJourEdition() : o.nom }));
/* Ordre des onglets : préférence locale (nl.ordreOnglets), sinon défaut ci-dessus */
const TABS = () => {
  const pref = getStore('ordreOnglets', []);
  const base = TABS_BASE.map(t => ({ ...t, nom: t.nom() }));
  return pref.filter(id => base.some(t => t.id === id))
    .map(id => base.find(t => t.id === id))
    .concat(base.filter(t => !pref.includes(t.id)));
};

export function renderTabs() {
  $('#tabs').innerHTML = TABS().map(t =>
    '<button class="tab' + (t.id === state.activeTab ? ' active' : '') + '" data-id="' + t.id + '">' +
    t.emoji + ' ' + esc(t.nom) + '</button>').join('');
  [...document.querySelectorAll('.tab')].forEach(b =>
    b.onclick = () => {
      /* Le hash pilote : une entrée d'historique par changement d'onglet —
         le bouton retour du navigateur revient à l'onglet précédent. */
      if (location.hash !== '#' + b.dataset.id) location.hash = b.dataset.id;
      else { renderTabs(); renderView(); } /* déjà ce hash (ex. retour en arrière) : juste re-rendre */
    });
}

/* --- Réglages : chapitres suivis (les masques sont des préférences locales,
 *     indépendantes de la config serveur — plus besoin de numéro de version). --- */
export function renderChaptersEditor() {
  const masques = getStore('masques', {});
  $('#chapters-editor').innerHTML = state.chapters.filter(c => c.flux.length).map(c =>
    '<li><span>' + esc(c.emoji) + '</span><span class="name">' + esc(c.nom) + '</span>' +
    '<label style="margin:0"><input type="checkbox" data-id="' + esc(c.id) + '"' +
    (masques[c.id] ? '' : ' checked') + '> suivi</label></li>').join('');
  [...document.querySelectorAll('#chapters-editor input')].forEach(cb =>
    cb.onchange = () => {
      const masq = getStore('masques', {});
      masq[cb.dataset.id] = !cb.checked;
      setStore('masques', masq);
      renderView();
      chargerChapitres().then(renderView).catch(() => {}); // applique le changement d'un coup
    });
}
