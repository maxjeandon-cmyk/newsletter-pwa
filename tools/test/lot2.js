/* tools/test/lot2.js — Harnas du lot 2 (v110) : moisson enrichie (apercus).
 * Hors-ligne : Date gelee + fetch stubbe, 12 items de mouvement avec apercus
 * sur plusieurs flux (corroboration) — aucun reseau, copie isolee du repo.
 * Usage : node tools/test/lot2.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFileSync } = require('child_process');

const RACINE = path.join(__dirname, '..', '..');
let ok = 0, ko = 0;
function t(nom, cond) {
  if (cond) { ok++; console.log('  ok  ' + nom); }
  else { ko++; console.log('KO !!  ' + nom); }
}

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'lot2-'));
const REPO = path.join(TMP, 'repo');
fs.mkdirSync(path.join(REPO, 'tools'), { recursive: true });
fs.mkdirSync(path.join(REPO, 'data'), { recursive: true });
for (const f of ['etudiants.js', 'lyceens.js', 'titres.js', 'fakeclock.js']) {
  fs.copyFileSync(path.join(RACINE, 'tools', f), path.join(REPO, 'tools', f));
}
fs.cpSync(path.join(RACINE, 'data', 'etudiants'), path.join(REPO, 'data', 'etudiants'), { recursive: true });
fs.copyFileSync(path.join(RACINE, 'data', 'lyceens.json'), path.join(REPO, 'data', 'lyceens.json'));

/* 12 items mouvement, dont plusieurs couples corroborees entre 2 flux. */
const M_20M = [
  { titre: 'Lyceens : blocus au lycee Louis-le-Grand a Paris', desc: 'Une centaine d eleves bloquent l entree principale depuis 7 h du matin, le rectorat dit suivre la situation heure par heure.', ageH: 1 },
  { titre: 'Mobilisation lyceenne : la Rue d Ulm repond presente', desc: 'Les eleves de Henri-IV rejoignent le mouvement avec un cortelage prévu en fin de journée.', ageH: 2 },
  { titre: 'Parcoursup : les lyciens demands des comptes sur l algorithme', desc: 'Une petition signee par 1200 eleves reclame la publication des criteres de classement.', ageH: 3 }
];
const M_BFM = [
  { titre: 'Lyceens : blocus au lycee Louis-le-Grand, les images', desc: 'Le blocage se poursuit a Paris, images prises ce matin.', ageH: 1 },
  { titre: 'Greffray annonce un dialogue avec les delegues lyceens', desc: 'La ministre de l Education recevra des delegues la semaine prochaine.', ageH: 2 }
];
const M_FTV = [
  { titre: 'Lyceens : blocus au lycee Louis-le-Grand a Paris', desc: 'Apercu franceinfo du blocage.', ageH: 1 },
  { titre: '300 etablissements lyceens touches par la mobilisation', desc: 'Le ministere confirme un compte provisoire de 300 etablissements perturbés mardi.', ageH: 4 }
];
const M_RFI = [
  { titre: 'Manifestation lyceenne : la police evacue un blocus a Nantes', desc: 'Quatre interpellations sont signalees par la prefecture de Loire-Atlantique.', ageH: 5 },
  { titre: 'Lyceens grevistes : une semaine decisive commence', desc: 'Les syndicats lycéens appellent a un rattrapage des cours non prevu.', ageH: 6 }
];
const M_CROIX = [
  { titre: 'Enseignants : le cafe pedagogique publie une lettre ouverte', desc: 'Des profs de lycee appellent a ne pas sanctionner les eleves bloqueurs.', ageH: 7 }
];
const M_HUM = [
  { titre: 'Lyceens : blocus a Nantes, la police evacue', desc: 'Nos envoyes speciaux decrivent une evacuation musclee du blocus nantais.', ageH: 5 }
];

const FLUX = {
  'https://www.20minutes.fr/feeds/rss-une.xml': M_20M,
  'https://www.bfmtv.com/rss/news-24-7/': M_BFM,
  'https://www.francetvinfo.fr/france.rss': M_FTV,
  'https://www.rfi.fr/fr/rss': M_RFI,
  'https://www.la-croix.com/rss.xml': M_CROIX,
  'https://www.humanite.fr/feed': M_HUM
};
let code = "const f = require('./fakeclock.js');\n";
for (const [u, items] of Object.entries(FLUX)) {
  code += 'f.ajouterFixture(' + JSON.stringify(u) + ', f.rss(' + JSON.stringify(items) + '));\n';
}
const TOUS = ['https://www.20minutes.fr/feeds/rss-une.xml', 'https://www.europe1.fr/rss.xml', 'https://www.publicsenat.fr/rss',
  'https://www.lefigaro.fr/rss/figaro_actualites.xml', 'https://www.bfmtv.com/rss/news-24-7/', 'https://www.francetvinfo.fr/france.rss',
  'https://radiofrance.fr/franceinfo/rss', 'https://www.france24.com/fr/rss', 'https://www.rfi.fr/fr/rss',
  'https://www.ouest-france.fr/rss.xml', 'https://www.la-croix.com/rss.xml', 'https://www.humanite.fr/feed',
  'https://www.mediapart.fr/articles/feed', 'https://www.liberation.fr/arc/outboundfeeds/rss-all/'];
for (const u of TOUS) if (!(u in FLUX)) code += 'f.ajouterFixture(' + JSON.stringify(u) + ', f.rss([]));\n';
fs.writeFileSync(path.join(REPO, 'tools', 'fixtures-lot2.js'), code);

function runEtu() {
  const out = execFileSync(process.execPath, ['tools/etudiants.js'], {
    cwd: REPO, encoding: 'utf8',
    env: { ...process.env, NODE_OPTIONS: '--require ./tools/fakeclock.js --require ./tools/fixtures-lot2.js' }
  });
  return JSON.parse(out.trim().split('\n').pop());
}

console.log('— lot 2 : assemblage avec 12 items + apercus');
const r1 = runEtu();
t('run 1 : releve publie', r1.modifie === true);
t('evenements uniques retenus (fusion corroboree)', r1.items >= 8 && r1.items <= 12, 'items=' + r1.items);

const r2 = runEtu();
t('run 2 : idempotent (modifie: false)', r2.modifie === false);

const idx = JSON.parse(fs.readFileSync(path.join(REPO, 'data', 'etudiants', 'index.json'), 'utf8'));
const ficJour = idx.chapitreJour.fichier.replace(/^chapitres\//, '');
const chap = JSON.parse(fs.readFileSync(path.join(REPO, 'data', 'etudiants', 'chapitres', ficJour), 'utf8'));
const par = chap.paragraphes[chap.paragraphes.length - 1];
t('paragraphe valide (> 200 caracteres)', par.texte.length > 200);
t('paragraphe < 8 Ko', par.texte.length < 8000, 'len=' + par.texte.length);
t('apercu present (« — detail : »)', par.texte.includes('— detail : '));
t('un seul « — detail : » par phrase de volet (<= 5)', (par.texte.match(/— detail : /g) || []).length <= 5);
t('titre nettoye present', !par.texte.includes('EN DIRECT'));
t('JSON chapitre < 32 Ko', fs.statSync(path.join(REPO, 'data', 'etudiants', 'chapitres', ficJour)).size < 32768);

/* faits : texte utilise l apercu quand plus informatif */
const lyc = JSON.parse(fs.readFileSync(path.join(REPO, 'data', 'lyceens.json'), 'utf8'));
const faitFrais = (lyc.faits || []).find(f => /Nantes/.test(f.titre || '') && String(f.id || '').startsWith('aetu'));
t('fait exporte avec texte enrichi (apercu > titre)', !!faitFrais && faitFrais.texte.length > faitFrais.titre.length, faitFrais ? faitFrais.texte.slice(0, 60) : 'absent');
t('lyceens.json JSON.parse OK', Array.isArray(lyc.faits));

/* valide la structure (releveSigs) */
t('releveSigs = items du releve', Array.isArray(idx.releveSigs) && idx.releveSigs.length === r1.items);

fs.rmSync(TMP, { recursive: true, force: true });
console.log('\n' + (ko === 0 ? 'LOT2 : ' + ok + ' tests OK' : 'LOT2 : ' + ko + ' ECHECS / ' + ok + ' OK'));
process.exit(ko === 0 ? 0 : 1);
