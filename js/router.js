/* router.js — routeur URL (v17) : l'onglet ouvert vit dans le hash de l'URL.
 * Partager un lien, revenir en arrière, rouvrir un onglet direct : tout passe par là.
 * Schéma : #<onglet> · #medias/<id|ajout|gerer> · #lecture[/<categorie>][?q=<recherche>] · #archives[/<sous-onglet>][?h=<archive>]
 * Le hash est la source de vérité au chargement ; l'état l'alimente ensuite
 * (pushState au changement d'onglet — le bouton retour fonctionne — replaceState
 * pour les re-rendus internes, sans polluer l'historique). */

import { state } from './core.js';

const ONGLETS = ['articles', 'edition', 'archives', 'climat', 'medias', 'lecture', 'videos', 'reglages', 'sources'];
const SOUS_ARCHIVES = ['editions', 'sources', 'droit', 'economie'];

/* L'URL qui représente l'état courant */
export function hashFromState() {
  let h = ONGLETS.includes(state.activeTab) ? state.activeTab : 'edition';
  if (h === 'medias') {
    if (state.mediasMode === 'ajout' || state.mediasMode === 'gerer') h += '/' + state.mediasMode;
    else if (state.activeMedia) h += '/' + encodeURIComponent(state.activeMedia);
  } else if (h === 'lecture') {
    if (state.lecture?.cat && state.lecture.cat !== 'tout') h += '/' + state.lecture.cat;
    if (state.lecture?.q) h += '?q=' + encodeURIComponent(state.lecture.q);
  } else if (h === 'videos') {
    if (state.videoLecture?.videoId) h += '/' + encodeURIComponent(state.videoLecture.videoId);
  } else if (h === 'archives') {
    if (SOUS_ARCHIVES.includes(state.archiveSub) && state.archiveSub !== 'editions') h += '/' + state.archiveSub;
    if (state.archiveSel) h += '?h=' + encodeURIComponent(state.archiveSel);
  }
  return h;
}

/* L'état déduit de l'URL (chargement initial, bouton retour, lien partagé) */
export function stateFromHash() {
  const brut = decodeURIComponent(location.hash.slice(1));
  const [chemin, query] = brut.split('?');
  const parties = chemin.split('/').filter(Boolean);
  let tab = ONGLETS.includes(parties[0]) ? parties[0] : 'edition';
  if (tab === 'sources') tab = 'archives'; /* héritage : l'onglet Sources vit désormais dans Archives */
  state.activeTab = tab;
  if (parties[0] === 'sources') state.archiveSub = 'sources';
  if (tab === 'medias') {
    if (parties[1] === 'ajout' || parties[1] === 'gerer') { state.mediasMode = parties[1]; }
    else { state.mediasMode = null; if (parties[1]) state.activeMedia = parties[1]; }
  }
  if (tab === 'archives') {
    state.archiveSub = SOUS_ARCHIVES.includes(parties[1]) ? parties[1] : 'editions';
    const h = new URLSearchParams(query || '').get('h');
    state.archiveSel = h && /^[\w./-]+$/.test(h) ? h : null;
  }
  if (tab === 'videos') {
    state.videoLecture = /^[\w-]{11}$/.test(parties[1]) ? { videoId: parties[1] } : null;
  }
  if (tab === 'lecture') {
    const cat = ['tout', 'livres', 'journaux', 'magazines', 'revues', 'theses', 'bd', 'manga'].includes(parties[1]) ? parties[1]
      : parties[1] === 'publications' ? 'revues' /* héritage */ : 'tout';
    const q = new URLSearchParams(query || '').get('q');
    state.lecture = q ? { q, cat, resultats: [], etat: 'encours' } : { q: '', cat, resultats: [], etat: null };
    if (q) import('./views/lecture.js').then(m => m.lancerRechercheLecture(q, cat));
  }
}

/* Mettre l'URL au diapason de l'état. push=true au clic sur un onglet
 * (une entrée d'historique par navigation), sinon remplacement silencieux. */
export function syncHash(push = false) {
  const cible = '#' + hashFromState();
  if (location.hash === cible) return;
  if (push) location.hash = cible; /* déclenche hashchange → re-rendu par le routeur */
  else history.replaceState(null, '', cible);
}

/* Branchement : au chargement, l'URL pilote l'état ; ensuite chaque changement
 * de hash (clic, retour, lien partagé) re-rend l'application. */
export function initRouter(rendre) {
  stateFromHash();
  window.addEventListener('hashchange', () => {
    stateFromHash();
    rendre();
    window.scrollTo(0, 0);
  });
}
