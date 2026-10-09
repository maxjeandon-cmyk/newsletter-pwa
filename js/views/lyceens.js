/* views/lyceens.js — ✊ Lycéens 2026 (v113) : suivre le mouvement lycéen et étudiant
 * de 2026 en France, en quatre lectures : la « Version des Lycéens » (chronique
 * puis chapitres transverses), la version du gouvernement, les seules
 * informations corroborées par plusieurs médias indépendants, et la chronologie
 * des jalons du mouvement (v106 : la 📍 Chronologie quitte le haut de l'onglet —
 * où elle n'était plus lisible au fil de l'allongement du suivi — pour devenir
 * un sous-onglet à part entière, après les faits multisources ; v107 : le
 * sous-onglet « ✅ Faits vérifiés » est renommé « ✅ Faits multisources », plus
 * fidèle à ce qu il montre — des faits corroborés par plusieurs médias ; v108 :
 * le sous-onglet « 📍 Chronologie » devient « 📍 Chronologie résumée », pour
 * le distinguer du fil détaillé de la « Version des étudiants » ; v109 : l'encart
 * « Révolte lycéenne » devient une carte repliable <details> (même style que les
 * chapitres), repliée par défaut — la date de mise à jour reste visible dans le
 * <summary>. La prose de l'encart (intro, échéance) est éditoriale : la
 * maintenance ne l'écrit jamais, elle vit aux éditions ; v110 : l'en-tête de
 * section « Version des étudiants — la chronique » (et son jumeau d avant la
 * fusion v111) devient lui aussi une carte repliable, repliée par défaut —
 * titre au <summary>, description dedans, les chapitres respirent en dessous).
 * v111 : fusion « Version des Lycéens » (décision de Maxime du 08/10/2026) — le
 * sous-onglet de chapitres transverses disparaît, la « Version des étudiants »
 * devient « Version des Lycéens » et les absorbe ; l'ordre
 * interne est « chronologie d'abord, transverses à la fin » ; l'intro (🔎), le
 * compteur et la note (💡) vivent DANS la carte déroulante d'en-tête, le bouton
 * fin du texte reste dessous.
 * v112 : chapitres REPLIÉS par défaut (demande de Maxime du 08/10/2026 — le fil
 * est long, on laisse le lecteur déplier ce qu il veut lire) ; le bouton
 * ⬇️ « Aller à la fin du texte » ouvre la carte qui porte l ancre avant de défiler.
 * v113 : EXCEPTION — le chapitre du jour (index.chapitreJour) reste ouvert par
 * défaut : le visiteur qui revient voir « quoi de neuf » tombe directement sur
 * le fil en cours, tous les autres restent repliés.
 * v116 : jumeau du bouton de fin — « ⬆️ Revenir au début du texte » au bout du
 * fil (initSection), qui remonte à la carte d'en-tête (#entete-section),
 * l'ouvre et la surligne (demande de Maxime du 09/10/2026).
 * v117 : « 🧵 Reprendre le fil » à côté du ⬇️ — saute au chapitre du jour
 * (index.chapitreJour, le fil narratif en cours, ouverts par défaut v113),
 * transverses ignorées ; repli sur le PREMIER chapitre de la section si
 * l'index n'a pas de chapitre du jour.
 * Données :
 *  - data/lyceens.json (network-first, versions gouvernement + faits vérifiées) ;
 *  - data/etudiants/index.json, chargé UNE seule fois, puis les fichiers
 *    data/etudiants/chapitres/NN.json au fil du besoin. L'index porte
 *    sections: [{id, titre, description, chapitres: [...]}] ; la vue ne lit
 *    QUE la section id « chronique » (tolérance aux deux états de l'index :
 *    [chronique, complement] ou [chronique] seul).
 * data/lyceens.json n'a plus de champ version_lyceens.
 * Règle d'hygiène : tout texte des données passe par esc().
 */
import { $, state, esc } from '../core.js';
import { renderView, boutonReplier } from './common.js';

const SOUS_ONGLETS_LYCEENS = () => [
  { id: 'etudiants', nom: '🎓 Version des Lycéens' },
  { id: 'gouvernement', nom: '🏛️ Version du gouvernement' },
  { id: 'faits', nom: '✅ Faits multisources' },
  { id: 'chronologie', nom: '📍 Chronologie résumée' }
];

const SECTION_SOUS_ONGLET = { etudiants: 'chronique' };

/* Chargement paresseux, en cache dans state après le premier passage.
 * data/lyceens.json n'a plus de champ version_lyceens : seules les versions
 * gouvernement et faits y sont lues.
 */
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

/* data/etudiants/index.json est chargé UNE seule fois ; les fichiers de
 * chapitres sont chargés au fil du besoin et gardés dans etu.parId.
 * Structure : { index, parId: {id: chapitre}, promesseIndex, erreur }.
 */
function etatEtudiants() {
  if (!state.etudiants) {
    state.etudiants = { index: null, parId: {}, promesseIndex: null, erreur: false };
    state.etudiants.promesseIndex = (async () => {
      try {
        state.etudiants.index = await (await fetch('data/etudiants/index.json', { cache: 'no-store' })).json();
      } catch (e) { state.etudiants.erreur = true; }
      /* L'index arrive après le premier rendu : rafraîchir l'onglet une seule fois. */
      if (state.activeTab === 'lyceens') vueLyceens();
    })();
  }
  return state.etudiants;
}

/* Retourne la section demandée de l'index ({id, titre, description, chapitres}). */
function sectionDe(id) {
  const sections = Array.isArray(state.etudiants?.index?.sections) ? state.etudiants.index.sections : [];
  return sections.find(s => s && s.id === id) || null;
}

/* Charge les fichiers d'une section, dans l'ordre, une seule fois chacun ;
 * un chapitre manquant devient un bloc vide, sans casser la suite. */
async function chargerSection(section) {
  const etu = etatEtudiants();
  await etu.promesseIndex;
  const liste = Array.isArray(section?.chapitres) ? section.chapitres : [];
  for (const e of liste) {
    if (!e || etu.parId[e.id]) continue;
    try {
      etu.parId[e.id] = await (await fetch('data/etudiants/' + e.fichier, { cache: 'no-store' })).json();
    } catch (err) {
      etu.parId[e.id] = { id: e.id, periode: e.periode, titre: e.titre, paragraphes: [] };
    }
  }
  return liste.map(e => e && etu.parId[e.id]).filter(Boolean);
}

/* Un paragraphe : <p> échappé, sources en petites lignes dessous. Les
 * paragraphes auto: true portent la classe releve-auto et le badge « relevé auto ».
 * dernier=true pose l'ancre id="fin-texte" (Version des Lycéens uniquement).
 */
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

/* Un chapitre : carte repliable <details class="carte-regl"> (même style que
 * les lettres d ONG de l onglet Newsletters), titre + période en <summary>,
 * paragraphes dedans une fois déplié. v112 : TOUS les chapitres sont repliés
 * par défaut ; v113 : exception pour le chapitre du jour (index.chapitreJour),
 * ouvert par défaut. dernier=true garde l ancre fin-texte sur le dernier
 * paragraphe. */
function chapitreHtml(ch, dernier, ouvert) {
  const ps = Array.isArray(ch.paragraphes) ? ch.paragraphes : [];
  return '<details class="carte-regl chapitre-etudiant"' + (ouvert ? ' open' : '') + ' id="chapitre-' + esc(String(ch.id || '')) + '">' +
    '<summary>' + esc(ch.titre || '') + (ch.periode ? ' <span class="meta-count">' + esc(ch.periode) + '</span>' : '') + '</summary>' +
    ps.map((p, i) => paragrapheHtml(p, dernier && i === ps.length - 1)).join('') +
    boutonReplier('Replier le chapitre') +
    '</details>';
}

/* Tête d'une section : titre + description de l'index. v110 : carte repliable
 * (même style que l'encart v109), repliée par défaut — la description est
 * méthodologique, les chapitres sont la matière ; on les laisse respirer. */
function enteteSection(section, supplementHtml) {
  /* v116 : id stable — c'est la cible du bouton « ⬆️ Revenir au début du
   * texte » : le début du texte EST cette carte (description, intro, compteur,
   * note y vivent depuis la v111). */
  return '<details class="carte-regl entete-section" id="entete-section">' +
    '<summary>🎓 ' + esc(section.titre || '') + '</summary>' +
    (section.description ? '<p class="meta-count">' + esc(section.description) + '</p>' : '') +
    (supplementHtml || '') +
    boutonReplier() +
    '</details>';
}

/* Compteur discret : total de caractères (octets déclarés), date de mise à
 * jour et nombre de paragraphes de l'index. */
function compteurEtudiants(d) {
  const sections = Array.isArray(d.sections) ? d.sections : [];
  const octets = sections.reduce((a, s) =>
    a + (Array.isArray(s.chapitres) ? s.chapitres.reduce((b, c) => b + (+c.octets || 0), 0) : 0), 0);
  const cars = octets >= 100000 ? '100\u00a0000+ caractères' : (octets ? octets.toLocaleString('fr-FR') + ' caractères' : '');
  const morceaux = [];
  if (cars) morceaux.push(cars);
  if (d.maj) morceaux.push('mis à jour le ' + esc(d.maj));
  if (d.totalParagraphes) morceaux.push(esc(String(d.totalParagraphes)) + ' paragraphes');
  return morceaux.length ? '<p class="meta-count">' + morceaux.join(' · ') + '</p>' : '';
}

/* Montage d'un bloc de section : attend l'index puis les chapitres, puis rend
 * une seule fois dans le conteneur frais de l'onglet. */
async function initSection(conteneur, idSection, avecFinTexte) {
  const etu = etatEtudiants();
  await etu.promesseIndex;
  const section = sectionDe(idSection);
  if (!document.getElementById('bloc-etudiants')) return;
  if (etu.erreur) {
    conteneur.innerHTML = '<div class="empty">Chronologie étudiante momentanément indisponible — data/etudiants/index.json ne répond pas.</div>';
    return;
  }
  const chapitres = await chargerSection(section);
  if (!chapitres.length) {
    conteneur.innerHTML = '<div class="empty">Section pas encore publiée — elle apparaîtra ici dès que data/etudiants/ sera rempli.</div>';
    return;
  }
  /* v113 : le chapitre du jour (index.chapitreJour) reste OUVERT par défaut ;
   * tous les autres restent repliés (v112). */
  const jour = etu.index && etu.index.chapitreJour && etu.index.chapitreJour.id;
  conteneur.innerHTML = chapitres.map((c, i) =>
    chapitreHtml(c, avecFinTexte && i === chapitres.length - 1, c.id === jour)).join('') +
    /* v116 : jumeau du bouton de fin — « ⬆️ Revenir au début du texte » vit au
     * bout du fil, après le dernier chapitre (le ⬇️ est en tête, celui-ci
     * referme la boucle). Câblé ici : le bouton n'existe qu'après le rendu des
     * chapitres, wireBlocEtudiants est passé avant. */
    (avecFinTexte
      ? '<div class="form-actions"><button class="filter-btn active" id="btn-debut-texte" type="button">⬆️ Revenir au début du texte</button></div>'
      : '');
  const haut = document.getElementById('btn-debut-texte');
  if (haut) haut.onclick = () => { revenirDebutTexte(); };
}

/* « ⬇️ Aller à la fin du texte » : attend que les chapitres soient chargés
 * si c'est encore en cours, puis défile jusqu'à #fin-texte et le surligne
 * brièvement. Ne concerne que la Version des Lycéens. */
async function allerFinTexte() {
  const etu = state.etudiants;
  if (etu && etu.promesseIndex) await etu.promesseIndex;
  const section = sectionDe(SECTION_SOUS_ONGLET.etudiants);
  if (section) await chargerSection(section);
  const fin = document.getElementById('fin-texte') || document.getElementById('bloc-etudiants');
  if (!fin) return;
  /* v112 : chapitres repliés par défaut — ouvrir la carte qui porte l'ancre
   * avant de défiler, sinon le paragraphe visé est invisible. */
  const carte = typeof fin.closest === 'function' ? fin.closest('details') : null;
  if (carte) carte.open = true;
  if (typeof fin.scrollIntoView === 'function') fin.scrollIntoView({ behavior: 'smooth', block: 'end' });
  fin.style.transition = 'background-color 0.3s';
  fin.style.backgroundColor = 'rgba(255, 213, 79, 0.45)';
  setTimeout(() => { fin.style.backgroundColor = ''; }, 1600);
}

/* « ⬆️ Revenir au début du texte » (v116) : jumeau du bouton de fin — le début
 * du texte est l'en-tête de section (la description, l'intro, le compteur et
 * la note y vivent depuis la v111) : l'ouvrir avant de défiler, comme
 * allerFinTexte ouvre la carte qui porte l'ancre fin-texte, puis surligner
 * brièvement la carte d'arrivée. */
function revenirDebutTexte() {
  const debut = document.getElementById('entete-section') || document.getElementById('bloc-etudiants');
  if (!debut) return;
  const carte = typeof debut.closest === 'function' ? debut.closest('details') : null;
  if (carte) carte.open = true;
  if (typeof debut.scrollIntoView === 'function') debut.scrollIntoView({ behavior: 'smooth', block: 'start' });
  debut.style.transition = 'background-color 0.3s';
  debut.style.backgroundColor = 'rgba(255, 213, 79, 0.45)';
  setTimeout(() => { debut.style.backgroundColor = ''; }, 1600);
}

/* « 🧵 Reprendre le fil » (v117, demande de Maxime) : sauter au fil narratif
 * EN COURS — le chapitre du jour (index.chapitreJour) — sans s'enfoncer dans
 * les transverses qui ferment le fil : c'est LE geste du lecteur qui revient
 * voir où en est l'histoire. Même cérémonie que les autres sauts : ouvrir la
 * carte (elle l'est déjà par défaut v113, mais on ne sait jamais après un
 * repli manuel), défiler, surligner. Repli : sans chapitre du jour dans
 * l'index, reprendre au PREMIER chapitre de la section (le début du fil
 * chronologique — jamais une transverse : elles vivent en fin de liste). */
function reprendreFil() {
  const etu = state.etudiants;
  const promesse = (async () => {
    if (etu && etu.promesseIndex) await etu.promesseIndex;
    const section = sectionDe(SECTION_SOUS_ONGLET.etudiants);
    if (section) await chargerSection(section);
    const jour = etu && etu.index && etu.index.chapitreJour && etu.index.chapitreJour.id;
    const liste = section && Array.isArray(section.chapitres) ? section.chapitres : [];
    const idCible = jour || (liste[0] && liste[0].id);
    const cible = (idCible && document.getElementById('chapitre-' + idCible)) || document.getElementById('bloc-etudiants');
    if (!cible) return;
    const carte = typeof cible.closest === 'function' ? cible.closest('details') : null;
    if (carte) carte.open = true;
    if (typeof cible.scrollIntoView === 'function') cible.scrollIntoView({ behavior: 'smooth', block: 'start' });
    cible.style.transition = 'background-color 0.3s';
    cible.style.backgroundColor = 'rgba(255, 213, 79, 0.45)';
    setTimeout(() => { cible.style.backgroundColor = ''; }, 1600);
  })();
  return promesse;
}

/* Bloc du sous-onglet « Version des Lycéens » : entête de section — la carte
 * repliable porte la description, l'intro (🔎), le compteur et la note (💡)
 * (v111 : ils déménagent dedans) — puis les boutons de navigation du fil (v117 :
 * 🧵 reprendre le fil + ⬇️ fin du texte) et le
 * conteneur des chapitres. Le rendu ne lit QUE la section « chronique »,
 * jamais « complement », même si elle existe encore dans l'index. */
function blocEtudiants(section, avecFinTexte) {
  const idx = state.etudiants && state.etudiants.index ? state.etudiants.index : {};
  const supplement = avecFinTexte
    ? (idx.intro ? '<p class="hint">🔎 ' + esc(idx.intro) + '</p>' : '') +
      compteurEtudiants(idx) +
      (idx.note ? '<p class="hint">💡 ' + esc(idx.note) + '</p>' : '')
    : '';
  return enteteSection(section, supplement) +
    (avecFinTexte
      ? '<div class="form-actions"><button class="filter-btn active" id="btn-reprendre-fil" type="button">🧵 Reprendre le fil</button><button class="filter-btn active" id="btn-fin-texte" type="button">⬇️ Aller à la fin du texte</button></div>'
      : '') +
    '<div id="bloc-etudiants"><div class="empty">Chargement de la chronologie étudiante…</div></div>';
}

function wireBlocEtudiants() {
  const b = document.getElementById('btn-fin-texte');
  if (b) b.onclick = () => { allerFinTexte().catch(() => {}); };
  const rf = document.getElementById('btn-reprendre-fil');
  if (rf) rf.onclick = () => { reprendreFil().catch(() => {}); };
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
    boutonReplier() +
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
  const sous = SOUS_ONGLETS_LYCEENS().some(x => x.id === state.lyceensSub) ? state.lyceensSub : 'etudiants';
  if (sous === 'etudiants' && !state.etudiants) etatEtudiants();
  const d = state.lyceens;
  if (!d) {
    view.innerHTML = '<div class="empty">Chargement du suivi du mouvement lycéen…</div>';
    chargerLyceens().then(() => { if (state.activeTab === 'lyceens') vueLyceens(); }).catch(() => {});
    return;
  }
  const gouv = trier(Array.isArray(d.version_gouvernement) ? d.version_gouvernement : []);
  const faits = trier(Array.isArray(d.faits) ? d.faits : []);
  let corps = '';
  if (sous === 'etudiants') {
    const section = sectionDe(SECTION_SOUS_ONGLET[sous]);
    corps = section
      ? blocEtudiants(section, true)
      : '<div id="bloc-etudiants"><div class="empty">' +
        (state.etudiants && state.etudiants.erreur
          ? 'Chronologie étudiante momentanément indisponible — data/etudiants/index.json ne répond pas.'
          : 'Chargement de la chronologie étudiante…') + '</div></div>';
  } else if (sous === 'gouvernement') {
    corps = '<p class="meta-count">' + compteListe(gouv) + '</p>' + (gouv.length ? gouv.map(carteInfo).join('') : '<div class="empty">Aucune info côté gouvernement pour l\u2019instant.</div>');
  } else if (sous === 'chronologie') {
    /* v106 : la chronologie vit ici — rapidement sur les premières semaines,
     * puis jour après jour à partir du 27 septembre ; la partie date de
     * chaque jalon passe en <strong> pour une lecture en diagonale. */
    const jalons = Array.isArray(d.contexte) ? d.contexte.filter(Boolean) : [];
    corps = '<p class="meta-count">Du point de départ à Créteil (17 septembre) à hier : les jalons du mouvement, rapidement sur les premières semaines puis jour après jour à partir du 27 septembre.</p>' +
      (jalons.length
        ? '<div class="chapter-resume"><h2>📍 Chronologie résumée</h2><ul>' +
          jalons.map(c => {
            const s = esc(c);
            const i = s.indexOf(' : ');
            return '<li>' + (i > 0 ? '<strong>' + s.slice(0, i) + '</strong>' + s.slice(i) : s) + '</li>';
          }).join('') + '</ul></div>'
        : '<div class="empty">Chronologie pas encore publiée.</div>');
  } else {
    corps = '<p class="meta-count">' + compteListe(faits) + '</p>' + (faits.length ? faits.map(carteInfo).join('') : '<div class="empty">Aucune information corroborée à ce stade.</div>');
  }
  /* v109 : encart replié par défaut ; la date de maj vit dans le <summary>,
   * visible même replié — la fraîcheur se lit d'un coup d'œil. */
  view.innerHTML =
    '<details class="carte-regl encart-lyceens">' +
    '<summary>✊ ' + esc(d.titre || 'Mouvement lycéen') +
    (d.maj ? ' <span class="meta-count">— mis à jour le ' + esc(d.maj) + '</span>' : '') +
    '</summary>' +
    (d.intro ? '<p class="meta-count">' + esc(d.intro) + '</p>' : '') +
    (d.note ? '<p class="hint">🔎 ' + esc(d.note) + '</p>' : '') +
    (d.prochaine_echeance ? '<p class="meta-count">📅 ' + esc(d.prochaine_echeance) + '</p>' : '') +
    (d.maj ? '<p class="hint">Rafraîchi automatiquement toutes les 6 h par la maintenance — la prose, elle, vit aux éditions.</p>' : '') +
    boutonReplier() +
    '</details>' +
    sousOnglets(sous) +
    (d.erreur
      ? '<div class="empty">Suivi momentanément indisponible — il revient dès que data/lyceens.json répondra.</div>'
      : '') +
    corps;
  if (sous === 'etudiants') {
    const conteneur = document.getElementById('bloc-etudiants');
    if (conteneur) initSection(conteneur, SECTION_SOUS_ONGLET[sous], true).catch(() => {});
  }
  wireBlocEtudiants();
  wireSousOnglets();
}
