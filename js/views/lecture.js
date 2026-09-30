/* views/lecture.js — 📖 Onglet Lecture (v19) : recherche de documentation
 * numérique (livres, magazines, revues, prépublications), recommandations
 * par catégories, et lecteur intégré — le résumé s'affiche dans l'app,
 * sans quitter le site. */
import { $, state, esc, urlSure, getStore, setStore } from '../core.js';
import { chercher } from '../lecture.js';
import { renderView } from './common.js';

const CATEGORIES = [
  { id: 'tout', nom: 'Tout' },
  { id: 'livres', nom: 'Livres & magazines' },
  { id: 'publications', nom: 'Revues & science' }
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

/* Recommandations par catégories (data/lecture-reco.json, chargées au bootstrap) */
function blocRecommandations() {
  const recos = state.lectureRecos || [];
  if (!recos.length) return '';
  const cats = [...new Set(recos.map(r => r.categorie))];
  return '<div class="summary-card"><h2>✨ Recommandations par catégories</h2>' +
    cats.map(c =>
      '<h3 class="reco-cat">' + esc(c) + '</h3><ul class="reco-list">' +
      recos.filter(r => r.categorie === c).map(r =>
        '<li><button class="reco-btn" data-q="' + esc(r.suggestion) + '">' +
        '<strong>' + esc(r.titre) + '</strong>' +
        '<span>' + esc(r.texte) + '</span></button></li>').join('') +
      '</ul>').join('') + '</div>';
}

function badgeAcces(r) {
  return r.acces === 'ouvert' ? '<span class="badge-access ok">✓ accès libre</span>'
    : r.acces === 'emprunt' ? '<span class="badge-access mid">⤴ emprunt gratuit</span>'
    : r.acces === 'paywall' ? '<span class="badge-access warn">⚠️ paywall probable</span>'
    : '<span class="badge-access">papier seulement</span>';
}

function carteLecture(r, i) {
  const extraitDispo = !!r.extrait;
  return '<div class="article lecture-item">' +
    '<h3>' + esc(r.titre) + '</h3><div class="meta">' +
    esc(r.auteurs.join(', ')) +
    (r.annee ? ' · ' + esc(String(r.annee)) : '') +
    (r.revue ? ' · ' + esc(r.revue) : '') +
    ' · ' + esc(r.source) + '</div>' +
    '<div class="meta">' + badgeAcces(r) + '</div>' +
    '<div class="lec-actions">' +
    (extraitDispo ? '<button class="filter-btn" data-lit="' + i + '">📖 Lire le résumé</button>' : '') +
    (r.pdf ? '<a class="filter-btn" href="' + esc(urlSure(r.pdf)) + '" target="_blank" rel="noopener">PDF libre</a>' : '') +
    '<a class="filter-btn" href="' + esc(urlSure(r.lien)) + '" target="_blank" rel="noopener">Ouvrir ↗</a>' +
    '</div></div>';
}

export function vueLecture() {
  const view = $('#view');
  /* Lecteur ouvert : le résumé s'affiche dans l'app, prioritaire sur la liste */
  if (state.lectureLecture) return vueLecteur();
  const recherche = state.lecture || { q: '', cat: 'tout', resultats: [], etat: null };
  const histo = historique();
  view.innerHTML =
    '<div class="chapter-resume"><h2>📖 Lecture</h2>' +
    '<p class="meta-count">Livres et magazines numériques, revues de presse et scientifiques, prépublications — ' +
    '7 catalogues ouverts fouillés en parallèle, paywall signalé avant de cliquer, ' +
    'résumés lisibles sans quitter le site.</p>' +
    '<form id="lec-form"><div class="subtabs">' +
    CATEGORIES.map(c =>
      '<button type="button" class="subtab' + (recherche.cat === c.id ? ' active' : '') + '" data-cat="' + c.id + '">' + esc(c.nom) + '</button>').join('') +
    '</div>' +
    '<label>Rechercher un ouvrage, un magazine, une revue…' +
    '<input id="lec-q" type="search" inputmode="search" autocomplete="off" placeholder="ex. Sapiens, Zola, climate change, intelligence artificielle…"' +
    ' value="' + esc(recherche.q) + '"></label>' +
    '<div class="form-actions"><button class="filter-btn active" type="submit">🔎 Chercher</button>' +
    (recherche.etat ? '<button type="button" class="filter-btn" id="lec-reset">✨ Recommandations</button>' : '') +
    '</div></form>' +
    (histo.length && !recherche.etat ? '<p class="hint">Récentes : ' + histo.map(h =>
      '<button type="button" class="tab lec-histo" data-q="' + esc(h) + '">' + esc(h) + '</button>').join(' ') + '</p>' : '') +
    '</div>' +
    (!recherche.etat ? blocRecommandations()
      : recherche.etat === 'encours'
        ? '<div class="empty">🔎 Recherche en cours…</div>'
        : recherche.etat === 'vide'
          ? '<div class="empty">Aucun résultat — essaie un autre titre, auteur ou mot-clé. 🌱</div>'
          : (recherche.resultats || []).map((r, i) => carteLecture(r, i)).join(''));
  const form = $('#lec-form');
  if (form) form.onsubmit = e => {
    e.preventDefault();
    lancerRechercheLecture(($('#lec-q').value || '').trim(), recherche.cat);
  };
  const reset = $('#lec-reset');
  if (reset) reset.onclick = () => { state.lecture = { q: '', cat: recherche.cat, resultats: [], etat: null }; renderView(); };
  [...document.querySelectorAll('[data-cat]')].forEach(b =>
    b.onclick = () => {
      state.lecture = { q: recherche.q, cat: b.dataset.cat, resultats: [], etat: null };
      renderView();
    });
  [...document.querySelectorAll('.lec-histo, .reco-btn')].forEach(b =>
    b.onclick = () => { lancerRechercheLecture(b.dataset.q, recherche.cat); });
  [...document.querySelectorAll('[data-lit]')].forEach(b =>
    b.onclick = () => {
      const r = (state.lecture?.resultats || [])[parseInt(b.dataset.lit, 10)];
      if (r) { state.lectureLecture = r; renderView(); window.scrollTo(0, 0); }
    });
}

/* --- Lecteur intégré : le résumé dans l'app, bouton retour à la liste --- */
function vueLecteur() {
  const r = state.lectureLecture;
  const view = $('#view');
  view.innerHTML =
    '<button class="back-btn" id="btn-back-lecture">← Retour aux résultats</button>' +
    '<div class="summary-card"><h2>📖 ' + esc(r.titre) + '</h2>' +
    '<p class="meta-count">' + esc(r.auteurs.join(', ')) +
    (r.annee ? ' · ' + esc(String(r.annee)) : '') +
    (r.revue ? ' · ' + esc(r.revue) : '') +
    ' · ' + esc(r.source) + ' · ' + '</p>' +
    '<p class="meta-count">' + badgeAcces(r) + '</p></div>' +
    '<div class="summary-card lecteur-corps"><p>' + esc(r.extrait || 'Pas de résumé disponible pour ce document.') + '</p></div>' +
    '<div class="form-actions">' +
    (r.pdf ? '<a class="filter-btn active" href="' + esc(urlSure(r.pdf)) + '" target="_blank" rel="noopener">📄 PDF libre</a>' : '') +
    '<a class="filter-btn" href="' + esc(urlSure(r.lien)) + '" target="_blank" rel="noopener">Ouvrir la source ↗</a>' +
    '</div>';
  $('#btn-back-lecture').onclick = () => { state.lectureLecture = null; renderView(); window.scrollTo(0, 0); };
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
