/* views/lecture.js — 📖 Onglet Lecture (v18) : trouver et afficher les formats
 * numériques de livres, magazines, revues de presse et revues scientifiques.
 * Recherche intégrée à l'onglet ; alerte paywall sur chaque résultat concerné. */
import { $, state, esc, urlSure, getStore, setStore } from '../core.js';
import { chercher } from '../lecture.js';
import { renderView } from './common.js';

const CATEGORIES = [
  { id: 'tout', nom: 'Tout' },
  { id: 'livres', nom: 'Livres & magazines' },
  { id: 'publications', nom: 'Revues & presse' }
];

/* Historique des recherches (préférence locale, max 8 — réutilisable en un clic) */
function historique() {
  return getStore('lecture:histo', []);
}
function pousserHisto(q) {
  const h = historique().filter(x => x !== q);
  h.unshift(q);
  setStore('lecture:histo', h.slice(0, 8));
}

function carteLecture(r) {
  const badge = r.acces === 'ouvert' ? '<span class="badge-access ok">✓ accès libre</span>'
    : r.acces === 'emprunt' ? '<span class="badge-access mid">⤴ emprunt gratuit</span>'
    : r.acces === 'paywall' ? '<span class="badge-access warn">⚠️ paywall probable</span>'
    : '<span class="badge-access">papier seulement</span>';
  return '<a class="article lecture-item" href="' + esc(urlSure(r.lien)) + '" target="_blank" rel="noopener">' +
    '<h3>' + esc(r.titre) + '</h3><div class="meta">' +
    esc(r.auteurs.join(', ')) +
    (r.annee ? ' · ' + esc(String(r.annee)) : '') +
    (r.revue ? ' · ' + esc(r.revue) : '') +
    ' · ' + esc(r.source) + '</div>' +
    '<div class="meta">' + badge + '</div>' +
    '</a>';
}

export function vueLecture() {
  const view = $('#view');
  const recherche = state.lecture || { q: '', cat: 'tout', resultats: [], etat: null };
  const histo = historique();
  view.innerHTML =
    '<div class="chapter-resume"><h2>📖 Lecture</h2>' +
    '<p class="meta-count">Livres et magazines numériques, revues de presse et revues scientifiques — ' +
    'l\'agent fouille les catalogues ouverts (Open Library, Internet Archive, Crossref) et ' +
    'signale les paywalls avant que tu cliques.</p>' +
    '<form id="lec-form"><div class="subtabs">' +
    CATEGORIES.map(c =>
      '<button type="button" class="subtab' + (recherche.cat === c.id ? ' active' : '') + '" data-cat="' + c.id + '">' + esc(c.nom) + '</button>').join('') +
    '</div>' +
    '<label>Rechercher un ouvrage, un magazine, une revue…' +
    '<input id="lec-q" type="search" inputmode="search" autocomplete="off" placeholder="ex. Sapiens, Le Monde diplomatique, climate change…"' +
    ' value="' + esc(recherche.q) + '"></label>' +
    '<div class="form-actions"><button class="filter-btn active" type="submit">🔎 Chercher</button></div></form>' +
    (histo.length ? '<p class="hint">Récentes : ' + histo.map(h =>
      '<button type="button" class="tab lec-histo" data-q="' + esc(h) + '">' + esc(h) + '</button>').join(' ') + '</p>' : '') +
    '</div>' +
    (recherche.etat === 'encours'
      ? '<div class="empty">🔎 Recherche en cours…</div>'
      : recherche.etat === 'vide'
        ? '<div class="empty">Aucun résultat — essaie un autre titre, auteur ou mot-clé. 🌱</div>'
        : '') +
    (recherche.resultats || []).map(carteLecture).join('');
  const form = $('#lec-form');
  if (form) form.onsubmit = e => {
    e.preventDefault();
    lancerRechercheLecture(($('#lec-q').value || '').trim(), recherche.cat);
  };
  [...document.querySelectorAll('[data-cat]')].forEach(b =>
    b.onclick = () => {
      state.lecture = { q: recherche.q, cat: b.dataset.cat, resultats: [], etat: null };
      renderView();
    });
  [...document.querySelectorAll('.lec-histo')].forEach(b =>
    b.onclick = () => { lancerRechercheLecture(b.dataset.q, recherche.cat); });
}

/* La recherche s'exécute sans re-rendu du champ (les valeurs tapées restent),
 * puis affiche les résultats — comme le formulaire d'ajout de médias. */
export function lancerRechercheLecture(q, cat) {
  if (!q) return;
  state.lecture = { q, cat, resultats: [], etat: 'encours' };
  renderView();
  pousserHisto(q);
  chercher(cat, q)
    .then(resultats => {
      if (state.lecture?.q !== q) return; /* une nouvelle recherche a pris la main */
      state.lecture = { q, cat, resultats, etat: resultats.length ? 'ok' : 'vide' };
      renderView();
    })
    .catch(() => {
      if (state.lecture?.q !== q) return;
      state.lecture = { q, cat, resultats: [], etat: 'vide' };
      renderView();
    });
}
