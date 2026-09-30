/* views/common.js — briques partagées par les onglets (v17).
 * Règle d'hygiène inchangée : tout texte externe passe par esc() avant innerHTML. */
import { state, esc, urlSure } from '../core.js';
import { syncHash } from '../router.js';

/* Bloc article commun (onglets Articles et Médias) */
export function articleHtml(a) {
  const age = Math.max(0, Math.round((Date.now() - a.date.getTime()) / 3600e3));
  const origine = a.chapitreNom || a.mediaNom || '';
  return '<a class="article" href="' + esc(urlSure(a.lien)) + '" target="_blank" rel="noopener">' +
    '<h3>' + esc(a.titre) + '</h3><div class="meta">' + esc(origine) + ' · il y a ' +
    (age < 1 ? 'moins d’1 h' : age + ' h') + '</div>' +
    (a.extrait ? '<div class="excerpt">' + esc(a.extrait) + '</div>' : '') + '</a>';
}

/* Heure de génération de l'édition du jour */
export function generationTime() {
  return state.edition?.genere_le ? new Date(state.edition.genere_le).getTime() : Date.now() - 24 * 3600e3;
}

/* Registre des vues + rendu : views.js enregistre chaque vue*() ici au chargement,
 ce qui garde le graphe d'imports acyclique (views.js → views/*.js → common.js). */
const REGISTRE = {};
export function enregistrerVue(id, vue) { REGISTRE[id] = vue; }
export function renderView() {
  const vue = REGISTRE[state.activeTab] || REGISTRE.edition;
  if (!REGISTRE[state.activeTab]) state.activeTab = 'edition'; // état résiduel
  vue();
  syncHash(false); /* l'URL suit l'état en silence — un lien partagé rouvre exactement cette vue */
}
