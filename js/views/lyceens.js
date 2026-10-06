/* views/lyceens.js — ✊ Lycéens (v88) : suivre le mouvement lycéen et étudiant
 * de 2026 en France, en séparant quatre lectures : la version des lycéens,
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
  { id: 'etudiants', nom: '🎓 Version des étudiants' },
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

/* Chronologie « Version des étudiants » : data/etudiants.json (network-first),
 * chargé paresseux et mis en cache dans state, comme lyceens.json. Le fichier
 * peut dépasser 32 Ko : on le fetch en entier, mais on rend les chapitres par
 * tranches pour ne pas bloquer le fil principal. */
async function chargerEtudiants() {
  if (!state.etudiants) {
    try { state.etudiants = await (await fetch('data/etudiants.json', { cache: 'no-store' })).json(); }
    catch (e) { state.etudiants = { erreur: true }; }
  }
  return state.etudiants;
}

/* Un chapitre de la chronologie : <details> repliable, paragraphes horodatés,
 * sources cliquables en pied de carte. Tout texte passe par esc(). */
function carteChapitre(ch, dernier) {
  const paragraphes = Array.isArray(ch.paragraphes) ? ch.paragraphes : [];
  let html = '<details class="carte-regl" id="chapitre-' + esc(String(ch.id || '')) + '"><summary>' +
    '<span class="meta-count">' + esc(ch.periode || '?') + '</span> ' + esc(ch.titre || '') + '</summary>';
  paragraphes.forEach(p => {
    html += '<p>' + (p.horodatage ? '<span class="meta-count">' + esc(p.horodatage) + '</span> — ' : '') +
      esc(p.texte || '') + '</p>';
  });
  if (paragraphes.length) {
    html += '<p' + (dernier ? ' id="fin-texte"' : '') + ' class="meta-count">Fin du chapitre — ' + paragraphes.length +
      ' paragraphe' + (paragraphes.length > 1 ? 's' : '') + '.</p>';
  }
  /* Les sources vivent au niveau du paragraphe : on les rassemble en un
   * footer cliquable, dedupliquées et dans l'ordre. */
  const sources = [];
  paragraphes.forEach(p => (Array.isArray(p.sources) ? p.sources : []).forEach(s => {
    const u = String(s || '');
    if (u && !sources.includes(u)) sources.push(u);
  }));
  if (sources.length) {
    html += '<footer class="form-actions">' + sources.map(s =>
      '<a class="filter-btn active" href="' + esc(s) + '" target="_blank" rel="noopener">🔗 ' + esc(s) + '</a>').join('') + '</footer>';
  }
  return html + '</details>';
}

/* Rendu progressif par tranches de chapitres : le fil principal reste libre
 * même sur un gros fichier. */
function rendreChapitresProgressif(conteneur, chapitres) {
  const TRANCHE = 5;
  let i = 0;
  function tranche() {
    conteneur.insertAdjacentHTML('beforeend', chapitres.slice(i, i + TRANCHE).map(([c, der]) => carteChapitre(c, der)).join(''));
    i += TRANCHE;
    if (i < chapitres.length) (window.requestAnimationFrame || (f => setTimeout(f, 16)))(tranche);
  }
  tranche();
}

/* « ⬇️ Aller à la fin du texte » : déroule le dernier chapitre, défile jusqu'au
 * dernier paragraphe (#fin-texte) puis le surligne brièvement. */
function allerFinTexte() {
  const fin = document.getElementById('fin-texte') || document.getElementById('bloc-etudiants');
  if (!fin) return;
  if (typeof fin.closest === 'function') {
    const det = fin.closest('details');
    if (det) det.open = true;
  }
  if (typeof fin.scrollIntoView === 'function') fin.scrollIntoView({ behavior: 'smooth', block: 'end' });
  fin.style.transition = 'background-color 0.3s';
  fin.style.backgroundColor = 'rgba(255, 213, 79, 0.45)';
  setTimeout(() => { fin.style.backgroundColor = ''; }, 1600);
}

function blocEtudiants(d) {
  return (d.intro ? '<p>' + esc(d.intro) + '</p>' : '') +
    (d.note ? '<p class="hint">🔎 ' + esc(d.note) + '</p>' : '') +
    (d.maj ? '<p class="hint">Mis à jour le ' + esc(d.maj) + '.</p>' : '') +
    '<div class="form-actions"><button class="filter-btn active" id="btn-fin-texte" type="button">⬇️ Aller à la fin du texte</button></div>' +
    '<div id="bloc-etudiants"></div>';
}

function wireBlocEtudiants() {
  const b = document.getElementById('btn-fin-texte');
  if (b) b.onclick = allerFinTexte;
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
  if (state.lyceensSub === 'etudiants' && !state.etudiants) {
    chargerEtudiants().then(() => { if (state.activeTab === 'lyceens') vueLyceens(); }).catch(() => {});
  }
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
      : sous === 'etudiants'
        ? blocEtudiants(state.etudiants || { erreur: true })
        : sous === 'gouvernement'
        ? '<p class="meta-count">' + compteListe(gouv) + '</p>' + (gouv.length ? gouv.map(carteInfo).join('') : '<div class="empty">Aucune info côté gouvernement pour l\u2019instant.</div>')
        : '<p class="meta-count">' + compteListe(faits) + '</p>' + (faits.length ? faits.map(carteInfo).join('') : '<div class="empty">Aucune information corroborée à ce stade.</div>'));

  if (sous === 'etudiants' && state.etudiants && !state.etudiants.erreur) {
    const conteneur = document.getElementById('bloc-etudiants');
    if (conteneur) {
      const chapitres = Array.isArray(state.etudiants.chapitres) ? state.etudiants.chapitres : [];
      if (!chapitres.length) {
        conteneur.innerHTML = '<div class="empty">Chronologie étudiante pas encore publiée — elle apparaîtra ici dès que data/etudiants.json sera rempli.</div>';
      } else {
        rendreChapitresProgressif(conteneur, chapitres.map((c, i) => [c, i === chapitres.length - 1]));
      }
    }
  }
  wireBlocEtudiants();
  wireSousOnglets();
}
