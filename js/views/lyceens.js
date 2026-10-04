/* views/lyceens.js — ✊ Lycéens (v87) : suivre le mouvement lycéen et étudiant
 * de 2026 en France, en séparant trois lectures : la version des lycéens,
 * la version du gouvernement, et les seules informations corroborées par
 * plusieurs médias indépendants. Chaque info porte un badge ✅ (vérifiée,
 * au moins deux médias indépendants) ou ⚠️ (une seule source à ce stade).
 * Données : data/lyceens.json (network-first, rafraîchi toutes les 6 h par
 * la maintenance via tools/lyceens.js — modifier les données suffit, sans
 * livraison de code). Règle d'hygiène : tout texte des données passe par esc(). */
import { $, state, esc } from '../core.js';
import { renderView } from './common.js';

const SOUS_ONGLETS_LYCEENS = () => [
  { id: 'lyceens', nom: '✊ Version des lycéens' },
  { id: 'gouvernement', nom: '🏛️ Version du gouvernement' },
  { id: 'faits', nom: '✅ Faits vérifiés uniquement' }
];

/* Chargement paresseux, en cache dans state après le premier passage. */
async function chargerLyceens() {
  if (!state.lyceens) {
    try { state.lyceens = await (await fetch('data/lyceens.json', { cache: 'no-store' })).json(); }
    catch (e) { state.lyceens = { erreur: true }; }
  }
  return state.lyceens;
}

function sousOnglets(sub) {
  return '<div class="subtabs">' + SOUS_ONGLETS_LYCEENS().map(x =>
    '<button class="subtab' + (x.id === sub ? ' active' : '') + '" data-s="' + x.id + '">' + esc(x.nom) + '</button>').join('') + '</div>';
}

function wireSousOnglets() {
  [...document.querySelectorAll('.subtab[data-s]')].forEach(b =>
    b.onclick = () => { state.lyceensSub = b.dataset.s; renderView(); window.scrollTo(0, 0); });
}

/* Une info, une carte repliable : badge de vérification + date + titre en
 * summary, texte, sources et lien dans le corps. */
function carteInfo(i) {
  const badge = i.verifie ? '✅' : '⚠️';
  const sources = Array.isArray(i.sources) && i.sources.length ? i.sources.join(', ') : (i.source || 'source inconnue');
  return '<details class="carte-regl"><summary>' + badge +
    ' <span class="meta-count">' + esc(i.date || '?') + '</span> ' + esc(i.titre || '') + '</summary>' +
    (i.texte ? '<p>' + esc(i.texte) + '</p>' : '') +
    '<p class="meta-count">' + (i.verifie ? 'Vérifié — ' : 'Non vérifié — ') + esc(sources) + '</p>' +
    (i.url
      ? '<div class="form-actions"><a class="filter-btn active" href="' + esc(i.url) + '" target="_blank" rel="noopener">📰 Lire l\u2019article source</a></div>'
      : '<p class="hint">Pas de lien public — dépêche ou communiqué relevé par la maintenance.</p>') +
    '</details>';
}

/* Compteur d'une liste : « N info(s), dont M vérifiée(s) ». */
function compteListe(liste) {
  const n = liste.length;
  const v = liste.filter(i => i.verifie).length;
  return n + ' info' + (n > 1 ? 's' : '') + ', dont ' + v + ' vérifiée' + (v > 1 ? 's' : '');
}

function trier(liste) {
  /* dd/mm/yyyy → tri du plus récent au plus ancien. */
  const d = s => { const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(s || ''); return m ? +m[3] * 10000 + +m[2] * 100 + +m[1] : 0; };
  return liste.slice().sort((a, b) => d(b.date) - d(a.date));
}

export function vueLyceens() {
  const view = $('#view');
  const d = state.lyceens;
  if (!d) {
    view.innerHTML = '<div class="empty">Chargement du suivi du mouvement lycéen…</div>';
    chargerLyceens().then(() => { if (state.activeTab === 'lyceens') vueLyceens(); }).catch(() => {});
    return;
  }
  const sous = SOUS_ONGLETS_LYCEENS().some(x => x.id === state.lyceensSub) ? state.lyceensSub : 'lyceens';
  const lyceens = trier(Array.isArray(d.version_lyceens) ? d.version_lyceens : []);
  const gouv = trier(Array.isArray(d.version_gouvernement) ? d.version_gouvernement : []);
  const faitsPurs = trier(Array.isArray(d.faits) ? d.faits : []);
  /* « Faits vérifiés uniquement » : les faits neutres corroborés + les infos
   * vérifiées des deux versions — rien d'autre n'entre dans ce sous-onglet. */
  const faits = faitsPurs.concat(lyceens.filter(i => i.verifie), gouv.filter(i => i.verifie));

  view.innerHTML =
    '<div class="summary-card"><h2>✊ ' + esc(d.titre || 'Mouvement lycéen') + '</h2>' +
    (d.intro ? '<p class="meta-count">' + esc(d.intro) + '</p>' : '') +
    (d.note ? '<p class="hint">🔎 ' + esc(d.note) + '</p>' : '') +
    (d.prochaine_echeance ? '<p class="meta-count">📅 ' + esc(d.prochaine_echeance) + '</p>' : '') +
    (d.maj ? '<p class="hint">Mis à jour le ' + esc(d.maj) + ' — rafraîchi automatiquement toutes les 6 h par la maintenance.</p>' : '') +
    '</div>' +
    (Array.isArray(d.contexte) && d.contexte.length
      ? '<div class="chapter-resume"><h2>📌 Chronologie</h2><ul>' +
        d.contexte.map(c => '<li>' + esc(c) + '</li>').join('') + '</ul></div>'
      : '') +
    sousOnglets(sous) +
    (d.erreur
      ? '<div class="empty">Suivi momentanément indisponible — il revient dès que data/lyceens.json répondra.</div>'
      : '') +
    (sous === 'lyceens'
      ? '<p class="meta-count">' + compteListe(lyceens) + '</p>' + (lyceens.length ? lyceens.map(carteInfo).join('') : '<div class="empty">Aucune info côté lycéens pour l\u2019instant.</div>')
      : sous === 'gouvernement'
        ? '<p class="meta-count">' + compteListe(gouv) + '</p>' + (gouv.length ? gouv.map(carteInfo).join('') : '<div class="empty">Aucune info côté gouvernement pour l\u2019instant.</div>')
        : '<p class="meta-count">' + compteListe(faits) + '</p>' + (faits.length ? faits.map(carteInfo).join('') : '<div class="empty">Aucune information corroborée à ce stade.</div>'));

  wireSousOnglets();
}
