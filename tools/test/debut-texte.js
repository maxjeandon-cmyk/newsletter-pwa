#!/usr/bin/env node
/* tools/test/debut-texte.js — harnas du bouton « ⬆️ Revenir au début du
 * texte » (CACHE v116), jumeau du ⬇️ « Aller à la fin du texte ».
 * Vérifie, hors ligne (fetch factice, aucun réseau) :
 *   1. RENDU RÉEL de la Version des Lycéens (vueLyceens + initSection sur
 *      data/etudiants factices) : le bouton vit AU BOUT du fil, après le
 *      dernier chapitre, câblé après le rendu des chapitres ;
 *   2. clic : remonte à la carte d'en-tête #entete-section (le début du texte
 *      — description, intro, compteur, note), l'OUVRE (elle est repliée par
 *      défaut, v110) et la surligne brièvement, comme allerFinTexte ;
 *   3. régressions : le bouton ⬇️ de fin de texte est toujours câblé, les
 *      boutons « ▲ Replier le chapitre » (v115) sont dans chaque carte, le
 *      chapitre du jour (v113) est ouvert, l'ancre fin-texte est sur le
 *      dernier paragraphe du dernier chapitre ;
 *   4. démarrage à froid : le module s'importe avec un DOM factice
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
  chapitreJour: { id: 'c1' },
  sections: [{ id: 'chronique', titre: 'Version des Lycéens — la chronique', description: 'La description méthodologique.',
    chapitres: [
      { id: 'c1', fichier: 'chapitres/c1.json', titre: 'Chapitre un', periode: '17-18/09' },
      { id: 'c2', fichier: 'chapitres/c2.json', titre: 'Chapitre deux', periode: '19-20/09' }
    ] }]
};
const CHAPITRES = {
  'chapitres/c1.json': { id: 'c1', titre: 'Chapitre un', periode: '17-18/09', paragraphes: [{ texte: 'Premier paragraphe.' }] },
  'chapitres/c2.json': { id: 'c2', titre: 'Chapitre deux', periode: '19-20/09', paragraphes: [{ texte: 'Deuxième paragraphe.' }] }
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
  check('les 2 chapitres sont rendus', fil.includes('chapitre-c1') && fil.includes('chapitre-c2'));
  check('chapitre du jour ouvert (regression v113)', /chapitre-etudiant" open id="chapitre-c1"/.test(fil));
  check('ancre fin-texte sur le dernier paragraphe (regression)', fil.includes('id="fin-texte"'));
  check('boutons Replier le chapitre dans chaque carte (regression v115)',
    (fil.match(/class="btn-replier"/g) || []).length === 2);

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

  /* --- Régression : le bouton de fin de texte reste câblé --- */
  check('bouton fin-texte toujours cable (regression)', typeof parId['btn-fin-texte'].onclick === 'function');

  /* --- Invariant déploiement --- */
  const sw = fs.readFileSync(path.join(RACINE, 'sw.js'), 'utf8');
  check('sw.js : CACHE v116', /CACHE = 'newsletter-v116'/.test(sw));

  console.log('debut-texte : ' + passes + ' test(s) vert(s)' + (echecs ? ', ' + echecs + ' ECHEC(S)' : ''));
  process.exit(echecs ? 1 : 0);
}

main().catch(e => { console.error('ECHEC FATAL :', e); process.exit(1); });
