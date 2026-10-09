#!/usr/bin/env node
/* tools/test/edition-native.js — harnas du rendu NATIF de l'édition du jour
 * (CACHE v118) : fini l'iframe « Canvas dans Canvas » (demande de Maxime du
 * 09/10/2026) — les chapitres de la Newsletter sortent de l'encart News et
 * vivent en dessous, en cartes déroulantes natives. Vérifie, hors ligne
 * (aucune dépendance, aucun réseau — fetch stubbé sur la VRAIE édition du
 * dépôt) :
 *   1. syntaxe ES module de js/views/edition.js (node --check via copie
 *      .mjs, leçon v65) ;
 *   2. decouperEdition(html) sur l'édition réelle : encart News (h1 + intro +
 *      résumé exécutif, AUCUN <details>) / chapitres en dessous (15 details
 *      + 15 btn-partage + 15 btn-replier + table des sources) / AUCUN
 *      <script> (jamais injecté) ; édition ancienne sans chapitres
 *      déroulants (avant le 06/10/2026) : tout dans l'encart, rien dessous ;
 *   3. RENDU RÉEL de vueEdition (DOM factice + fetch réel stubbé) : plus
 *      d'iframe ; encart + chapitres dans le conteneur ; table des sources
 *      classée table-sources, première ligne en <thead>, bouton « ▼ Afficher
 *      toutes les sources » câblé (clic → déplie, bouton retiré) ;
 *   4. partage par chapitre : boutons btn-partage câblés — clic →
 *      navigator.share avec le lien profond https://diyeah24.fr/#edition?c=<id>
 *      et le texte « titre — résumé » ;
 *   5. lien profond #edition?c=<id> : le chapitre visé est ouvert (open=true)
 *      et reçoit scrollIntoView(smooth, start) ;
 *   6. régression v115 : les boutons .btn-replier des éditions relèvent de
 *      la délégation globale de common.js — referme le <details> parent ;
 *   7. sw.js = CACHE >= v118 ; styles.css porte .edition-native,
 *      .table-sources et .btn-sources.
 * Usage : node tools/test/edition-native.js (depuis la racine du dépôt). */
'use strict';
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

let passes = 0, echecs = 0;
const check = (nom, cond) => { if (cond) { passes++; } else { echecs++; console.error('ECHEC : ' + nom); } };
const RACINE = path.join(__dirname, '..', '..');

/* --- DOM factice : stubs minimaux AVANT l'import des modules --- */
const ecouteursDocument = [];
const stubBase = () => ({
  innerHTML: '', textContent: '', className: '', type: '', hidden: false,
  dataset: {}, listeners: {},
  addEventListener(t, f) { this.listeners[t] = f; },
  removeAttribute() {}, setAttribute() {}, appendChild() {},
  classList: { add() {}, remove() {}, toggle() {} },
  style: {}, isConnected: true,
  querySelector: () => null, querySelectorAll: () => [],
  closest: () => null, scrollIntoView() {}, after() {}, insertBefore() {},
  remove() { this.retire = true; }
});
globalThis.document = {
  addEventListener: (type, f) => ecouteursDocument.push({ type, f }),
  querySelector: () => null,
  querySelectorAll: () => [],
  getElementById: () => null,
  createElement: tag => Object.assign(stubBase(), { tag, childNodes: [], firstChild: {} })
};
globalThis.window = globalThis;
globalThis.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {}, key: () => null };
globalThis.location = { href: 'https://diyeah24.fr/#edition', origin: 'https://diyeah24.fr', pathname: '/', reload: () => {} };
globalThis.history = { pushState: () => {}, replaceState: () => {} };
globalThis.matchMedia = () => ({ matches: false });
globalThis.addEventListener = () => {};

/* --- Bac à sable "type":"module" : vrais modules + stub des couches réseau --- */
const bac = fs.mkdtempSync(path.join(require('os').tmpdir(), 'edn-'));
fs.writeFileSync(path.join(bac, 'package.json'), '{"type":"module"}');
for (const f of ['core.js', 'router.js', 'onglets.js']) {
  fs.copyFileSync(path.join(RACINE, 'js', f), path.join(bac, f));
}
/* Stub météo : la vue n'affiche pas l'intro météo sans ville choisie. */
fs.writeFileSync(path.join(bac, 'meteo.js'),
  'export const chercherVilles = async () => [];\nexport const choisirVille = () => {};\n' +
  'export const villeMeteo = () => null;\nexport const chargerMeteo = async () => null;\n');
fs.mkdirSync(path.join(bac, 'views'));
for (const f of ['common.js', 'edition.js']) {
  fs.copyFileSync(path.join(RACINE, 'js', 'views', f), path.join(bac, 'views', f));
}

/* L'édition réelle du dépôt sert de fixture (structure v15 validée par la CI). */
const FICHIER_EDITION = fs.existsSync(path.join(RACINE, 'editions', '2026-10-08.html'))
  ? 'editions/2026-10-08.html'
  : JSON.parse(fs.readFileSync(path.join(RACINE, 'editions', 'latest.json'), 'utf8')).editions[0].fichier;
const HTML_REEL = fs.readFileSync(path.join(RACINE, FICHIER_EDITION), 'utf8');

async function main() {
  /* --- 1. Syntaxe ES module (node --check via copie .mjs) --- */
  const dst = path.join(bac, 'edition.mjs');
  fs.copyFileSync(path.join(bac, 'views', 'edition.js'), dst);
  execFileSync('node', ['--check', dst], { stdio: 'pipe' });
  check('syntaxe ES module (node --check .mjs)', true);

  /* --- 2. Import réel des modules (démarrage à froid sur DOM factice) --- */
  const edition = await import(pathToFileURL(path.join(bac, 'views', 'edition.js')).href);
  await import(pathToFileURL(path.join(bac, 'views', 'common.js')).href); /* délégation v115 */
  check('import des modules sans crash (DEMARRAGE_OK)',
    typeof edition.vueEdition === 'function' && typeof edition.decouperEdition === 'function');

  /* --- 3. decouperEdition sur la VRAIE édition --- */
  const dec = edition.decouperEdition(HTML_REEL);
  const nb = s => (s.match(/<details[^>]*class="chapitre"/g) || []).length;
  check('encart News : h1 + intro + resume executif, AUCUN <details>',
    /<h1>/.test(dec.entete) && /Newsletter quotidienne/.test(dec.entete) &&
    /R&#233;sum&#233; executif|R&#233;sum&#233; ex&#233;cutif|Résumé exécutif/.test(dec.entete.replace(/&#(\d+);/g, (m, d) => String.fromCharCode(d))) &&
    !dec.entete.includes('<details'));
  check('chapitres en dessous : 15 blocs details.chapitre', nb(dec.reste) === 15 && nb(dec.entete) === 0);
  check('le reste commence au premier chapitre (hors-chapitres)',
    /^\s*<details[^>]*class="chapitre"[^>]*id="c-hors-chapitres"/.test(dec.reste));
  check('15 boutons btn-partage et 15 btn-replier dans le reste',
    (dec.reste.match(/class="btn-partage"/g) || []).length === 15 &&
    (dec.reste.match(/class="btn-replier"/g) || []).length === 15);
  check('table des sources dans le reste', dec.reste.includes('<table>') && /Notes de sources/.test(dec.reste));
  check('AUCUN <script> (jamais injecté)', !dec.entete.includes('<script') && !dec.reste.includes('<script'));
  /* Édition ancienne (avant le 06/10/2026) : pas de chapitres déroulants. */
  const vieux = '<!DOCTYPE html><html><body><h1>News &#8212; veille</h1><p>Intro.</p><hr><h2>Notes</h2><table><tr><th>S</th></tr></table><script>alert(1)</script></body></html>';
  const vieuxDec = edition.decouperEdition(vieux);
  check('edition ancienne : tout dans l encart, rien en dessous, script retire',
    vieuxDec.reste === '' && vieuxDec.entete.includes('<h1>') && vieuxDec.entete.includes('<table>') && !vieuxDec.entete.includes('<script'));

  /* --- 4. Rendu RÉEL de vueEdition (fetch stubbé sur l'édition réelle) --- */
  const view = stubBase();
  const conteneur = stubBase();
  const fauxTbl = stubBase();
  fauxTbl.classList = { add() { fauxTbl.classes = (fauxTbl.classes || []).concat([].slice.call(arguments)); }, remove() { fauxTbl.retires = (fauxTbl.retires || []).concat([].slice.call(arguments)); } };
  const fauxTr = stubBase();
  fauxTbl.querySelector = s => (s === 'tr' ? fauxTr : null);
  fauxTbl.insertBefore = () => { fauxTbl.insertBeforeAppel = true; };
  fauxTbl.after = x => { fauxTbl.afterAppels = (fauxTbl.afterAppels || []).concat([x]); };
  const fauxPartages = [
    Object.assign(stubBase(), { dataset: { id: 'economie-pour-les-nuls', titre: 'Economie pour les nuls', resume: 'Le resume du chapitre' } }),
    Object.assign(stubBase(), { dataset: { id: 'culture', titre: 'Culture', resume: 'Le resume culture' } }),
  ];
  conteneur.querySelector = s => (s === 'table' ? fauxTbl : null);
  conteneur.querySelectorAll = s => (s === '.btn-partage' ? fauxPartages : []);
  const fauxChapitre = stubBase();
  fauxChapitre.open = false;
  fauxChapitre.scrollIntoView = o => { fauxChapitre.saut = JSON.stringify(o); };
  globalThis.document.querySelector = sel => (sel === '#view' ? view : (sel === '#edition-native' ? conteneur : null));
  globalThis.document.getElementById = id => (id === 'c-economie-pour-les-nuls' ? fauxChapitre : null);
  const crees = [];
  globalThis.document.createElement = tag => { const e = stubBase(); e.tag = tag; e.appendChild = c => { e.children = (e.children || []).concat([c]); }; crees.push(e); return e; };
  globalThis.fetch = () => Promise.resolve({ text: () => Promise.resolve(HTML_REEL) });
  const core = await import(pathToFileURL(path.join(bac, 'core.js')).href);
  core.state.edition = { html: FICHIER_EDITION };
  core.state.editionChapitre = 'economie-pour-les-nuls';
  core.state.activeTab = 'edition';
  await edition.vueEdition();
  check('rendu : PLUS D IFRAME', !view.innerHTML.includes('<iframe'));
  check('rendu : conteneur edition-native present', view.innerHTML.includes('id="edition-native"'));
  check('rendu : encart News en tete, chapitres en dessous',
    conteneur.innerHTML.startsWith('<div class="summary-card edition-encart">') &&
    conteneur.innerHTML.includes('class="summary-card edition-encart">') &&
    /edition-encart">[\s\S]*?<\/div>\s*<details[^>]*class="chapitre"/.test(conteneur.innerHTML));
  check('rendu : 15 chapitres natifs, aucun script',
    (conteneur.innerHTML.match(/<details[^>]*class="chapitre"/g) || []).length === 15 &&
    !conteneur.innerHTML.includes('<script'));
  check('table des sources : classe table-sources posee', (fauxTbl.classes || []).includes('table-sources'));
  const tete = crees.find(e => e.tag === 'thead');
  const btnSources = crees.find(e => e.tag === 'button');
  check('table des sources : premiere ligne en <thead>',
    !!tete && (tete.children || []).includes(fauxTr) && fauxTbl.insertBeforeAppel === true);
  check('table des sources : bouton ▼ Afficher toutes les sources, apres la table',
    !!btnSources && btnSources.textContent === '▼ Afficher toutes les sources' &&
    (fauxTbl.afterAppels || []).includes(btnSources));
  if (btnSources && btnSources.listeners.click) {
    btnSources.listeners.click();
    check('clic sources : table depliee (classe retiree), bouton supprime',
      (fauxTbl.retires || []).includes('table-sources') && btnSources.retire === true);
  } else { check('clic sources : bouton câblé', false); }

  /* --- 5. Partage par chapitre : boutons câblés, même texte que l'édition --- */
  const partages = [];
  globalThis.navigator.share = p => { partages.push(p); return Promise.resolve(); };
  check('partage : les DEUX boutons btn-partage sont câblés',
    fauxPartages.every(b => typeof b.listeners.click === 'function'));
  fauxPartages[0].listeners.click();
  await Promise.resolve();
  check('partage : navigator.share avec lien profond canonique',
    partages.length === 1 &&
    partages[0].url === 'https://diyeah24.fr/#edition?c=economie-pour-les-nuls' &&
    partages[0].text === 'Economie pour les nuls — Le resume du chapitre' &&
    partages[0].title === 'DiY/H24');

  /* --- 6. Lien profond #edition?c=<id> : chapitre ouvert + défilement --- */
  check('lien profond : chapitre ouvert (open=true)',
    fauxChapitre.open === true);
  check('lien profond : scrollIntoView(smooth, start)',
    fauxChapitre.saut === '{"behavior":"smooth","block":"start"}');

  /* --- 7. Régression v115 : la délégation globale capture les btn-replier
   *     des éditions (même classe que les cartes du site). --- */
  const clics = ecouteursDocument.filter(e => e.type === 'click');
  const carte = { open: true, appels: [] };
  carte.removeAttribute = n => { carte.appels.push('removeAttribute:' + n); if (n === 'open') delete carte.open; };
  carte.scrollIntoView = o => { carte.appels.push('scrollIntoView:' + JSON.stringify(o)); };
  const fauxBouton = { closest: s => (s === '.btn-replier' ? fauxBouton : (s === 'details' ? carte : null)) };
  for (const c of clics) c.f({ target: { closest: fauxBouton.closest } });
  check('regression v115 : btn-replier des editions referme le details parent',
    carte.appels.includes('removeAttribute:open') && carte.appels.includes('scrollIntoView:{\"block\":\"start\"}'));

  /* --- 8. sw.js = CACHE >= v118 ; styles.css porte les règles du rendu natif --- */
  const sw = fs.readFileSync(path.join(RACINE, 'sw.js'), 'utf8');
  const mV = /CACHE = 'newsletter-v(\d+)'/.exec(sw);
  check('sw.js : CACHE >= v118 (bump a chaque livraison de code)', !!mV && +mV[1] >= 118);
  const css = fs.readFileSync(path.join(RACINE, 'styles.css'), 'utf8');
  check('styles.css : .edition-native, .table-sources et .btn-sources presents',
    css.includes('.edition-native') && css.includes('.table-sources') && css.includes('.btn-sources') &&
    css.includes('.edition-encart'));

  console.log((passes + ' tests verts' + (echecs ? ', ' + echecs + ' ECHECS' : '') + ' — edition-native.js (v118)'));
  process.exit(echecs ? 1 : 0);
}

main().catch(e => { console.error(e); process.exit(1); });
