#!/usr/bin/env node
/* tools/test/replier-site.js — harnas du bouton « ▲ Replier » au bas de tous
 * les volets déroulants du site (CACHE v115).
 * Vérifie, hors ligne (aucune dépendance, aucun réseau) :
 *   1. boutonReplier (js/views/common.js v19) produit le bouton exact —
 *      libellé par défaut « ▲ Replier », « ▲ Replier le chapitre » pour les
 *      chapitres de la Version des Lycéens (même libellé que les éditions) ;
 *   2. la délégation globale referme le <details> parent (removeAttribute
 *      open) et y remonte (scrollIntoView block start) ; un clic hors bouton
 *      ne touche à rien ; la délégation pastille v114 est toujours posée ;
 *   3. RENDU RÉEL des trois vues porteuses de cartes déroulantes :
 *      Réglages (8 cartes), Newsletters (Copernicus + ONG), onglet ✊
 *      (encart + infos gouv/faits multisources) — chaque <details> rendu
 *      porte exactement un bouton btn-replier juste avant son </details> ;
 *   4. invariants source : chaque construction de <details> dans les vues
 *      appelle boutonReplier (9 Réglages dont guide d'installation, 4 ✊,
 *      2 Newsletters), styles.css porte .btn-replier, sw.js = v115 ;
 *   5. démarrage à froid : les modules s'importent avec un DOM factice
 *      (querySelectorAll -> [] pour ne pas polluer le wiring).
 * Usage : node tools/test/replier-site.js (depuis la racine du dépôt). */
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
const stubElt = () => ({
  innerHTML: '', textContent: '', value: '', hidden: false, disabled: false,
  dataset: {}, onclick: null, onchange: null, oninput: null,
  querySelector: () => null, querySelectorAll: () => [], closest: () => null,
  addEventListener: () => {}, setAttribute: () => {}, removeAttribute: () => {},
  classList: { toggle: () => {}, add: () => {}, remove: () => {} },
  style: { setProperty: () => {} }
});
globalThis.document = {
  addEventListener: (type, f) => ecouteursDocument.push({ type, f }),
  querySelector: () => stubElt(),
  querySelectorAll: () => [], /* piège connu : jamais tous les éléments */
  getElementById: () => null,
  createElement: () => stubElt(),
  documentElement: { dataset: {}, style: { setProperty: () => {} } }
};
globalThis.window = globalThis;
globalThis.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {}, key: () => null };
globalThis.location = { href: 'https://diyeah24.fr/#reglages', origin: 'https://diyeah24.fr', pathname: '/', reload: () => {} };
globalThis.history = { pushState: () => {}, replaceState: () => {} };
globalThis.matchMedia = () => ({ matches: false });
globalThis.addEventListener = () => {};
/* Node 22 expose déjà navigator (getter seul) — userAgent natif suffit. */
globalThis.fetch = () => Promise.reject(new Error('hors ligne'));

/* --- Bac à sable "type":"module" : vrais modules + stubs des couches réseau --- */
const bac = fs.mkdtempSync(path.join(require('os').tmpdir(), 'replier-'));
fs.writeFileSync(path.join(bac, 'package.json'), '{"type":"module"}');
for (const f of ['core.js', 'router.js', 'onglets.js', 'feeds.js']) {
  fs.copyFileSync(path.join(RACINE, 'js', f), path.join(bac, f));
}
/* Stub des modules réseau de Réglages (aucun appel attendu dans le rendu). */
fs.writeFileSync(path.join(bac, 'compte.js'),
  'export const inscrire = async () => {};\nexport const connecter = async () => {};\n' +
  'export const deconnecter = () => {};\nexport const restaurerSession = async () => {};\n' +
  'export const synchroniserPrefs = async () => {};\nexport const envoyerPrefs = async () => {};\n' +
  'export const abonne = () => null;\nexport const estConnecte = () => false;\nexport const veutResterConnecte = () => false;\n');
fs.writeFileSync(path.join(bac, 'push.js'),
  'export const pushDisponible = () => false;\nexport const prefsNotifications = () => ({});\n' +
  'export const basculerNotification = async () => {};\nexport const desabonner = async () => {};\n' +
  'export const safariOngletSansPush = () => true;\nexport const ctxNotifications = () => ({});\n');
fs.writeFileSync(path.join(bac, 'meteo.js'),
  'export const chercherVilles = async () => [];\nexport const choisirVille = () => {};\nexport const villeMeteo = () => null;\n');
fs.mkdirSync(path.join(bac, 'views'));
for (const f of ['common.js', 'lyceens.js', 'reglages.js', 'newsletters.js']) {
  fs.copyFileSync(path.join(RACINE, 'js', 'views', f), path.join(bac, 'views', f));
}

async function main() {
  /* --- 1. Syntaxe ES modules : node --check via copie .mjs (leçon v65) --- */
  for (const f of ['common', 'lyceens', 'reglages', 'newsletters']) {
    const dst = path.join(bac, f + '.mjs');
    fs.copyFileSync(path.join(bac, 'views', f + '.js'), dst);
    execFileSync('node', ['--check', dst], { stdio: 'pipe' });
  }
  check('syntaxe ES modules (node --check .mjs) : 4 vues', true);

  /* --- 2. Import réel des modules (démarrage à froid sur DOM factice) --- */
  const common = await import(pathToFileURL(path.join(bac, 'views', 'common.js')).href);
  const lyceens = await import(pathToFileURL(path.join(bac, 'views', 'lyceens.js')).href);
  const reglages = await import(pathToFileURL(path.join(bac, 'views', 'reglages.js')).href);
  const newsletters = await import(pathToFileURL(path.join(bac, 'views', 'newsletters.js')).href);
  check('import des 4 modules sans crash (DEMARRAGE_OK)',
    !!common.boutonReplier && !!lyceens.vueLyceens && !!reglages.vueReglages && !!newsletters.vueNewsletters);

  /* --- 3. boutonReplier : sortie exacte, mêmes libellés que les éditions --- */
  check('boutonReplier() par defaut',
    common.boutonReplier() === '<button type="button" class="btn-replier">▲ Replier</button>');
  check('boutonReplier(Replier le chapitre)',
    common.boutonReplier('Replier le chapitre') === '<button type="button" class="btn-replier">▲ Replier le chapitre</button>');

  /* --- 4. Délégation globale : referme le <details> parent et y remonte --- */
  const clics = ecouteursDocument.filter(e => e.type === 'click');
  check('delegation globale posee au chargement (clic)', clics.length >= 2);
  const carte = { open: true, appels: [] };
  const fauxBouton = { closest: s => (s === '.btn-replier' ? fauxBouton : (s === 'details' ? carte : null)) };
  carte.removeAttribute = n => { carte.appels.push('removeAttribute:' + n); if (n === 'open') delete carte.open; };
  carte.scrollIntoView = o => { carte.appels.push('scrollIntoView:' + JSON.stringify(o)); };
  for (const c of clics) c.f({ target: { closest: fauxBouton.closest } });
  check('clic bouton : removeAttribute(open)', carte.appels.includes('removeAttribute:open') && !('open' in carte));
  check('clic bouton : scrollIntoView(block start)', carte.appels.includes('scrollIntoView:{"block":"start"}'));
  /* clic hors bouton : rien ne bouge */
  const carte2 = { open: true, removeAttribute: () => { throw new Error('ne doit pas arriver'); }, scrollIntoView: () => {} };
  const horsBouton = { closest: () => null };
  let silencieux = true;
  try { for (const c of clics) c.f({ target: horsBouton }); } catch (e) { silencieux = false; }
  check('clic hors bouton : aucun repliage', silencieux && carte2.open === true);
  /* régression pastille v114 : un bouton .badge-medias déplie toujours sa liste */
  const zone = { liste: { hidden: true } };
  const pastille = {
    closest: s => (s === '.badge-medias' ? pastille : (s === '.article' ? zone : null)),
    setAttribute: (n, v) => { pastille[n] = v; }, classList: { toggle: () => {} }
  };
  zone.querySelector = () => zone.liste;
  for (const c of clics) c.f({ target: pastille });
  check('regression pastille v114 : depliage intact', zone.liste.hidden === false && pastille['aria-expanded'] === 'true');

  /* --- 5. Rendu réel : chaque <details> rendu porte son bouton --- */
  const compterBoutons = html => (String(html).match(/class="btn-replier"/g) || []).length;
  const compterDetails = html => (String(html).match(/<details/g) || []).length;
  const attraper = () => {
    let vu = '';
    const e = stubElt();
    Object.defineProperty(e, 'innerHTML', { get: () => vu, set: v => { vu = v; }, configurable: true });
    globalThis.document.querySelector = s => (s === '#view' ? e : stubElt());
    return () => vu;
  };

  /* Réglages : 8 cartes (les guides d'installation vivent dans #guide-install,
   * rempli à part — comptés par l'invariant source plus bas). */
  const vuReglages = attraper();
  await reglages.vueReglages();
  const htmlReglages = vuReglages();
  check('vueReglages : 8 cartes, 8 boutons',
    compterDetails(htmlReglages) === 8 && compterBoutons(htmlReglages) === 8);

  /* Newsletters : bulletin Copernicus + une ONG */
  const core = await import(pathToFileURL(path.join(bac, 'core.js')).href);
  core.state.climat = { titre: 'Bulletin test', source: 'Copernicus', periode: 'octobre 2026', resume: 'Resume.', points: ['Un point.'], lien: 'https://example.org/c', maj: '2026-10-09' };
  core.state.newsletters = { intro: 'Intro.', organisations: [{ id: 'ong', nom: 'ONG test', emoji: '🗞️', frequence: 'Hebdo', description: 'Description.', lien: 'https://example.org' }] };
  const vuNews = attraper();
  newsletters.vueNewsletters();
  const htmlNews = vuNews();
  check('vueNewsletters : Copernicus + 1 ONG -> 2 details, 2 boutons',
    compterDetails(htmlNews) === 2 && compterBoutons(htmlNews) === 2);

  /* Onglet ✊ : encart + 2 infos gouvernement (sous-onglet gouvernement) */
  core.state.lyceensSub = 'gouvernement';
  core.state.lyceens = {
    titre: 'Mouvement lycéen', maj: '2026-10-09 06:00', intro: 'Quatre lectures ici.',
    version_gouvernement: [
      { date: '08/10/2026', titre: 'Info un', texte: 'Texte un.', verifie: true, sources: ['Le Monde', 'France Info'] },
      { date: '07/10/2026', titre: 'Info deux', texte: 'Texte deux.', verifie: false, source: 'Reuters' }
    ],
    faits: []
  };
  const vuLyceens = attraper();
  lyceens.vueLyceens();
  const htmlLyceens = vuLyceens();
  check('vueLyceens : encart + 2 infos gouv -> 3 details, 3 boutons',
    compterDetails(htmlLyceens) === 3 && compterBoutons(htmlLyceens) === 3);

  /* --- 6. Invariants source : chaque construction appelle boutonReplier ---
   * (hors lignes de commentaire, qui citent souvent le HTML) */
  const codeDe = f => fs.readFileSync(path.join(RACINE, 'js', 'views', f), 'utf8')
    .split('\n').filter(l => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n');
  for (const [f, n] of [['reglages.js', 9], ['lyceens.js', 4], ['newsletters.js', 2]]) {
    const s = codeDe(f);
    const nbDetails = (s.match(/'<details|"<details/g) || []).length;
    const nbBoutons = (s.match(/boutonReplier\(/g) || []).length;
    check('source ' + f + ' : ' + n + ' <details> = ' + n + ' boutonReplier()',
      nbDetails === n && nbBoutons === n);
  }
  const css = fs.readFileSync(path.join(RACINE, 'styles.css'), 'utf8');
  check('styles.css : regle .btn-replier presente', /\.btn-replier\{/.test(css));
  const sw = fs.readFileSync(path.join(RACINE, 'sw.js'), 'utf8');
  check('sw.js : CACHE v115', /CACHE = 'newsletter-v115'/.test(sw));

  console.log('replier-site : ' + passes + ' test(s) vert(s)' + (echecs ? ', ' + echecs + ' ECHEC(S)' : ''));
  process.exit(echecs ? 1 : 0);
}

main().catch(e => { console.error('ECHEC FATAL :', e); process.exit(1); });
