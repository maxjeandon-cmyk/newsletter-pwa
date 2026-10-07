/* tools/test/lot5.js — Harnas du lot 5 (CACHE v105) : corroboration client
 * (badge « N medias », miroir racines+chiffres du serveur), extrait coupe au mot,
 * rendu echappe, demarrage a froid complet (DOM factice + reseau stubbe, aucun
 * reseau). Usage : node tools/test/lot5.js — exit 0 si tout est vert. */
'use strict';
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFileSync } = require('child_process');

const RACINE = path.join(__dirname, '..', '..');
let ok = 0, ko = 0;
function t(nom, cond) { cond ? (ok++, console.log('  ok  ' + nom)) : (ko++, console.log('KO !!  ' + nom)); }

/* 1. Copie isolee du client en .mjs (Node n'a pas d'import map : on renomme
 *    le graphe ES modules et on reecrit les imports relatifs .js -> .mjs). */
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'lot5-'));
function copierMjs(dirIn, dirOut) {
  fs.mkdirSync(dirOut, { recursive: true });
  for (const f of fs.readdirSync(dirIn, { withFileTypes: true })) {
    if (f.isDirectory()) { copierMjs(path.join(dirIn, f.name), path.join(dirOut, f.name)); continue; }
    if (!f.name.endsWith('.js')) continue;
    const code = fs.readFileSync(path.join(dirIn, f.name), 'utf8').replace(/\.js(['"])/g, '.mjs$1');
    fs.writeFileSync(path.join(dirOut, f.name.replace(/\.js$/, '.mjs')), code);
  }
}
copierMjs(path.join(RACINE, 'js'), path.join(TMP, 'js'));

/* 2. Globales factices pour le demarrage a froid (meme recette que le harnas v104). */
const GLOBALES = `
const elem = () => ({ hidden: false, textContent: '', innerHTML: '', value: '', checked: false,
  disabled: false, style: { setProperty() {}, removeProperty() {} }, dataset: {}, onclick: null,
  classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
  addEventListener() {}, removeEventListener() {}, setAttribute() {}, getAttribute() { return null; },
  appendChild() {}, focus() {}, blur() {} });
globalThis.document = { visibilityState: 'visible',
  querySelector: () => elem(), querySelectorAll: () => [],
  getElementById: () => elem(), createElement: () => elem(),
  documentElement: elem(), body: elem(), addEventListener() {}, removeEventListener() {} };
globalThis.window = globalThis;
globalThis.history = { pushState() {}, replaceState() {}, state: null };
globalThis.location = { hash: '', href: 'https://diyeah24.fr/', origin: 'https://diyeah24.fr' };
globalThis.addEventListener = () => {};
globalThis.removeEventListener = () => {};
globalThis.matchMedia = () => ({ matches: false, addEventListener() {} });
/* navigator : Node 22 en fournit un natif (sans serviceWorker) — on n'y touche pas. */
globalThis.localStorage = (() => { const s = new Map(); return {
  getItem: k => (s.has(k) ? s.get(k) : null), setItem: (k, v) => s.set(k, String(v)),
  removeItem: k => s.delete(k), key: i => [...s.keys()][i] ?? null, get length() { return s.size; } }; })();
globalThis.fetch = async () => { throw new Error('hors-ligne (harnas)'); };
`;

/* 3. Runner unitaire : corroboration + troncMot + rendu echappe. */
fs.writeFileSync(path.join(TMP, 'unite.mjs'), GLOBALES + `
import { troncMot, compterMedias } from './js/feeds.mjs';
import { articleHtml } from './js/views/common.mjs';
let ok = 0, ko = 0;
const t = (n, c) => { c ? (ok++, console.log('  ok  ' + n)) : (ko++, console.log('KO !!  ' + n)); };

/* ——— troncMot : extrait coupe au mot, jamais en plein milieu ——— */
t('troncMot : texte court intact', troncMot('bonjour', 220) === 'bonjour');
t('troncMot : texte exactement a la borne intact', troncMot('0123456789', 10) === '0123456789');
t('troncMot : coupe au mot et termine en …', troncMot('aaaa bbbb cccc dddd', 12) === 'aaaa bbbb' + '…');

/* ——— compterMedias : miroir racines+chiffres du serveur ——— */
const L = [];
const art = (titre, source) => { const a = { titre }; L.push({ a, source }); return a; };
/* meme evenement, meme titre, 3 flux distincts (signature exacte) */
const c1 = art('Tempete sur la cote atlantique ce week-end', 'S1');
const c2 = art('Tempete sur la cote atlantique ce week-end', 'S2');
const c3 = art('Tempete sur la cote atlantique ce week-end', 'S3');
/* evenement reformule, >= 1 racine commune + meme chiffre significatif (300) */
const b1 = art('Blocus au lycee Louis-le-Grand : 300 eleves mobilises', 'S1');
const b2 = art('Louis-le-Grand : les eleves bloquent l etablissement, ils sont 300', 'S2');
/* meme evenement mais MEME flux (ne doit compter qu'une fois) */
const e1 = art('Incendie dans une usine de Roubaix', 'S1');
const e2 = art('Un incendie se declare dans une usine de Roubaix', 'S1');
/* evenements distincts : jamais de fausse union */
const d1 = art('Le prix Nobel de litterature decerne a une romanciere', 'S1');
const g1 = art('Reforme des retraites adoptee', 'S1');
const g2 = art('Victoire de l equipe de France de handball', 'S2');
/* titres sans aucune racine discriminante : pas d agglutination */
const h1 = art('ACTU : LE DIRECT', 'S1');
const h2 = art('ACTU : VIDEO ACTUS', 'S2');
compterMedias(L);
t('corrobore 3 medias (signature exacte, 3 flux)', c1.nbMedias === 3 && c2.nbMedias === 3 && c3.nbMedias === 3);
t('corrobore 2 medias (1 racine commune + meme chiffre 300)', b1.nbMedias === 2 && b2.nbMedias === 2);
t('meme flux deux fois = 1 seul media (flux distincts)', e1.nbMedias === 1 && e2.nbMedias === 1);
t('evenements distincts non rapproches (0/1)', d1.nbMedias === 1 && g1.nbMedias === 1 && g2.nbMedias === 1);
t('titres sans racine jamais agglutines', h1.nbMedias === 1 && h2.nbMedias === 1);

/* ——— rendu : badge + esc() sur tout texte externe ——— */
const html3 = articleHtml({ titre: 'Test', lien: 'https://x.fr/a', date: new Date(Date.now() - 3600e3),
  extrait: '<script>alert(1)</script> Bonjour', nbMedias: 3 });
t('badge « 3 medias » affiche', html3.includes('>✓ 3 médias</span>') || html3.includes('✓ 3 médias'));
t('extrait echappe (aucune balise <script> vivante)', html3.includes('&lt;script&gt;') && !html3.includes('<script>'));
const html1 = articleHtml({ titre: 'Seul', lien: 'https://x.fr/b', date: new Date(), extrait: '', nbMedias: 1 });
t('aucun badge a 1 media', !html1.includes('badge-medias'));
const htmlXss = articleHtml({ titre: '<img src=x onerror=1>', lien: 'https://x.fr/c', date: new Date(), nbMedias: 2 });
t('titre echappe (injection neutree)', htmlXss.includes('&lt;img') && !htmlXss.includes('<img src'));

console.log('UNITE : ' + ok + ' OK, ' + ko + ' KO');
process.exit(ko ? 1 : 0);
`);

/* 4. Demarrage a froid : import reel du graphe client + init() sur DOM factice. */
fs.writeFileSync(path.join(TMP, 'froid.mjs'), GLOBALES + `
const erreurs = [];
const ce = console.error;
console.error = (...a) => { erreurs.push(a.map(String).join(' ')); ce(...a); };
await import('./js/app.mjs');
await new Promise(r => setTimeout(r, 1500));
if (erreurs.some(e => e.startsWith('init'))) {
  console.log('KO !!  demarrage a froid : init() en erreur');
  console.log(erreurs.join('\\n').slice(0, 2000));
  process.exit(1);
}
console.log('  ok  demarrage a froid : graphe client importe + init() sans erreur (DEMARRAGE_OK)');
process.exit(0);
`);

/* 5. Contrat CACHE : bump v105 present dans sw.js. */
console.log('— contrat depot');
const sw = fs.readFileSync(path.join(RACINE, 'sw.js'), 'utf8');
t('sw.js : CACHE = newsletter-v105', /const CACHE = 'newsletter-v105'/.test(sw));
const feedsSrc = fs.readFileSync(path.join(RACINE, 'js', 'feeds.js'), 'utf8');
t('feeds.js : corroboration client (compterMedias) exportee', /export function compterMedias/.test(feedsSrc));
t('feeds.js : extrait coupe au mot (troncMot, plus de slice brut)', feedsSrc.includes('troncMot(') && !feedsSrc.includes('.trim().slice(0, 220)'));

/* 6. Execution des enfants + collecte. */
console.log('— unite (corroboration, troncMot, rendu)');
let code = 0;
let sortie;
try { sortie = execFileSync('node', ['unite.mjs'], { cwd: TMP, encoding: 'utf8' }); }
catch (e) { code = 1; sortie = (e.stdout || '') + (e.stderr || ''); }
process.stdout.write(sortie);
for (const l of sortie.split('\n')) { if (l.startsWith('  ok  ')) ok++; if (l.startsWith('KO !!  ')) ko++; }
if (code) ko++;

console.log('— demarrage a froid (DOM factice, reseau stubbe)');
code = 0;
try { sortie = execFileSync('node', ['froid.mjs'], { cwd: TMP, encoding: 'utf8' }); }
catch (e) { code = 1; sortie = (e.stdout || '') + (e.stderr || ''); }
process.stdout.write(sortie);
for (const l of sortie.split('\n')) { if (l.startsWith('  ok  ')) ok++; if (l.startsWith('KO !!  ')) ko++; }
if (code) ko++;

fs.rmSync(TMP, { recursive: true, force: true });
console.log('LOT5 : ' + ok + ' tests OK' + (ko ? (', ' + ko + ' KO !!') : ''));
process.exit(ko ? 1 : 0);
