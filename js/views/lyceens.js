/* views/lyceens.js — ✊ Lycéens (v89) : suivre le mouvement lycéen et étudiant
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

/* Chronique « Version des étudiants » : data/etudiants/index.json (network-first),
 * puis, dans l'ordre, chaque fichier data/etudiants/chapitres/NN.json listé dans
 * chapitres[]. Tout est stocké UNE fois dans state.etudiants (index + chapitres
 * chargés) : aucun rechargement ni re-render complet ensuite. */
async function chargerEtudiants() {
  if (state.etudiants) return state.etudiants;
  const etu = { index: null, chapitres: [], erreur: false, promesse: null };
  state.etudiants = etu;
  etu.promesse = (async () => {
    try {
      etu.index = await (await fetch('data/etudiants/index.json', { cache: 'no-store' })).json();
    } catch (e) { etu.erreur = true; return; }
    const liste = Array.isArray(etu.index.chapitres) ? etu.index.chapitres : [];
    /* Les chapitres sont chargés les uns après les autres, dans l'ordre de
     * l'index ; un chapitre manquant devient un bloc vide, sans casser la suite. */
    for (const e of liste) {
      try {
        etu.chapitres.push(await (await fetch('data/etudiants/' + e.fichier, { cache: 'no-store' })).json());
      } catch (err) {
        etu.chapitres.push({ id: e.id, periode: e.periode, titre: e.titre, paragraphes: [] });
      }
    }
  })();
  return etu;
}

/* Un paragraphe : <p> échappé, sources en petites lignes dessous. Les
 * paragraphes auto: true portent la classe releve-auto (style discret) et un
 * badge « relevé auto ». Le DERNIER paragraphe du DERNIER chapitre reçoit
 * id="fin-texte" pour le bouton d'accès rapide à la fin. */
function paragrapheHtml(p, dernier) {
  const auto = p && p.auto === true;
  const sources = Array.isArray(p.sources) ? p.sources.filter(Boolean) : [];
  return '<p' + (dernier ? ' id="fin-texte"' : '') + (auto ? ' class="releve-auto"' : '') + '>' +
    (auto ? '<span class="badge-auto">relevé auto</span> ' : '') +
    esc(p.texte || '') + '</p>' +
    (sources.length
      ? '<p class="meta-count">' + sources.map(s =>
        '<a href="' + esc(s) + '" target="_blank" rel="noopener">🔗 ' + esc(s) + '</a>').join(' · ') + '</p>'
      : '');
}

/* Un chapitre : bloc <h3> (titre + période), puis ses paragraphes. */
function chapitreHtml(ch, dernier) {
  const ps = Array.isArray(ch.paragraphes) ? ch.paragraphes : [];
  return '<section class="chapter-resume chapitre-etudiant" id="chapitre-' + esc(String(ch.id || '')) + '">' +
    '<h3>' + esc(ch.titre || '') + (ch.periode ? ' <span class="meta-count">' + esc(ch.periode) + '</span>' : '') + '</h3>' +
    ps.map((p, i) => paragrapheHtml(p, dernier && i === ps.length - 1)).join('') +
    '</section>';
}

/* Compteur discret : total de caractères (somme des octets déclarés par
 * l'index), date de mise à jour et nombre de paragraphes. */
function compteurEtudiants(d) {
  const octets = (Array.isArray(d.chapitres) ? d.chapitres : []).reduce((a, c) => a + (+c.octets || 0), 0);
  const cars = octets >= 100000 ? '100\u00a0000+ caractères' : (octets ? octets.toLocaleString('fr-FR') + ' caractères' : '');
  const morceaux = [];
  if (cars) morceaux.push(cars);
  if (d.maj) morceaux.push('mis à jour le ' + esc(d.maj));
  if (d.totalParagraphes) morceaux.push(esc(String(d.totalParagraphes)) + ' paragraphes');
  return morceaux.length ? '<p class="meta-count">' + morceaux.join(' · ') + '</p>' : '';
}

/* Montage du bloc : attend la fin du chargement (index + chapitres) puis rend
 * la chronique une seule fois dans le conteneur frais de l'onglet. */
async function initEtudiants(conteneur) {
  const etu = state.etudiants;
  if (!etu || !etu.promesse) return;
  await etu.promesse;
  if (!document.getElementById('bloc-etudiants')) return;
  if (etu.erreur) {
    conteneur.innerHTML = '<div class="empty">Chronologie étudiante momentanément indisponible — data/etudiants/index.json ne répond pas.</div>';
    return;
  }
  if (!etu.chapitres.length) {
    conteneur.innerHTML = '<div class="empty">Chronologie pas encore publiée — elle apparaîtra ici dès que data/etudiants/ sera rempli.</div>';
    return;
  }
  conteneur.innerHTML = etu.chapitres.map((c, i) => chapitreHtml(c, i === etu.chapitres.length - 1)).join('');
}

/* « ⬇️ Aller à la fin du texte » : attend que tous les chapitres soient
 * chargés si c'est encore en cours, puis défile jusqu'à #fin-texte et le
 * surligne brièvement. */
async function allerFinTexte() {
  const etu = state.etudiants;
  if (etu && etu.promesse) await etu.promesse;
  const fin = document.getElementById('fin-texte') || document.getElementById('bloc-etudiants');
  if (!fin) return;
  if (typeof fin.scrollIntoView === 'function') fin.scrollIntoView({ behavior: 'smooth', block: 'end' });
  fin.style.transition = 'background-color 0.3s';
  fin.style.backgroundColor = 'rgba(255, 213, 79, 0.45)';
  setTimeout(() => { fin.style.backgroundColor = ''; }, 1600);
}

function blocEtudiants(d) {
  return '<div class="summary-card">' +
    '<h2>🎓 ' + esc(d.titre || 'Version des étudiants') + '</h2>' +
    (d.intro ? '<p class="meta-count">' + esc(d.intro) + '</p>' : '') +
    (d.note ? '<p class="hint">🔎 ' + esc(d.note) + '</p>' : '') +
    compteurEtudiants(d) +
    '</div>' +
    '<div class="form-actions"><button class="filter-btn active" id="btn-fin-texte" type="button">⬇️ Aller à la fin du texte</button></div>' +
    '<div id="bloc-etudiants"><div class="empty">Chargement de la chronologie étudiante…</div></div>';
}

function wireBlocEtudiants() {
  const b = document.getElementById('btn-fin-texte');
  if (b) b.onclick = () => { allerFinTexte().catch(() => {}); };
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
  if (state.lyceensSub === 'etudiants' && !state.etudiants) chargerEtudiants().catch(() => {});
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
        ? blocEtudiants(state.etudiants && state.etudiants.index ? state.etudiants.index : {})
        : sous === 'gouvernement'
        ? '<p class="meta-count">' + compteListe(gouv) + '</p>' + (gouv.length ? gouv.map(carteInfo).join('') : '<div class="empty">Aucune info côté gouvernement pour l\u2019instant.</div>')
        : '<p class="meta-count">' + compteListe(faits) + '</p>' + (faits.length ? faits.map(carteInfo).join('') : '<div class="empty">Aucune information corroborée à ce stade.</div>'));

  if (sous === 'etudiants') {
    const conteneur = document.getElementById('bloc-etudiants');
    if (conteneur) initEtudiants(conteneur).catch(() => {});
  }
  wireBlocEtudiants();
  wireSousOnglets();
}
