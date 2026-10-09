#!/usr/bin/env node
/* tools/test/debut-texte.js — harnas de la navigation du fil de la Version
 * des Lycéens (CACHE v116-v117) : boutons « ⬆️ Revenir au début du texte »,
 * « 🧵 Reprendre le fil » (v117) et ⬇️ « Aller à la fin du texte ».
 * Vérifie, hors ligne (fetch factice, aucun réseau) :
 *   1. RENDU RÉEL de la Version des Lycéens (vueLyceens + initSection sur
 *      data/etudiants factices : c1, c2 = chapitre du jour, c10 = transverse
 *      en fin de fil) : chaque bouton vit à sa place et est câblé ;
 *   2. clic ⬆️ : remonte à la carte d'en-tête #entete-section, l'OUVRE et la
 *      surligne brièvement ;
 *   3. clic 🧵 : saute au CHAPITRE DU JOUR (chapitre-c2) — la transverse c10
 *      qui ferme le fil est IGNORÉE (pas de défilement) ; sans chapitre du
 *      jour dans l'index, repli sur le PREMIER chapitre (c1) ;
 *   4. régressions : le ⬇️ de fin de texte est câblé, les boutons « ▲ Replier
 *      le chapitre » (v115) sont dans chaque carte, le chapitre du jour (v113)
 *      est ouvert (et lui seul), l'ancre fin-texte est sur le dernier
 *      chapitre (la transverse c10) ;
 *   5. démarrage à froid : le module s'importe avec un DOM factice
 *      (querySelectorAll -> [] pour ne pas polluer le wiring).
 * Usage : node tools/test/debut-texte.js (depuis la racine du dépôt). */
'use strict';
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

let passes = 0, echecs = 0;
const check = (nom, cond) => { if (cond) { passes++; } else { echecs++; console.error('ECHEC : ' + nom); } };
const RACINE = path.join(__dirname, '..', '..');

/* --- DOM factice --- */
const ecouteursDocument = [];
const parId = {};
const stubElt = id => {
  const e = {
    id: id || '', innerHTML: '', textContent: '', hidden: false, open: false,
    dataset: {}, onclick: null, onchange: null, oninput: null,
    querySelector: () => null, querySelectorAll: () => [],
    addEventListener: () => {}, setAttribute: () => {}, removeAttribute: () => {},
    classList: { toggle: () => {}, add: () => {}, remove: () => {} },
    style: { setProperty: () => {} },
    scrollIntoView: o => { e.scrollArgs = o; }
  };
  e.closest = s => (s === 'details' ? e : null); /* la carte est un details */
  if (id) parId[id] = e;
  return e;
};
const VUE = stubElt('#view'); /* l'élément #view : sa capture vit au fil des rendus */
globalThis.document = {
  addEventListener: (type, f) => ecouteursDocument.push({ type, f }),
  querySelector: () => VUE,
  querySelectorAll: () => [], /* piège connu : jamais tous les éléments */
  getElementById: id => parId[id] || stubElt(id),
  createElement: () => stubElt(''),
  documentElement: { dataset: {}, style: { setProperty: () => {} } }
};
globalThis.window = globalThis;
globalThis.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {}, key: () => null };
globalThis.location = { href: 'https://diyeah24.fr/#lyceens', origin: 'https://diyeah24.fr', pathname: '/', reload: () => {} };
globalThis.history = { pushState: () => {}, replaceState: () => {} };
globalThis.matchMedia = () => ({ matches: false });
globalThis.addEventListener = () => {};

/* --- Données factices : index + 2 chapitres --- */
const INDEX = {
  titre: 'La version des lycéens', intro: 'Intro du fil.', note: 'Note du fil.', totalParagraphes: 4,
  chapitreJour: { id: 'c2' },
  sections: [{ id: 'chronique', titre: 'Version des Lycéens — la chronique', description: 'La description méthodologique.',
    chapitres: [
      { id: 'c1', fichier: 'chapitres/c1.json', titre: 'Chapitre un', periode: '17-18/09' },
      { id: 'c2', fichier: 'chapitres/c2.json', titre: 'Chapitre deux', periode: '19-20/09' },
      { id: 'c10', fichier: 'chapitres/c10.json', titre: 'Discord et les blocus virtuels', periode: 'transverse' }
    ] }]
};
const CHAPITRES = {
  'chapitres/c1.json': { id: 'c1', titre: 'Chapitre un', periode: '17-18/09', paragraphes: [{ texte: 'Premier paragraphe.' }] },
  'chapitres/c2.json': { id: 'c2', titre: 'Chapitre deux', periode: '19-20/09', paragraphes: [{ texte: 'Deuxième paragraphe.' }] },
  'chapitres/c10.json': { id: 'c10', titre: 'Discord et les blocus virtuels', periode: 'transverse', paragraphes: [{ texte: 'La transverse qui ferme le fil.' }] }
};
globalThis.fetch = url => {
  const u = String(url);
  const corps = u.includes('etudiants/index.json') ? INDEX : (CHAPITRES[u.replace(/^.*etudiants\//, '')] || {});
  return Promise.resolve({ json: async () => corps });
};

/* --- Bac à sable "type":"module" --- */
const bac = fs.mkdtempSync(path.join(require('os').tmpdir(), 'debut-'));
fs.writeFileSync(path.join(bac, 'package.json'), '{"type":"module"}');
for (const f of ['core.js', 'router.js', 'onglets.js']) {
  fs.copyFileSync(path.join(RACINE, 'js', f), path.join(bac, f));
}
fs.mkdirSync(path.join(bac, 'views'));
fs.copyFileSync(path.join(RACINE, 'js', 'views', 'common.js'), path.join(bac, 'views', 'common.js'));
fs.copyFileSync(path.join(RACINE, 'js', 'views', 'lyceens.js'), path.join(bac, 'views', 'lyceens.js'));

async function main() {
  /* --- Syntaxe ES modules : node --check via copie .mjs (leçon v65) --- */
  for (const f of ['common', 'lyceens']) {
    const dst = path.join(bac, f + '.mjs');
    fs.copyFileSync(path.join(bac, 'views', f + '.js'), dst);
    execFileSync('node', ['--check', dst], { stdio: 'pipe' });
  }
  check('syntaxe ES modules (node --check .mjs) : common.js et lyceens.js', true);

  /* --- Import réel (démarrage à froid sur DOM factice) --- */
  const lyceens = await import(pathToFileURL(path.join(bac, 'views', 'lyceens.js')).href);
  const core = await import(pathToFileURL(path.join(bac, 'core.js')).href);
  check('import des modules sans crash (DEMARRAGE_OK)', typeof lyceens.vueLyceens === 'function');

  /* --- Rendu réel : Version des Lycéens ---
   * NB : l'index arrive APRÈS le premier rendu → etatEtudiants relance
   * vueLyceens si state.activeTab === 'lyceens' (deuxième rendu). */
  core.state.activeTab = 'lyceens';
  core.state.lyceensSub = 'etudiants';
  core.state.lyceens = { titre: 'Mouvement lycéen', maj: '2026-10-09 06:00', intro: 'Quatre lectures ici.', faits: [], version_gouvernement: [] };
  lyceens.vueLyceens();
  await new Promise(r => setTimeout(r, 80)); /* index + chapitres factices */

  const html = VUE.innerHTML;
  const bloc = parId['bloc-etudiants'];
  const fil = bloc.innerHTML;

  check('entete de section avec id entete-section (v116)', html.includes('id="entete-section"'));
  check('bouton fin de texte toujours en tete (regression)', html.includes('id="btn-fin-texte"'));
  check('bouton reprendre le fil a cote du bouton de fin (v117)',
    html.includes('id="btn-reprendre-fil"') && html.includes('🧵 Reprendre le fil') &&
    html.indexOf('btn-reprendre-fil') < html.indexOf('btn-fin-texte') &&
    html.indexOf('btn-fin-texte') - html.indexOf('btn-reprendre-fil') < 200);
  check('les 3 chapitres sont rendus (dont la transverse c10)',
    fil.includes('chapitre-c1') && fil.includes('chapitre-c2') && fil.includes('chapitre-c10'));
  check('chapitre du jour ouvert, lui seul (regression v113)',
    /chapitre-etudiant" open id="chapitre-c2"/.test(fil) && !/chapitre-etudiant" open id="chapitre-c1"/.test(fil) && !/chapitre-etudiant" open id="chapitre-c10"/.test(fil));
  check('ancre fin-texte sur le dernier paragraphe, la transverse (regression)', fil.includes('id="fin-texte"'));
  check('boutons Replier le chapitre dans chaque carte (regression v115)',
    (fil.match(/class="btn-replier"/g) || []).length === 3);

  /* --- v116 : le bouton au bout du fil, APRES le dernier chapitre --- */
  check('bouton debut-texte present au bout du fil', fil.includes('id="btn-debut-texte"') && fil.includes('⬆️ Revenir au début du texte'));
  check('bouton place APRES le dernier chapitre',
    fil.indexOf('btn-debut-texte') > fil.lastIndexOf('</details>'));
  const haut = parId['btn-debut-texte'];
  check('bouton cable apres le rendu des chapitres', typeof haut.onclick === 'function');

  /* --- Clic : ouvre + remonte + surligne la carte d'en-tête --- */
  const entete = globalThis.document.getElementById('entete-section'); /* crée/rend le stub si besoin */
  haut.onclick();
  check('clic : la carte entete s ouvre', entete.open === true);
  check('clic : scrollIntoView smooth block start', JSON.stringify(entete.scrollArgs) === JSON.stringify({ behavior: 'smooth', block: 'start' }));
  check('clic : surlignage jaune pose', entete.style.backgroundColor === 'rgba(255, 213, 79, 0.45)');
  await new Promise(r => setTimeout(r, 1700));
  check('clic : surlignage retire apres 1600 ms', entete.style.backgroundColor === '');

  /* --- v117 : clic 🧵 — sauter au fil en cours, transverses ignorées --- */
  const rf = parId['btn-reprendre-fil'] || globalThis.document.getElementById('btn-reprendre-fil');
  check('bouton reprendre le fil cable', typeof rf.onclick === 'function');
  const cJour = globalThis.document.getElementById('chapitre-c2');
  const cTrans = globalThis.document.getElementById('chapitre-c10');
  rf.onclick();
  await new Promise(r => setTimeout(r, 30)); /* reprendreFil est async : index + chapitres attendus */
  check('clic reprendre : cible = le chapitre du jour (c2)', cJour.scrollArgs !== undefined);
  check('clic reprendre : scrollIntoView smooth block start',
    JSON.stringify(cJour.scrollArgs) === JSON.stringify({ behavior: 'smooth', block: 'start' }));
  check('clic reprendre : surlignage jaune pose', cJour.style.backgroundColor === 'rgba(255, 213, 79, 0.45)');
  check('clic reprendre : la transverse c10 est IGNOREE (aucun defilement)', cTrans.scrollArgs === undefined);
  await new Promise(r => setTimeout(r, 1700));
  check('clic reprendre : surlignage retire', cJour.style.backgroundColor === '');

  /* --- v117 : repli sans chapitre du jour → PREMIER chapitre (c1) --- */
  core.state.etudiants.index.chapitreJour = undefined;
  rf.onclick();
  await new Promise(r => setTimeout(r, 30)); /* async, idem */
  const cPremier = globalThis.document.getElementById('chapitre-c1');
  check('sans chapitre du jour : repli sur le PREMIER chapitre (c1)', cPremier.scrollArgs !== undefined);
  check('sans chapitre du jour : la transverse reste ignoree', cTrans.scrollArgs === undefined);
  core.state.etudiants.index.chapitreJour = { id: 'c2' };

  /* --- Régression : le bouton de fin de texte reste câblé --- */
  check('bouton fin-texte toujours cable (regression)', typeof parId['btn-fin-texte'].onclick === 'function');

  /* --- Invariant déploiement --- */
  const sw = fs.readFileSync(path.join(RACINE, 'sw.js'), 'utf8');
  const mV = /CACHE = 'newsletter-v(\d+)'/.exec(sw);
  check('sw.js : CACHE >= v116 (bump a chaque livraison de code)', !!mV && +mV[1] >= 116);

  console.log('debut-texte : ' + passes + ' test(s) vert(s)' + (echecs ? ', ' + echecs + ' ECHEC(S)' : ''));
  process.exit(echecs ? 1 : 0);
}

main().catch(e => { console.error('ECHEC FATAL :', e); process.exit(1); });
