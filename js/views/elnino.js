/* views/elnino.js — onglet 🌊 El Niño 2026 (v121).
 * Vue native El Niño 2026 avec 4 sous-onglets :
 *   🌡️ Indices officiels — cartes des indices RONI, Niño 3.4, ONI, SST Niño 3.4
 *   🇫🇷 Territoires français — impacts par territoire
 *   🌍 Impacts mondiaux — santé, sécurité alimentaire, etc.
 *   🔬 Science et surveillance — changement d'indice, liens climatiques
 * Données : data/elnino-indices.json (indices officiels) et
 *         data/elnino/index.json + data/elnino/sections/<id>.json (contenu).
 * Règle d'hygiène : tout texte de donnée passe par esc().
 */
import { $, state, esc } from '../core.js';
import { renderView, boutonReplier } from './common.js';

const SOUS_ONGLETS_ELNINO = () => [
  { id: 'indices', nom: '🌡️ Indices officiels' },
  { id: 'territoires', nom: '🇫🇷 Territoires français' },
  { id: 'impacts', nom: '🌍 Impacts mondiaux' },
  { id: 'science', nom: '🔬 Science et surveillance' }
];

/* Chargement paresseux, en cache dans state après le premier passage. */
async function chargerElninoIndices() {
  if (!state.elninoIndices) {
    try { state.elninoIndices = await (await fetch('data/elnino-indices.json', { cache: 'no-store' })).json(); }
    catch (e) { state.elninoIndices = { erreur: true }; }
  }
  return state.elninoIndices;
}

function sousOnglets(sub) {
  return '<div class="subtabs">' + SOUS_ONGLETS_ELNINO().map(x =>
    '<button class="subtab' + (x.id === sub ? ' active' : '') + '" data-s="' + x.id + '">' + esc(x.nom) + '</button>').join('') + '</div>';
}

/* data/elnino/index.json est chargé UNE seule fois ; les fichiers de
 * sections sont chargés au fil du besoin et gardés dans elnino.parId.
 * Structure : { index, parId: {id: section}, promesseIndex, erreur }.
 */
function etatElnino() {
  if (!state.elnino) {
    state.elnino = { index: null, parId: {}, promesseIndex: null, erreur: false };
    state.elnino.promesseIndex = (async () => {
      try {
        state.elnino.index = await (await fetch('data/elnino/index.json', { cache: 'no-store' })).json();
      } catch (e) { state.elnino.erreur = true; }
      /* L'index arrive après le premier rendu : rafraîchir l'onglet une seule fois. */
      if (state.activeTab === 'elnino') vueElnino();
    })();
  }
  return state.elnino;
}

/* Retourne la section demandée de l'index. */
function sectionDe(id) {
  const sections = Array.isArray(state.elnino?.index?.sections) ? state.elnino.index.sections : [];
  return sections.find(s => s && s.id === id) || null;
}

/* Charge les fichiers d'une section, une seule fois chacun ;
 * un fichier manquant devient un bloc vide, sans casser la suite. */
async function chargerSection(section) {
  const eln = etatElnino();
  await eln.promesseIndex;
  if (!section || !section.fichier) return [];
  if (eln.parId[section.id]) return [eln.parId[section.id]];
  try {
    eln.parId[section.id] = await (await fetch('data/elnino/' + section.fichier, { cache: 'no-store' })).json();
  } catch (err) {
    eln.parId[section.id] = null;
  }
  return eln.parId[section.id] ? [eln.parId[section.id]] : [];
}

/* Mini-courbe textuelle de la série roni.serie (12 saisons).
 * Barres en caractères : ▁▂▃▄▅▆▇█ (8 niveaux)
 * Zéro marqué, valeurs négatives sous le zéro. */
function miniCourbeRoni(serie) {
  if (!Array.isArray(serie) || serie.length === 0) return '';
  const NIVEAUX = '▁▂▃▄▅▆▇█';
  const vals = serie.map(s => s.valeur || 0);
  const max = Math.max(...vals.map(Math.abs));
  const scale = max > 0 ? 7 / max : 1;
  const zeroIdx = Math.max(0, Math.min(7, Math.round(0 * scale)));
  const zeroChar = NIVEAUX.charAt(zeroIdx);
  const barres = vals.map(v => {
    const abs = Math.abs(v);
    const h = Math.max(0, Math.min(7, Math.round(abs * scale)));
    return NIVEAUX.charAt(h);
  });
  const labels = serie.map((s, i) => i === barres.length - 1 && s.periode ? ' ' + esc(s.periode.slice(0, 6)) : '');
  const ligne = barres.map((b, i) => (vals[i] >= 0 ? ' ' : '\n') + b + labels[i]).join('');
  return '<pre class="mini-courbe">' + ligne + '\n ' + zeroChar + ' 0</pre>';
}

/* Carte d'un indice officiel. */
function carteIndice(id, data, libelle) {
  if (!data) return '';
  const valeur = data.valeur !== undefined ? data.valeur : null;
  const unite = data.unite ? ' ' + esc(data.unite) : '';
  const periode = data.periode ? esc(data.periode) : '';
  const source = data.source ? '<p class="src-ref">' + esc(data.source) + '</p>' : '';
  const maj = state.elninoIndices?.maj ? esc(state.elninoIndices.maj) : '';
  const titre = libelle + (periode ? ' (' + periode + ')' : '');
  let corps = '';
  if (valeur !== null) {
    corps = '<p class="valeur-indice">' + esc(valeur.toFixed(2)) + unite + '</p>';
  }
  if (data.serie && Array.isArray(data.serie) && data.serie.length > 0 && id === 'roni') {
    corps += '<div class="courbe-container">' + miniCourbeRoni(data.serie) + '</div>';
  }
  if (data.seuilElNino !== undefined && data.seuilTresFort !== undefined) {
    corps += '<p class="seuils">Seuil El Niño: ' + esc(String(data.seuilElNino)) + unite + ' | Très fort: ' + esc(String(data.seuilTresFort)) + unite + '</p>';
  }
  if (id === 'sstNino34' && data.moyenne !== undefined && data.climatologie !== undefined && data.anomalie !== undefined) {
    corps += '<p class="sst-detail">Moyenne: ' + esc(String(data.moyenne)) + ' °C, Climatologie: ' + esc(String(data.climatologie)) + ' °C, Anomalie: ' + esc(String(data.anomalie)) + ' °C</p>';
  }
  return '<details class="carte-regl carte-indice" open>' +
    '<summary>' + esc(libelle) + (maj ? ' <span class="meta-count">mis à jour le ' + maj + '</span>' : '') + '</summary>' +
    corps +
    source +
    boutonReplier() +
    '</details>';
}

/* Bloc des indices officiels. */
function blocIndices() {
  const d = state.elninoIndices;
  if (!d || d.erreur) {
    return '<div class="empty">Indices officiels momentanément indisponibles — data/elnino-indices.json ne répond pas.</div>';
  }
  const cartes = [];
  if (d.roni) cartes.push(carteIndice('roni', d.roni, '🌡️ RONI'));
  if (d.nino34Relatif) cartes.push(carteIndice('nino34Relatif', d.nino34Relatif, '🌡️ Niño 3.4 relatif mensuel'));
  if (d.oni) cartes.push(carteIndice('oni', d.oni, '🌡️ ONI (indice historique)'));
  if (d.sstNino34) cartes.push(carteIndice('sstNino34', d.sstNino34, '🌡️ Température brute Niño 3.4'));

  /* Probabilités de force */
  if (d.probabilitesForce) {
    const pf = d.probabilitesForce;
    const saisonsHtml = Array.isArray(pf.saisons) ? pf.saisons.map(s =>
      '<li>' + esc(s.saison) + ': ' + esc(String(s.prob)) + '%</li>').join('') : '';
    cartes.push('<details class="carte-regl carte-indice">' +
      '<summary>🌡️ Probabilités de force <span class="meta-count">' + (pf.emis ? esc(pf.emis) : '') + '</span></summary>' +
      (pf.seuil ? '<p>' + esc(pf.seuil) + '</p>' : '') +
      (saisonsHtml ? '<ul>' + saisonsHtml + '</ul>' : '') +
      (pf.source ? '<p class="src-ref">' + esc(pf.source) + '</p>' : '') +
      boutonReplier() +
      '</details>');
  }

  /* Prévision RONI */
  if (d.outlookRoni) {
    const or = d.outlookRoni;
    const medianesHtml = Array.isArray(or.medianes) ? or.medianes.map(m =>
      '<li>' + esc(m.saison) + ': ' + esc(String(m.valeur)) + '</li>').join('') : '';
    cartes.push('<details class="carte-regl carte-indice">' +
      '<summary>🌡️ Prévision RONI <span class="meta-count">' + (or.emis ? esc(or.emis) : '') + '</span></summary>' +
      (medianesHtml ? '<ul>' + medianesHtml + '</ul>' : '') +
      (or.source ? '<p class="src-ref">' + esc(or.source) + '</p>' : '') +
      boutonReplier() +
      '</details>');
  }

  /* Classement historique */
  if (d.classementHistorique) {
    const ch = d.classementHistorique;
    const precedentsHtml = Array.isArray(ch.top8Precedents) ? ch.top8Precedents.map(e =>
      '<li>' + esc(e.episode) + ': pic ' + esc(String(e.pic)) + (e.saison ? ' (' + esc(e.saison) + ')' : '') + '</li>').join('') : '';
    const enCours = ch.episodeEnCours ?
      '<p>Épisode en cours: ' + esc(ch.episodeEnCours.episode) + ' — pic: ' + esc(String(ch.episodeEnCours.pic)) + ' (' + esc(ch.episodeEnCours.saison) + ')</p>'
      : '';
    cartes.push('<details class="carte-regl carte-indice">' +
      '<summary>🌡️ Classement historique</summary>' +
      enCours +
      (precedentsHtml ? '<ul>' + precedentsHtml + '</ul>' : '') +
      boutonReplier() +
      '</details>');
  }

  return '<div class="bloc-elnino-indices">' + cartes.join('') + '</div>';
}

/* Une entrée de groupe : donnée + source · annee en petit. */
function entreeHtml(e) {
  if (!e) return '';
  return '<p>' + esc(e.donnee || '') + '</p>' +
    (e.source || e.annee
      ? '<p class="meta-count">' + esc((e.source || '') + (e.source && e.annee ? ' · ' : '') + (e.annee ? String(e.annee) : '')) + '</p>'
      : '');
}

/* Un groupe : <details> avec titre en <summary>, entrées dedans. */
function groupeHtml(g) {
  if (!g || !g.titre) return '';
  const entrees = Array.isArray(g.entrees) ? g.entrees : [];
  if (entrees.length === 0) return '';
  return '<details class="carte-regl">' +
    '<summary>' + esc(g.titre) + '</summary>' +
    entrees.map(entreeHtml).join('') +
    boutonReplier() +
    '</details>';
}

/* Une section : titre + description, puis groupes. */
function sectionHtml(section) {
  if (!section) return '';
  const groupes = Array.isArray(section.groupes) ? section.groupes : [];
  return '<div class="elnino-section">' +
    (section.titre ? '<h3>' + esc(section.titre) + '</h3>' : '') +
    (section.description ? '<p class="meta-count">' + esc(section.description) + '</p>' : '') +
    groupes.map(groupeHtml).join('') +
    '</div>';
}

function wireSousOnglets() {
  [...document.querySelectorAll('.subtab[data-s]')].forEach(b =>
    b.onclick = () => { state.elninoSous = b.dataset.s; renderView(); window.scrollTo(0, 0); });
}

function wireBlocIndices() {
  /* Nothing special needed for indices block */
}

export function vueElnino() {
  const view = $('#view');
  const sub = SOUS_ONGLETS_ELNINO().some(x => x.id === state.elninoSous) ? state.elninoSous : 'indices';
  if (sub === 'indices' && !state.elninoIndices) chargerElninoIndices();
  if (sub !== 'indices' && !state.elnino) etatElnino();

  const d = state.elninoIndices;
  const eln = state.elnino;

  if (sub === 'indices') {
    if (!d) {
      view.innerHTML = '<div class="empty">Chargement des indices officiels…</div>';
      chargerElninoIndices().then(() => { if (state.activeTab === 'elnino') vueElnino(); }).catch(() => {});
      return;
    }
    view.innerHTML = sousOnglets(sub) + blocIndices();
    wireSousOnglets();
    wireBlocIndices();
    return;
  }

  /* Autres sous-onglets : charger la section correspondante */
  if (!eln || !eln.index) {
    view.innerHTML = '<div class="empty">Chargement de la section…</div>' +
      sousOnglets(sub);
    etatElnino().promesseIndex.then(() => { if (state.activeTab === 'elnino') vueElnino(); }).catch(() => {});
    return;
  }

  const section = sectionDe(sub);
  if (!section) {
    view.innerHTML = sousOnglets(sub) +
      '<div class="empty">Section — ' + esc(sub) + ' — pas encore publiée.</div>';
    wireSousOnglets();
    return;
  }

  /* Rendu final */
  let corps = '';
  if (eln.parId[section.id]) {
    corps = sectionHtml(eln.parId[section.id]);
  } else if (eln.parId[section.id] === null) {
    corps = '<div class="empty">Fichier de section introuvable — ' + esc(section.fichier || '') + '</div>';
  } else {
    /* Charger la section si pas encore en cache */
    corps = '<div id="elnino-section-' + esc(sub) + '"><div class="empty">Chargement de la section…</div></div>';
    chargerSection(section).then(sections => {
      if (sections.length && state.activeTab === 'elnino' && state.elninoSous === sub) {
        vueElnino();
      }
    }).catch(() => {});
  }

  view.innerHTML = sousOnglets(sub) + corps;
  wireSousOnglets();
}
