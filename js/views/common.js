/* views/common.js — briques partagées par les onglets (v18).
 * Règle d'hygiène inchangée : tout texte externe passe par esc() avant innerHTML.
 * v18 (CACHE v114) : pastille « ✓ N médias » CLIQUABLE — la carte passe en <div>
 * avec un lien-voile étiré sur toute sa surface (la carte entière reste cliquable,
 * comme avant) ; la pastille et la liste des médias corroborés vivent AU-DESSUS du
 * voile (z-index:2 dans styles.css) et captent leurs propres clics. Le dépliage
 * passe par une délégation globale posée une fois au chargement : elle survit à
 * tous les re-rendus des vues.
 * v115 (CACHE v115) : boutonReplier() — « ▲ Replier » au bas de chaque carte
 * déroulante du site (Réglages, Newsletters, onglet ✊), délégation idem. */
import { state, esc, urlSure } from '../core.js';
import { syncHash } from '../router.js';

/* Bloc article commun (onglets Articles et Médias).
 * v114 : les événements corroborés (nbMedias ≥ 2) portent sourcesMedias =
 * [{nom, lien}] (posé par compterMedias, js/feeds.js v18) — la pastille déplie
 * la liste, chaque nom ouvre l'article de CE média dans un nouvel onglet.
 * Un vieux cache v105 (nbMedias sans sourcesMedias) reste gracieux : pastille
 * sans flèche, sans liste, sans erreur. */
export function articleHtml(a) {
  const age = Math.max(0, Math.round((Date.now() - a.date.getTime()) / 3600e3));
  const origine = a.chapitreNom || a.mediaNom || '';
  const choix = (a.nbMedias >= 2 && Array.isArray(a.sourcesMedias)) ? a.sourcesMedias : [];
  return '<div class="article">' +
    /* voile : le lien principal étiré sur la carte — cliquer n'importe où
     * ouvre l'article de la source affichée, exactement comme avant v114. */
    '<a class="article-voile" href="' + esc(urlSure(a.lien)) + '" target="_blank" rel="noopener" aria-label="' + esc(a.titre) + '"></a>' +
    '<h3>' + esc(a.titre) + '</h3><div class="meta">' + esc(origine) + ' · il y a ' +
    (age < 1 ? 'moins d’1 h' : age + ' h') +
    (a.nbMedias >= 2
      ? ' <button type="button" class="badge-medias" aria-expanded="false">✓ ' + a.nbMedias + ' médias' + (choix.length ? ' ▾' : '') + '</button>'
      : '') +
    '</div>' +
    (a.extrait ? '<div class="excerpt">' + esc(a.extrait) + '</div>' : '') +
    (choix.length
      ? '<div class="medias-liste" hidden>' +
        choix.map(s =>
          '<a href="' + esc(urlSure(s.lien)) + '" target="_blank" rel="noopener">' + esc(s.nom) + '</a>').join('') +
        '</div>'
      : '') +
    '</div>';
}

/* v114 : dépliage de la liste des médias corroborés — délégation globale :
 * posée une fois au chargement du module, elle survit à chaque re-rendu. */
if (typeof document !== 'undefined' && typeof document.addEventListener === 'function') {
  document.addEventListener('click', e => {
    const b = e.target && e.target.closest ? e.target.closest('.badge-medias') : null;
    if (!b) return;
    const liste = b.closest('.article')?.querySelector('.medias-liste');
    if (!liste) return;
    liste.hidden = !liste.hidden;
    b.setAttribute('aria-expanded', liste.hidden ? 'false' : 'true');
    b.classList.toggle('ouvert', !liste.hidden);
  });
}

/* v115 : bouton « ▲ Replier » en bas de chaque carte déroulante — referme le
 * bloc et remonte à son titre, d'un seul geste (même mécanique que les
 * éditions, règle du 09/10/2026). Construction partagée : chaque vue qui bâtit
 * un <details> l'appelle juste avant </details> ; la gestion du clic passe par
 * une délégation globale posée une fois au chargement du module — elle survit
 * à tous les re-renders, comme celle de la pastille. */
export function boutonReplier(libelle) {
  return '<button type="button" class="btn-replier">▲ ' + (libelle || 'Replier') + '</button>';
}
if (typeof document !== 'undefined' && typeof document.addEventListener === 'function') {
  document.addEventListener('click', e => {
    const b = e.target && e.target.closest ? e.target.closest('.btn-replier') : null;
    if (!b) return;
    const d = b.closest('details');
    if (d) { d.removeAttribute('open'); d.scrollIntoView({ block: 'start' }); }
  });
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
