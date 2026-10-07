/* tools/test/lot1.js — Harnas du lot 1 (v109) : filtre anti-bruit + nettoyerTitre.
 * Hors-ligne : Date gelee + fetch stubbe (tools/fakeclock.js), flux RSS factices
 * en dur — aucun reseau. Le script sous test tourne dans une copie temporaire
 * du repo (data/ isole), avec ses propres fixtures chargees via NODE_OPTIONS.
 * Usage : node tools/test/lot1.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFileSync } = require('child_process');
const { nettoyerTitre } = require('../titres.js');
const { rss } = require('../fakeclock.js');

const RACINE = path.join(__dirname, '..', '..');
let ok = 0, ko = 0;
function t(nom, cond) {
  if (cond) { ok++; console.log('  ok  ' + nom); }
  else { ko++; console.log('KO !!  ' + nom); }
}

/* ——— 1. nettoyerTitre (unitaire) ——— */
console.log('— nettoyerTitre');
t('prefixe EN DIRECT - retire',
  nettoyerTitre('EN DIRECT - Blocus au lycee Louis-le-Grand') === 'Blocus au lycee Louis-le-Grand');
t('prefixe DIRECT. retire',
  nettoyerTitre('DIRECT. Lyceens : nouvelle journee de mobilisation') === 'Lyceens : nouvelle journee de mobilisation');
t('prefixe SONDAGE - retire',
  nettoyerTitre('SONDAGE - Les Francais et la revolte lyceenne') === 'Les Francais et la revolte lyceenne');
t('prefixe FORUM BFMTV - retire',
  nettoyerTitre('FORUM BFMTV - Parcoursup en debat') === 'Parcoursup en debat');
t('prefixes empiles retires',
  nettoyerTitre('EN DIRECT - SONDAGE - lyceens en greve') === 'lyceens en greve');
t('titre sans prefixe intact',
  nettoyerTitre('Lyceens : blocus dans 300 etablissements') === 'Lyceens : blocus dans 300 etablissements');
t('espaces normalises',
  nettoyerTitre('  EN DIRECT -   Lyceens   en  blocus ') === 'Lyceens en blocus');

/* ——— 2. estMouvement : le titre doit matcher, la description ne suffit plus ——— */
console.log('— filtre anti-bruit (regle, miroir des regex sources)');
const RE_MOUVEMENT = /lyceen|lycee|blocus|blocage|parcoursup|etudiant|acte (trois|iii)/i;
const estMouvement = (t, d) => RE_MOUVEMENT.test(t);
t('exclu : « Guerre au Moyen-Orient » (description seule ne suffit plus)',
  !estMouvement('Guerre au Moyen-Orient : les derniers developpements',
    'Par ailleurs, les lyceens poursuivent leur mobilisation en France.'));
t('exclu : « Australie : mine de charbon » (description seule ne suffit plus)',
  !estMouvement('Australie : mine de charbon',
    'Le mouvement etudiant contre le projet obtient un sursis.'));
t('garde : titre mouvement + description etrangere',
  estMouvement('Lyceens : blocus total dans un lycee de Nantes',
    'Le maire commente la situation internationale.'));

/* ——— 3. Integration etudiants.js bout en bout (copie isolee, hors-ligne) ——— */
console.log('— integration etudiants.js (copie isolee)');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'lot1-'));
const REPO_TMP = path.join(TMP, 'repo');
fs.mkdirSync(path.join(REPO_TMP, 'tools'), { recursive: true });
fs.mkdirSync(path.join(REPO_TMP, 'data'), { recursive: true });
for (const f of fs.readdirSync(path.join(RACINE, 'tools')).filter(f => f.endsWith('.js'))) {
  fs.copyFileSync(path.join(RACINE, 'tools', f), path.join(REPO_TMP, 'tools', f));
}
fs.cpSync(path.join(RACINE, 'data', 'etudiants'), path.join(REPO_TMP, 'data', 'etudiants'), { recursive: true });
fs.copyFileSync(path.join(RACINE, 'data', 'lyceens.json'), path.join(REPO_TMP, 'data', 'lyceens.json'));

const ITEM_BRUIT_MOYEN_ORIENT = { titre: 'Guerre au Moyen-Orient : les derniers developpements', desc: 'Les lyceens poursuivent leur mobilisation en France.', ageH: 2 };
const ITEM_BRUIT_CHARBON = { titre: 'Australie : mine de charbon', desc: 'Le mouvement etudiant contre le projet obtient un sursis.', ageH: 2 };
const ITEM_DIRECT = { titre: 'EN DIRECT - Lyceens : blocus au lycee Louis-le-Grand', desc: 'Le rectorat confirme le blocage de l etablissement.', ageH: 1 };
const ITEM_BLOCUS = { titre: 'Blocus lyceen : 300 etablissements mobilises', desc: 'La mobilisation s etend selon les syndicats.', ageH: 3 };
const ITEM_VIEUX = { titre: 'Lyceens : blocus a Lille', desc: 'x', ageH: 30 };

const FLUX_20M = 'https://www.20minutes.fr/feeds/rss-une.xml';
const FLUX_VIDE = rss([]);
const AUTRES_FLUX = [
  'https://www.europe1.fr/rss.xml', 'https://www.publicsenat.fr/rss',
  'https://www.lefigaro.fr/rss/figaro_actualites.xml', 'https://www.bfmtv.com/rss/news-24-7/',
  'https://www.francetvinfo.fr/france.rss', 'https://radiofrance.fr/franceinfo/rss',
  'https://www.france24.com/fr/rss', 'https://www.rfi.fr/fr/rss',
  'https://www.ouest-france.fr/rss.xml', 'https://www.la-croix.com/rss.xml',
  'https://www.humanite.fr/feed', 'https://www.mediapart.fr/articles/feed',
  'https://www.liberation.fr/arc/outboundfeeds/rss-all/'
];
const FIXTURES = "/* Genere par tools/test/lot1.js */\n'use strict';\nconst f = require('./fakeclock.js');\n" +
  "f.ajouterFixture(" + JSON.stringify(FLUX_20M) + ", f.rss(" + JSON.stringify([ITEM_BRUIT_MOYEN_ORIENT, ITEM_BRUIT_CHARBON, ITEM_DIRECT, ITEM_BLOCUS, ITEM_VIEUX]) + "));\n" +
  AUTRES_FLUX.map(u => 'f.ajouterFixture(' + JSON.stringify(u) + ', f.rss([]));').join('\n') + '\n';
fs.writeFileSync(path.join(REPO_TMP, 'tools', 'fixtures-lot1.js'), FIXTURES);

function runEtu() {
  const out = execFileSync(process.execPath, ['tools/etudiants.js'], {
    cwd: REPO_TMP, encoding: 'utf8',
    env: { ...process.env, NODE_OPTIONS: '--require ./tools/fakeclock.js --require ./tools/fixtures-lot1.js' }
  });
  return JSON.parse(out.trim().split('\n').pop());
}

const r1 = runEtu();
t('run 1 : releve publie (modifie: true)', r1.modifie === true);
t('run 1 : 2 items mouvement retenus (bruits + hors fenetre exclus)', r1.items === 2);

const r2 = runEtu();
t('run 2 : idempotent (modifie: false)', r2.modifie === false);

const idx = JSON.parse(fs.readFileSync(path.join(REPO_TMP, 'data', 'etudiants', 'index.json'), 'utf8'));
t('index.json : releveSigs a 2 signatures', Array.isArray(idx.releveSigs) && idx.releveSigs.length === 2);
const ficJour = idx.chapitreJour.fichier.replace(/^chapitres\//, '');
const chap = JSON.parse(fs.readFileSync(path.join(REPO_TMP, 'data', 'etudiants', 'chapitres', ficJour), 'utf8'));
const par = chap.paragraphes[chap.paragraphes.length - 1];
t('paragraphe : titre nettoye (plus de « EN DIRECT - »)',
  par.texte.includes('Lyceens : blocus au lycee Louis-le-Grand') && !par.texte.includes('EN DIRECT'));
t('paragraphe : aucun item bruit', !par.texte.includes('Moyen-Orient') && !par.texte.includes('charbon'));

const lyc = JSON.parse(fs.readFileSync(path.join(REPO_TMP, 'data', 'lyceens.json'), 'utf8'));
t('lyceens.json : JSON.parse OK, aucun fait bruit',
  Array.isArray(lyc.faits) && !lyc.faits.some(f => /Moyen-Orient|charbon/.test(f.titre || '')));
t('fichiers produits < 32 Ko', fs.statSync(path.join(REPO_TMP, 'data', 'etudiants', 'chapitres', ficJour)).size < 32768);

/* ——— 4. Regression : fixtures reelles du repo ——— */
console.log('— regression sur fixtures reelles (chapitres actuels)');
for (const fic of fs.readdirSync(path.join(RACINE, 'data', 'etudiants', 'chapitres')).slice(0, 6)) {
  const j = JSON.parse(fs.readFileSync(path.join(RACINE, 'data', 'etudiants', 'chapitres', fic), 'utf8'));
  t('fixture ' + fic + ' : JSON.parse OK', !!j.id);
}

fs.rmSync(TMP, { recursive: true, force: true });
console.log('\n' + (ko === 0 ? 'LOT1 : ' + ok + ' tests OK' : 'LOT1 : ' + ko + ' ECHECS / ' + ok + ' OK'));
process.exit(ko === 0 ? 0 : 1);
