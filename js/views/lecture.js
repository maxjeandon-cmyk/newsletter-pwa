/* views/lecture.js — 📖 Onglet Lecture (v19) : recherche de documentation
 * numérique (livres, magazines, revues, prépublications), recommandations
 * par catégories, et lecteur intégré — le résumé s'affiche dans l'app,
 * sans quitter le site. */
import { $, state, esc, urlSure, getStore, setStore } from '../core.js';
import { chercher, ouvrirOuvrage, ouvrirVersion } from '../lecture.js';
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
  const ouvrage = r.type === 'livre' || r.type === 'patrimoine';
  return '<div class="article lecture-item">' +
    '<h3>' + esc(r.titre) + '</h3><div class="meta">' +
    esc(r.auteurs.join(', ')) +
    (r.annee ? ' · ' + esc(String(r.annee)) : '') +
    (r.revue ? ' · ' + esc(r.revue) : '') +
    ' · ' + esc(r.source) + '</div>' +
    '<div class="meta">' + badgeAcces(r) + '</div>' +
    '<div class="lec-actions">' +
    (extraitDispo ? '<button class="filter-btn" data-lit="' + i + '">📖 Résumé</button>' : '') +
    (ouvrage ? '<button class="filter-btn active" data-ouvrir="' + i + '">📚 Ouvrir dans le lecteur</button>' : '') +
    (r.pdf ? '<a class="filter-btn" href="' + esc(urlSure(r.pdf)) + '" target="_blank" rel="noopener">PDF libre</a>' : '') +
    '<a class="filter-btn" href="' + esc(urlSure(r.lien)) + '" target="_blank" rel="noopener">Source ↗</a>' +
    '</div></div>';
}

export function vueLecture() {
  const view = $('#view');
  /* Lecteur d'ouvrage (agent d'ouverture) : prioritaire sur tout */
  if (state.lectureOuverture) return vueOuverture();
  /* Lecteur de résumé : prioritaire sur la liste */
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
  [...document.querySelectorAll('[data-ouvrir]')].forEach(b =>
    b.onclick = () => {
      const r = (state.lecture?.resultats || [])[parseInt(b.dataset.ouvrir, 10)];
      if (r) lancerOuverture(r);
    });
}

/* --- Agent d'ouverture : deep-search d'une version numérique, affichage dans
 *     le lecteur intégré — texte intégral paginé, ou conditions d'emprunt. --- */
export function lancerOuverture(r) {
  state.lectureOuverture = { etat: 'encours', base: r };
  renderView();
  ouvrirOuvrage(r)
    .then(res => {
      if (state.lectureOuverture?.base?.titre !== r.titre) return;
      state.lectureOuverture = { ...res, etat: res.type };
      if (res.type === 'texte') {
        state.lectureOuverture.page = 0;
        state.lectureOuverture.pages = paginer(res.texte);
      }
      renderView();
    })
    .catch(() => {
      if (state.lectureOuverture?.base?.titre !== r.titre) return;
      state.lectureOuverture = { type: 'indisponible', raison: 'reseau', lien: r.lien, titre: r.titre, etat: 'indisponible' };
      renderView();
    });
}

/* Découper le texte intégral en pages lisibles (~6 000 caractères, coupure
 * au prochain saut de ligne pour ne pas couper les mots). */
function paginer(texte, taille = 6000) {
  const pages = [];
  let i = 0;
  while (i < texte.length) {
    let fin = Math.min(i + taille, texte.length);
    if (fin < texte.length) {
      const coupure = texte.indexOf('\n', fin - 600);
      if (coupure > i) fin = coupure;
    }
    pages.push(texte.slice(i, fin).trim());
    i = fin;
  }
  return pages;
}

function blocVersion(ouverture) {
  const versions = ouverture.versions || [];
  if (versions.length < 2) return '';
  return '<div class="summary-card"><h2>🔀 Autres versions</h2>' +
    '<p class="meta-count">Autres éditions numériques — si la qualité déçoit (OCR, mise en page), change de version.</p>' +
    '<ul class="reco-list">' +
    versions.map(v =>
      '<li><button class="reco-btn" data-vers="' + esc(v.origine + ':' + v.id) + '">' +
      '<strong>' + esc(v.titre) + '</strong>' +
      '<span>' + (v.acces === 'ouvert' ? '✓ libre' : '⤴ emprunt') +
      ' · ' + esc(v.format || 'ebook') + (v.fr ? ' · 🇫🇷 français' : '') +
      ' · ' + esc(v.origine === 'gutenberg' ? 'Gutenberg #' + v.id : v.id) + '</span></button></li>').join('') +
    '</ul></div>';
}

function vueOuverture() {
  const o = state.lectureOuverture;
  const view = $('#view');
  if (o.etat === 'encours') {
    view.innerHTML =
      '<button class="back-btn" id="btn-back-lecture">← Retour aux résultats</button>' +
      '<div class="empty">🔎 L\u2019agent fouille les éditions numérisées à la recherche d\u2019une version libre et disponible…</div>';
  } else if (o.type === 'texte') {
    view.innerHTML =
      '<button class="back-btn" id="btn-back-lecture">← Retour aux résultats</button>' +
      '<div class="summary-card"><h2>📖 ' + esc(o.titre || o.base?.titre || '') + '</h2>' +
      '<p class="meta-count">Édition : ' + esc(o.edition) + ' · ' +
      (o.natif ? 'ebook natif (texte propre)' : 'OCR (qualité variable)') + '</p>' +
      '<div class="lec-nav">' +
      '<button class="filter-btn" id="lec-prev"' + (o.page === 0 ? ' disabled' : '') + '>← Précédent</button>' +
      '<span class="meta-count">Page ' + (o.page + 1) + ' / ' + o.pages.length + '</span>' +
      '<button class="filter-btn" id="lec-next"' + (o.page >= o.pages.length - 1 ? ' disabled' : '') + '>Suivant →</button>' +
      '</div></div>' +
      '<div class="summary-card lecteur-corps"><p>' + esc(o.pages[o.page]) + '</p></div>' +
      '<div class="form-actions">' +
      (o.epub ? '<a class="filter-btn" href="' + esc(urlSure(o.epub)) + '" target="_blank" rel="noopener" download>⤓ Télécharger l\u2019EPUB</a>' : '') +
      '<a class="filter-btn" href="' + esc(urlSure(o.lien)) + '" target="_blank" rel="noopener">Fiche complète ↗</a>' +
      '</div>' +
      blocVersion(o);
  } else if (o.type === 'emprunt') {
    const c = o.conditions;
    view.innerHTML =
      '<button class="back-btn" id="btn-back-lecture">← Retour aux résultats</button>' +
      '<div class="summary-card"><h2>📚 ' + esc(o.titre || o.base?.titre || '') + '</h2>' +
      '<p class="meta-count">Le texte intégral n\u2019est pas libre — voici les conditions d\u2019emprunt trouvées par l\u2019agent.</p></div>' +
      '<div class="summary-card lecteur-corps">' +
      '<h2 style="font-size:15px">Conditions d\u2019emprunt</h2>' +
      '<p>✓ Cette édition est <strong>prêtable gratuitement</strong> via Internet Archive (contrôle : un lecteur à la fois, comme une vraie bibliothèque).</p>' +
      '<p>· Statut de prêt : <strong>' + esc(c.statut || 'prêtable') + '</strong></p>' +
      '<p>· Collections : ' + esc(c.collections.join(', ')) + '</p>' +
      (c.formats?.length ? '<p>· Formats numériques : ' + esc(c.formats.join(', ')) + '</p>' : '') +
      '<p>· Durée usuelle : 1 heure (lecture en ligne) ou 14 jours (emprunt EPUB/PDF, selon l\u2019édition).</p>' +
      '<p>· Un <strong>compte Internet Archive gratuit</strong> est nécessaire pour emprunter.</p>' +
      '</div>' +
      '<div class="form-actions">' +
      '<a class="filter-btn active" href="' + esc(urlSure(o.lien)) + '" target="_blank" rel="noopener">⤴ Emprunter sur Archive.org</a>' +
      '</div>' +
      blocVersion(o);
  } else {
    const raisons = {
      gallica: 'Cette édition est sur Gallica — le lecteur intégré de la BnF l\u2019affichera directement.',
      numerique: 'Aucune édition numérisée libre n\u2019a été trouvée pour cet ouvrage.',
      protege: 'Des éditions numérisées existent mais aucune n\u2019est disponible en ce moment.',
      reseau: 'L\u2019agent n\u2019a pas pu joindre les catalogues — retente dans un instant.'
    };
    view.innerHTML =
      '<button class="back-btn" id="btn-back-lecture">← Retour aux résultats</button>' +
      '<div class="empty">ℹ️ ' + esc(raisons[o.raison] || raisons.numerique) + '</div>' +
      '<div class="form-actions">' +
      '<a class="filter-btn" href="' + esc(urlSure(o.lien || '#')) + '" target="_blank" rel="noopener">Voir sur le site source ↗</a>' +
      '</div>' +
      (o.versions ? blocVersion(o) : '');
  }
  const back = $('#btn-back-lecture');
  if (back) back.onclick = () => { state.lectureOuverture = null; renderView(); window.scrollTo(0, 0); };
  const prev = $('#lec-prev');
  if (prev) prev.onclick = () => { if (o.page > 0) { o.page--; renderView(); window.scrollTo(0, 0); } };
  const next = $('#lec-next');
  if (next) next.onclick = () => { if (o.page < o.pages.length - 1) { o.page++; renderView(); window.scrollTo(0, 0); } };
  [...document.querySelectorAll('[data-vers]')].forEach(b =>
    b.onclick = () => {
      const v = (o.versions || []).find(x => x.origine + ':' + x.id === b.dataset.vers);
      if (!v) return;
      o.etat = 'encours';
      renderView();
      ouvrirVersion(v, o.versions)
        .then(res => {
          if (res.type === 'texte') { res.pages = paginer(res.texte); res.page = 0; }
          state.lectureOuverture = { ...res, etat: res.type, base: o.base };
          renderView(); window.scrollTo(0, 0);
        })
        .catch(() => { o.etat = o.type; renderView(); });
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
