/* tools/test/lot3.js — Harnas du lot 3 (v111) : moteur de corroboration partage.
 * Unitaires (module pur) + integration (etudiants.js, lyceens.js) hors-ligne.
 * Usage : node tools/test/lot3.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFileSync } = require('child_process');
const { corroborer, marquer } = require('../corroboration.js');

const RACINE = path.join(__dirname, '..', '..');
let ok = 0, ko = 0;
function t(nom, cond, detail) {
  if (cond) { ok++; console.log('  ok  ' + nom); }
  else { ko++; console.log('KO !!  ' + nom + (detail ? ' — ' + detail : '')); }
}

/* ——— 1. Unitaires : evenement a 1 vs 3 sources ——— */
console.log('— corroborer : 1 source vs 3 sources');
const une = corroborer({ sources: ['20 minutes'] });
t('1 source : non verifie, nbSources = 1', une.nbSources === 1 && une.verifie === false);
const trois = corroborer({ sources: ['20 minutes', 'BFMTV', 'RFI'] });
t('3 sources : verifie, nbSources = 3', trois.nbSources === 3 && trois.verifie === true);
const doublons = corroborer({ sources: ['20 minutes', '20 minutes', 'RFI', ''] });
t('doublons/vides retires : nbSources = 2, verifie', doublons.nbSources === 2 && doublons.verifie === true);
const champSource = corroborer({ source: 'Libération' });
t('champ source unique accepte', champSource.nbSources === 1 && champSource.verifie === false);
t('objet vide : 0 source, non verifie', corroborer({}).nbSources === 0 && corroborer({}).verifie === false);

/* ——— 2. marquer : ajoute verifie/nbSources ——— */
const items = [{ sources: ['a'] }, { sources: ['a', 'b', 'c'] }];
marquer(items);
t('marquer : items annotes', items[0].nbSources === 1 && items[0].verifie === false && items[1].nbSources === 3 && items[1].verifie === true);

/* ——— 3. Integration : compte de medias affiche dans le paragraphe ——— */
console.log('— integration etudiants.js (copie isolee)');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'lot3-'));
const REPO = path.join(TMP, 'repo');
fs.mkdirSync(path.join(REPO, 'tools'), { recursive: true });
fs.mkdirSync(path.join(REPO, 'data'), { recursive: true });
for (const f of fs.readdirSync(path.join(RACINE, 'tools')).filter(f => f.endsWith('.js'))) {
  fs.copyFileSync(path.join(RACINE, 'tools', f), path.join(REPO, 'tools', f));
}
fs.cpSync(path.join(RACINE, 'data', 'etudiants'), path.join(REPO, 'data', 'etudiants'), { recursive: true });
fs.copyFileSync(path.join(RACINE, 'data', 'lyceens.json'), path.join(REPO, 'data', 'lyceens.json'));

/* Un evenement corrobor sur 3 flux — titres partageant 3 racines
 * discriminantes hors STOP (grenoble, valmy, lyceens-vegenere...) — plus un
 * evenement a 1 seul media. */
const E_CORR = [
  { titre: 'Grenoble : le lycee Valmy bloque ce matin', desc: 'Le blocage du lycee Valmy a Grenoble se poursuit.', ageH: 1 },
  { titre: 'Grenoble : le lycee Valmy bloque par les eleves', desc: 'A Grenoble, le lycee Valmy reste bloque.', ageH: 1 }
];
const SEUL = { titre: 'Parcoursup : une plateforme sous tension', desc: 'Les eleves demandent des comptes sur l algorithme de classement et la transparence des criteres.', ageH: 2 };
const FLUX = {
  'https://www.20minutes.fr/feeds/rss-une.xml': [E_CORR[0], SEUL],
  'https://www.bfmtv.com/rss/news-24-7/': [E_CORR[1]],
  'https://www.francetvinfo.fr/france.rss': [{ titre: 'Grenoble : le lycee Valmy bloque, notre reportage', desc: 'Apercu franceinfo du blocage a Grenoble.', ageH: 1 }]
};
let code = "const f = require('./fakeclock.js');\n";
for (const [u, items] of Object.entries(FLUX)) code += 'f.ajouterFixture(' + JSON.stringify(u) + ', f.rss(' + JSON.stringify(items) + '));\n';
const TOUS = ['https://www.20minutes.fr/feeds/rss-une.xml', 'https://www.europe1.fr/rss.xml', 'https://www.publicsenat.fr/rss',
  'https://www.lefigaro.fr/rss/figaro_actualites.xml', 'https://www.bfmtv.com/rss/news-24-7/', 'https://www.francetvinfo.fr/france.rss',
  'https://radiofrance.fr/franceinfo/rss', 'https://www.france24.com/fr/rss', 'https://www.rfi.fr/fr/rss',
  'https://www.ouest-france.fr/rss.xml', 'https://www.la-croix.com/rss.xml', 'https://www.humanite.fr/feed',
  'https://www.mediapart.fr/articles/feed', 'https://www.liberation.fr/arc/outboundfeeds/rss-all/'];
for (const u of TOUS) if (!(u in FLUX)) code += 'f.ajouterFixture(' + JSON.stringify(u) + ', f.rss([]));\n';
fs.writeFileSync(path.join(REPO, 'tools', 'fixtures-lot3.js'), code);

function runEtu() {
  const out = execFileSync(process.execPath, ['tools/etudiants.js'], {
    cwd: REPO, encoding: 'utf8',
    env: { ...process.env, NODE_OPTIONS: '--require ./tools/fakeclock.js --require ./tools/fixtures-lot3.js' }
  });
  return JSON.parse(out.trim().split('\n').pop());
}
const r1 = runEtu();
t('releve publie', r1.modifie === true);
const r2 = runEtu();
t('idempotent', r2.modifie === false);

const idx = JSON.parse(fs.readFileSync(path.join(REPO, 'data', 'etudiants', 'index.json'), 'utf8'));
const ficJour = idx.chapitreJour.fichier.replace(/^chapitres\//, '');
const chap = JSON.parse(fs.readFileSync(path.join(REPO, 'data', 'etudiants', 'chapitres', ficJour), 'utf8'));
const par = chap.paragraphes[chap.paragraphes.length - 1];
t('evenement corrobor : « 3 medias : ... — corrobore » affiche',
  /3 medias : [^)]+ — corrobore/.test(par.texte), par.texte.slice(0, 500));
t('evenement a 1 media : « 1 media : ... — non corrobore » affiche',
  /1 media : [^)]+ — non corrobore/.test(par.texte));

/* faits : l evenement corrobor part dans data/lyceens.json avec verifie:true (moteur) */
const lyc = JSON.parse(fs.readFileSync(path.join(REPO, 'data', 'lyceens.json'), 'utf8'));
const faitCorr = (lyc.faits || []).find(f => /Valmy/.test(f.titre || '') && String(f.id || '').startsWith('aetu'));
t('fait corrobor exporte avec verifie:true', !!faitCorr && faitCorr.verifie === true && faitCorr.sources.length >= 2,
  faitCorr ? JSON.stringify(faitCorr.sources) : 'absent');
t('aucun fait a source unique exporte', !(lyc.faits || []).some(f => f.verifie === false && String(f.id || '').startsWith('aetu')));

/* ——— 4. lyceens.js : badges via moteur, comportement identique ——— */
console.log('— integration lyceens.js (badges via moteur)');
const outLyc = execFileSync(process.execPath, ['tools/lyceens.js'], {
  cwd: REPO, encoding: 'utf8',
  env: { ...process.env, NODE_OPTIONS: '--require ./tools/fakeclock.js --require ./tools/fixtures-lot3.js' }
});
const jLyc = JSON.parse(outLyc.trim().split('\n').pop());
t('lyceens.js : run OK (JSON en sortie)', jLyc.date === '07/10/2026');
const lyc2 = JSON.parse(fs.readFileSync(path.join(REPO, 'data', 'lyceens.json'), 'utf8'));
t('tous les faits verifie=true (corrobore >= 2 medias)',
  (lyc2.faits || []).every(f => f.verifie !== false));
t('un fait corrobor a bien >= 2 sources', (lyc2.faits || []).filter(f => (f.sources || []).length >= 2).length > 0);

fs.rmSync(TMP, { recursive: true, force: true });
console.log('\n' + (ko === 0 ? 'LOT3 : ' + ok + ' tests OK' : 'LOT3 : ' + ko + ' ECHECS / ' + ok + ' OK'));
process.exit(ko === 0 ? 0 : 1);
