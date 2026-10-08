/* tools/test/lot6.js — Harnas du lot 6 (v112) + retitrage v114 + ordre
 * « chronologie d'abord, transverses à la fin » (v115) : voix des réseaux
 * (flux Reddit), fin des actes numérotés, insertion avant les transverses.
 * Hors-ligne : Date gelée + fetch stubbé (tools/fakeclock.js), flux factices en
 * dur — aucun réseau. Le script sous test tourne dans des copies temporaires du
 * repo (data/ isolé), avec ses propres fixtures chargées via NODE_OPTIONS.
 * v115 : chaque scénario ÉPINGLE son état (chapitreJour c18/18.json du jour
 * gelé 07/10/2026, fichier chapitres/18.json garanti) — plus AUCUNE dépendance
 * au chapitreJour réel ni au contenu réel du dossier chapitres/ : la maintenance
 * peut publier entre-temps, le harnas reste vert (leçon des faux échecs du
 * 08/10 : chapitreJour était passé à c19/08/10).
 * Scénarios :
 *   A. Publication : 1 événement presse corroboré (2 medias) + Reddit (2 posts
 *      voix, 1 post raccroché a l événement presse, 1 hors-sujet, 1 hors-fenêtre).
 *      Le post raccroché devient une mention « repris aussi sur r/… » sans
 *      compter dans nbSources ; les posts voix nourrissent le volet final ;
 *      JAMAIS dans les faits vérifiés (data/lyceens.json).
 *   B. Idempotence : un 2e run identique ne publie rien.
 *   C. Échec Reddit 429 SILENCIEUX : le relevé presse est publié quand même.
 *   D. Cap réseaux : 6 posts Reddit valides -> 4 retenus (CAP_RESEAUX).
 *   E. Nouveau jour (v114) : chapitre créé avec le titre placeholder
 *      « Le fil continue — <date> », SANS « Acte N » ni index.prochainActe.
 *      Le numéro du chapitre créé est calculé DYNAMIQUEMENT (dernier
 *      \d+.json + 1) — plus aucune valeur en dur.
 *   F. Ordre v115 : dans la section chronique, un NOUVEAU chapitre est inséré
 *      AVANT le premier transverse (c10-c16) ; transverses en fin de liste ;
 *      ordre interne de chaque partie préservé ; entrée bien dans
 *      index.chapitres ; chapitreJour actualisé.
 * Usage : node tools/test/lot6.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFileSync } = require('child_process');

const RACINE = path.join(__dirname, '..', '..');
let ok = 0, ko = 0;
function t(nom, cond, detail) {
  if (cond) { ok++; console.log('  ok  ' + nom); }
  else { ko++; console.log('KO !!  ' + nom + (detail ? ' — ' + detail : '')); }
}

/* ———— URLs du catalogue presse + flux Reddit (miroir de tools/etudiants.js v115) ———— */
const U_ETU = 'https://www.reddit.com/r/etudiants/.rss';
const U_ENS = 'https://www.reddit.com/r/enseignants/.rss';
const U_FR = 'https://www.reddit.com/r/france/.rss';
const P_20M = 'https://www.20minutes.fr/feeds/rss-une.xml';
const P_FTV = 'https://www.francetvinfo.fr/france.rss';
const AUTRES_PRESSE = [
  'https://www.europe1.fr/rss.xml', 'https://www.publicsenat.fr/rss',
  'https://radiofrance.fr/franceinfo/rss', 'https://www.france24.com/fr/rss',
  'https://www.rfi.fr/fr/rss', 'https://www.ouest-france.fr/rss.xml',
  'https://www.humanite.fr/feed', 'https://www.mediapart.fr/articles/feed',
  'https://www.liberation.fr/arc/outboundfeeds/rss-all/'
];

/* ———— Aides : copie isolée du repo, épinglage, fixtures, run, dernier paragraphe ———— */
const JOUR_GELE = '07/10/2026'; /* jour gelé de tools/fakeclock.js (INSTANT = 07/10/2026 15:00 UTC) */
function preparerCopie() {
  const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'lot6-'));
  const REPO = path.join(TMP, 'repo');
  fs.mkdirSync(path.join(REPO, 'tools'), { recursive: true });
  fs.mkdirSync(path.join(REPO, 'data'), { recursive: true });
  for (const f of fs.readdirSync(path.join(RACINE, 'tools')).filter(f => f.endsWith('.js'))) {
    fs.copyFileSync(path.join(RACINE, 'tools', f), path.join(REPO, 'tools', f));
  }
  fs.cpSync(path.join(RACINE, 'data', 'etudiants'), path.join(REPO, 'data', 'etudiants'), { recursive: true });
  fs.copyFileSync(path.join(RACINE, 'data', 'lyceens.json'), path.join(REPO, 'data', 'lyceens.json'));
  return { TMP, REPO };
}
/* v115 : chaque scénario ÉPINGLE son propre chapitre du jour — le c18 du jour
 * gelé, avec son fichier garanti — pour ne dépendre NI du chapitreJour réel NI
 * du contenu réel du dossier chapitres/. */
function epinglerJour(REPO) {
  const fic = path.join(REPO, 'data', 'etudiants', 'chapitres', '18.json');
  if (!fs.existsSync(fic)) {
    fs.copyFileSync(path.join(RACINE, 'data', 'etudiants', 'chapitres', '18.json'), fic);
  }
  const ficIndex = path.join(REPO, 'data', 'etudiants', 'index.json');
  const idx = JSON.parse(fs.readFileSync(ficIndex, 'utf8'));
  idx.chapitreJour = { id: 'c18', fichier: 'chapitres/18.json', date: JOUR_GELE };
  fs.writeFileSync(ficIndex, JSON.stringify(idx, null, 2) + '\n');
}
/* Dernier numéro de chapitre présent dans la copie (dynamique — scénarios E/F). */
function dernierNumero(REPO) {
  return fs.readdirSync(path.join(REPO, 'data', 'etudiants', 'chapitres'))
    .filter(f => /^\d+\.json$/.test(f))
    .reduce((max, f) => Math.max(max, parseInt(f, 10)), 0);
}
function ecrireFixtures(REPO, tag, corps) {
  const src = "'use strict';\n/* Genere par tools/test/lot6.js */\nconst f = require('./fakeclock.js');\n" + corps + '\n';
  fs.writeFileSync(path.join(REPO, 'tools', 'fixtures-' + tag + '.js'), src);
}
function runEtu(REPO, tag) {
  const out = execFileSync(process.execPath, ['tools/etudiants.js'], {
    cwd: REPO, encoding: 'utf8',
    env: { ...process.env, NODE_OPTIONS: '--require ./tools/fakeclock.js --require ./tools/fixtures-' + tag + '.js' }
  });
  return JSON.parse(out.trim().split('\n').pop());
}
/* sortie.fichier est deja relative a la racine du repo (« data/etudiants/… ») :
 * PAS de double préfixe data/etudiants ici. */
function dernierParagraphe(REPO, sortie) {
  const fic = path.join(REPO, sortie.fichier);
  const chap = JSON.parse(fs.readFileSync(fic, 'utf8'));
  return chap.paragraphes[chap.paragraphes.length - 1];
}
/* Presse secondaire vide + Reddit vide — les scénarios ajoutent leurs propres
 * fixtures presse/réseaux par-dessus. */
function fixturesCreuses() {
  return AUTRES_PRESSE.map(u => 'f.ajouterFixture(' + JSON.stringify(u) + ', f.rss([]));').join('\n') + '\n' +
    'f.ajouterFixture(' + JSON.stringify(U_ETU) + ', f.atom([]));\n' +
    'f.ajouterFixture(' + JSON.stringify(U_ENS) + ', f.atom([]));\n' +
    'f.ajouterFixture(' + JSON.stringify(U_FR) + ', f.atom([]));';
}

/* —————— Scénario A : publication presse corroborée + Reddit —————— */
console.log('— scenario A : publication, volet voix + raccrochage');
const A = preparerCopie();
epinglerJour(A.REPO);
const EVENEMENT_A_20M = { titre: 'Blocus au lycée Louis-le-Grand : 300 élèves mobilisés', desc: 'Le rectorat confirme le blocage de l etablissement, les eleves tiennent une assemblee.', ageH: 1 };
const EVENEMENT_A_FTV = { titre: 'Lycée Louis-le-Grand : le blocus se poursuit, 300 élèves présents', desc: 'Selon la direction, les cours sont maintenus a distance pour les autres classes.', ageH: 2 };
ecrireFixtures(A.REPO, 'a',
  'f.ajouterFixture(' + JSON.stringify(P_20M) + ', f.rss(' + JSON.stringify([EVENEMENT_A_20M]) + '));\n' +
  'f.ajouterFixture(' + JSON.stringify(P_FTV) + ', f.rss(' + JSON.stringify([EVENEMENT_A_FTV]) + '));\n' +
  /* r/etudiants : 1 post voix, 1 hors-sujet (titre sans mot du mouvement), 1 hors-fenêtre (30 h). */
  'f.ajouterFixture(' + JSON.stringify(U_ETU) + ', f.atom(' + JSON.stringify([
    { titre: 'Etudiant en blocus : je raconte ma journée au lycée depuis la salle 12', desc: 'Témoignage en direct de l occupation de la salle de permanence, filmé pour les réseaux.', ageH: 1 },
    { titre: 'Ramen : la ville ouvre une cantine gratuite le soir', desc: 'Un sujet qui revient souvent sur ce fil des étudiants.', ageH: 2 },
    { titre: 'Givraine : les lycéens organisent une veillée', desc: 'Post ancien, hors fenêtre de fraîcheur.', ageH: 30 }
  ]) + '));\n' +
  /* r/enseignants : 1 post voix enseignant + 1 post qui reprend l événement presse (raccordage). */
  'f.ajouterFixture(' + JSON.stringify(U_ENS) + ', f.atom(' + JSON.stringify([
    { titre: 'Je suis professeur, je témoigne du blocus depuis la salle des profs', desc: 'La parole des enseignants, en direct des établissements.', ageH: 2 },
    { titre: '300 élèves en blocus au lycée Louis-le-Grand : notre témoignage d enseignants', desc: 'Nous confirmons la mobilisation décrite par la presse.', ageH: 1 }
  ]) + '));\n' +
  'f.ajouterFixture(' + JSON.stringify(U_FR) + ', f.atom([]));\n' +
  AUTRES_PRESSE.map(u => 'f.ajouterFixture(' + JSON.stringify(u) + ', f.rss([]));').join('\n'));

const s1 = runEtu(A.REPO, 'a');
t('run 1 : relevé publié (modifie: true)', s1.modifie === true && s1.ajoutes === 1);
t('run 1 : 3 événements (1 presse corroboré + 2 voix)', s1.items === 3, JSON.stringify(s1.items));
t('run 1 : reseaux.items = 3 (2 voix + 1 raccroché)', s1.reseaux && s1.reseaux.items === 3);
t('run 1 : 1 raccroché (mention, pas un média de plus)', s1.reseaux.raccroches === 1);
t('run 1 : aucun échec réseaux', Array.isArray(s1.reseaux.echecs) && s1.reseaux.echecs.length === 0);
t('run 1 : aucun échec presse', Array.isArray(s1.echecs) && s1.echecs.length === 0);
t('run 1 : 1 fait corroboré versé', s1.faits === 1);
t('run 1 : le paragraphe rejoint le chapitre épinglé (18.json)', s1.fichier === 'data/etudiants/chapitres/18.json' && s1.nouveauChapitre === false);

const par1 = dernierParagraphe(A.REPO, s1);
t('paragraphe : badge auto (c18p5)', par1.id === 'c18p5' && par1.auto === true);
t('paragraphe : événement presse corrobore a 2 medias (le post Reddit ne compte pas)',
  par1.texte.includes('2 medias : 20 minutes, franceinfo') && !par1.texte.includes('3 medias'));
t('paragraphe : mention « repris aussi sur r/enseignants »', par1.texte.includes('repris aussi sur r/enseignants'));
t('paragraphe : volet voix avec les items Reddit',
  par1.texte.includes('(Reddit — r/etudiants)') && par1.texte.includes('(Reddit — r/enseignants)'));
t('paragraphe : hors-sujet exclu (ramen)', !par1.texte.includes('Ramen') && !par1.texte.includes('ramen'));
t('paragraphe : hors-fenêtre exclu (givraine)', !par1.texte.includes('Givraine') && !par1.texte.includes('givraine'));
t('paragraphe : clôture mentionne les fils Reddit', par1.texte.includes('fils Reddit'));

const lycA = JSON.parse(fs.readFileSync(path.join(A.REPO, 'data', 'lyceens.json'), 'utf8'));
t('lyceens.json : le fait versé est l événement presse', /Louis-le-Grand/.test(lycA.faits[0].titre || ''));
t('lyceens.json : aucun fait titre Reddit', !lycA.faits.some(f => /raconte ma journée|salle des profs/.test(f.titre || '')));
t('lyceens.json : cap 10 conservé', lycA.faits.length === 10);

const idxA = JSON.parse(fs.readFileSync(path.join(A.REPO, 'data', 'etudiants', 'index.json'), 'utf8'));
t('index : releveSigs a 3 signatures', idxA.releveSigs.length === 3);
t('index : la signature de l événement presse embarque la mention réseau',
  idxA.releveSigs.some(s => s.includes('Reddit — r/enseignants')));
const chapA = JSON.parse(fs.readFileSync(path.join(A.REPO, 'data', 'etudiants', 'chapitres', '18.json'), 'utf8'));
t('chapitre 18 : 5 paragraphes après ajout', chapA.paragraphes.length === 5);

/* —————— Scénario B : idempotence —————— */
console.log('— scenario B : idempotence (un second run identique ne publie rien)');
const s2 = runEtu(A.REPO, 'a');
t('run 2 : idempotent (modifie: false, 0 ajout)', s2.modifie === false && s2.ajoutes === 0);
t('run 2 : compte réseaux présent même a l identique', s2.reseaux && s2.reseaux.items === 3 && s2.reseaux.raccroches === 1);
const chapB = JSON.parse(fs.readFileSync(path.join(A.REPO, 'data', 'etudiants', 'chapitres', '18.json'), 'utf8'));
t('run 2 : chapitre 18 inchangé (toujours 5 paragraphes)', chapB.paragraphes.length === 5);

/* —————— Scénario C : échec Reddit 429 SILENCIEUX —————— */
console.log('— scenario C : échec Reddit 429 silencieux (le relevé presse est publié quand même)');
const C = preparerCopie();
epinglerJour(C.REPO);
ecrireFixtures(C.REPO, 'c',
  'f.ajouterFixture(' + JSON.stringify(P_20M) + ', f.rss(' + JSON.stringify([
    { titre: 'Lyceens : blocus au lycée Henri-IV apres les vacances', desc: 'Un signalement isolé, une seule source.', ageH: 2 }
  ]) + '));\n' +
  'f.ajouterFixture(' + JSON.stringify(P_FTV) + ', f.rss([]));\n' +
  'f.ajouterEchec(' + JSON.stringify(U_ETU) + ', 429);\n' +
  'f.ajouterFixture(' + JSON.stringify(U_ENS) + ', f.atom([]));\n' +
  'f.ajouterFixture(' + JSON.stringify(U_FR) + ', f.atom([]));\n' +
  AUTRES_PRESSE.map(u => 'f.ajouterFixture(' + JSON.stringify(u) + ', f.rss([]));').join('\n'));
const s3 = runEtu(C.REPO, 'c');
t('429 : le relevé presse est publié (modifie: true)', s3.modifie === true && s3.ajoutes === 1);
t('429 : échec consigné SILENCIEEUX dans reseaux.echecs (429, retry 4 s inclus)',
  s3.reseaux && s3.reseaux.echecs.length === 1 && /429/.test(s3.reseaux.echecs[0]));
t('429 : la presse n est ni bloquée ni réduite (1 item, 0 fait, 0 réseau)', s3.items === 1 && s3.faits === 0 && s3.reseaux.items === 0);
t('429 : aucune erreur presse', Array.isArray(s3.echecs) && s3.echecs.length === 0);
const par3 = dernierParagraphe(C.REPO, s3);
t('429 : le paragraphe rend compte du titre presse', /Henri-IV/.test(par3.texte));

/* —————— Scénario D : cap réseaux (6 posts valides -> 4 retenus) —————— */
console.log('— scenario D : cap réseaux (6 posts Reddit valides -> 4 retenus)');
const D = preparerCopie();
epinglerJour(D.REPO);
ecrireFixtures(D.REPO, 'd',
  'f.ajouterFixture(' + JSON.stringify(P_20M) + ', f.rss(' + JSON.stringify([
    { titre: 'Lyceens : nouveau blocus au lycée Henri-IV signale', desc: 'Une seule source presse.', ageH: 2 }
  ]) + '));\n' +
  'f.ajouterFixture(' + JSON.stringify(P_FTV) + ', f.rss([]));\n' +
  'f.ajouterFixture(' + JSON.stringify(U_ETU) + ', f.atom(' + JSON.stringify([
    { titre: 'Etudiant en blocus : notre occupation filmée sur Snapchat', desc: 'd1', ageH: 1 },
    { titre: 'Je suis professeur, je fais cours malgré le blocus', desc: 'd2', ageH: 2 },
    { titre: 'Snapchat : la journée de blocus d un lycéen, image par image', desc: 'd3', ageH: 3 },
    /* NB : estMouvement (lot 1) est sensible aux accents — /etudiant/ ne matche
     * pas « étudiants » ; ce titre garde « blocus » comme mot-clé. */
    { titre: 'Instagram : les stories du blocus étudiant à la fac', desc: 'd4', ageH: 4 },
    { titre: 'Etudiant : notre cinquieme nuit de blocus racontée en direct', desc: 'd5', ageH: 5 },
    { titre: 'Etudiant : la sixieme semaine de blocus racontée en detail', desc: 'd6', ageH: 6 }
  ]) + '));\n' +
  'f.ajouterFixture(' + JSON.stringify(U_ENS) + ', f.atom([]));\n' +
  'f.ajouterFixture(' + JSON.stringify(U_FR) + ', f.atom([]));\n' +
  AUTRES_PRESSE.map(u => 'f.ajouterFixture(' + JSON.stringify(u) + ', f.rss([]));').join('\n'));
const s4 = runEtu(D.REPO, 'd');
t('cap : 4 items Reddit retenus sur 6', s4.reseaux && s4.reseaux.items === 4, JSON.stringify(s4.reseaux));
t('cap : aucun raccroché, aucun échec', s4.reseaux.raccroches === 0 && s4.reseaux.echecs.length === 0);
t('cap : 5 événements au total (1 presse + 4 voix)', s4.items === 5);
const par4 = dernierParagraphe(D.REPO, s4);
t('cap : exactement 4 items Reddit rendus dans le paragraphe', (par4.texte.match(/\(Reddit — /g) || []).length === 4);
t('cap : les 2 items au-delà du cap sont écartés (les plus anciens)',
  !par4.texte.includes('cinquieme') && !par4.texte.includes('sixieme'));

/* —————— Scénario E : nouveau jour, titre placeholder sans acte (v114) —————— */
console.log('— scenario E : nouveau jour -> chapitre titré « Le fil continue », sans acte');
const E = preparerCopie();
epinglerJour(E.REPO);
/* Le relevé précédent date de la veille (06/10) : le run (jour gelé 07/10)
 * doit créer le chapitre SUIVANT (numéro calculé dynamiquement) avec le titre
 * placeholder, PAS un « Acte V ». */
const numeroAvant = dernierNumero(E.REPO);
const numeroAttendu = numeroAvant + 1;
const ficE = 'data/etudiants/chapitres/' + String(numeroAttendu).padStart(2, '0') + '.json';
const idxEavant = JSON.parse(fs.readFileSync(path.join(E.REPO, 'data', 'etudiants', 'index.json'), 'utf8'));
idxEavant.chapitreJour = { ...idxEavant.chapitreJour, date: '06/10/2026' };
fs.writeFileSync(path.join(E.REPO, 'data', 'etudiants', 'index.json'), JSON.stringify(idxEavant, null, 2) + '\n');
ecrireFixtures(E.REPO, 'e',
  'f.ajouterFixture(' + JSON.stringify(P_20M) + ', f.rss(' + JSON.stringify([
    { titre: 'Lyceens : le blocus du lycée Condorcet se poursuit ce soir', desc: 'Une seule source presse pour ce signalement du soir.', ageH: 1 }
  ]) + '));\n' +
  'f.ajouterFixture(' + JSON.stringify(P_FTV) + ', f.rss([]));\n' + fixturesCreuses());
const s5 = runEtu(E.REPO, 'e');
t('jour nouveau : chapitre suivant créé, numero dynamique (nouveauChapitre: true)',
  s5.nouveauChapitre === true && s5.fichier === ficE, JSON.stringify({ attendu: ficE, eu: s5.fichier, numeroAvant }));
t('jour nouveau : relevé publié', s5.modifie === true && s5.ajoutes === 1);
const chapE = JSON.parse(fs.readFileSync(path.join(E.REPO, ficE), 'utf8'));
t('chapitre nouveau : titre placeholder « Le fil continue — 7 octobre 2026 »',
  chapE.titre === 'Le fil continue — 7 octobre 2026', chapE.titre);
t('chapitre nouveau : AUCUN « Acte » dans le titre', !/Acte/.test(chapE.titre));
const idxE = JSON.parse(fs.readFileSync(path.join(E.REPO, 'data', 'etudiants', 'index.json'), 'utf8'));
t('index : plus de champ prochainActe (v114)', !('prochainActe' in idxE));
t('index : entrée du nouveau chapitre titrée placeholder, chapitreJour du 07/10',
  idxE.chapitres.some(c => c.id === 'c' + numeroAttendu && c.titre === 'Le fil continue — 7 octobre 2026') &&
  idxE.chapitreJour.date === JOUR_GELE && idxE.chapitreJour.id === 'c' + numeroAttendu);

/* —————— Scénario F : ordre « chronologie d abord, transverses à la fin » (v115) —————— */
console.log('— scenario F : nouveau chapitre inséré AVANT les transverses (c10-c16)');
const F = preparerCopie();
epinglerJour(F.REPO);
/* Index épinglé : section chronique = partie chronologique (c1, c9, c18) puis
 * transverses (c10, c16) ; chapitreJour date d un autre jour que le jour gelé
 * pour forcer la création du chapitre suivant. */
const ficFidx = path.join(F.REPO, 'data', 'etudiants', 'index.json');
const idxF = JSON.parse(fs.readFileSync(ficFidx, 'utf8'));
const entree = id => {
  const e = idxF.chapitres.find(c => c.id === id);
  return e ? { ...e } : { id, fichier: 'chapitres/' + id.slice(1).padStart(2, '0') + '.json', periode: 'periode ' + id, titre: 'Titre ' + id, paragraphes: 1, octets: 100 };
};
const chronoAvant = [entree('c1'), entree('c9'), entree('c18')];
const transAvant = [entree('c10'), entree('c16')];
/* On épingle AUSSI index.chapitres (les 5 entrées ci-dessus) : la resync v115
 * met chaque partie à jour depuis index.chapitres — sans épinglage, tous les
 * chapitres réels du dépôt reviendraient dans la partie chronologique. */
idxF.chapitres = chronoAvant.concat(transAvant).map(e => ({ ...e }));
for (const sec of idxF.sections) {
  if (sec.id === 'chronique') sec.chapitres = chronoAvant.concat(transAvant);
}
idxF.chapitreJour = { id: 'c18', fichier: 'chapitres/18.json', date: '06/10/2026' };
fs.writeFileSync(ficFidx, JSON.stringify(idxF, null, 2) + '\n');
const numeroF = dernierNumero(F.REPO) + 1;
const nouveauId = 'c' + numeroF;
ecrireFixtures(F.REPO, 'f',
  'f.ajouterFixture(' + JSON.stringify(P_20M) + ', f.rss(' + JSON.stringify([
    { titre: 'Lyceens : le blocus du lycée Voltaire se poursuit ce soir', desc: 'Une seule source presse pour ce signalement du soir.', ageH: 1 }
  ]) + '));\n' +
  'f.ajouterFixture(' + JSON.stringify(P_FTV) + ', f.rss([]));\n' + fixturesCreuses());
const s6 = runEtu(F.REPO, 'f');
t('ordre : nouveau chapitre créé (nouveauChapitre: true)', s6.nouveauChapitre === true, JSON.stringify(s6));
const idxFapres = JSON.parse(fs.readFileSync(ficFidx, 'utf8'));
const chronoApres = idxFapres.sections.find(sec => sec.id === 'chronique').chapitres;
const ids = chronoApres.map(c => c.id);
const iNouveau = ids.indexOf(nouveauId);
const iC10 = ids.indexOf('c10');
t('ordre : le nouveau chapitre est DANS la section chronique', iNouveau !== -1, JSON.stringify(ids));
t('ordre : le nouveau chapitre est inséré AVANT c10 (fin de partie chronologique)',
  iNouveau !== -1 && iC10 !== -1 && iNouveau < iC10, JSON.stringify(ids));
t('ordre : les transverses restent en fin de liste (c10 et c16 derniers)',
  ids.indexOf('c10') === ids.length - 2 && ids.indexOf('c16') === ids.length - 1, JSON.stringify(ids));
t('ordre : partie chronologique préservée puis nouveau (c1, c9, c18, nouveau)',
  ids.join(',') === 'c1,c9,c18,' + nouveauId + ',c10,c16', JSON.stringify(ids));
t('ordre : ordre interne des transverses préservé (c10 puis c16)',
  ids.slice(-2).join(',') === 'c10,c16', JSON.stringify(ids));
t('ordre : index.chapitres contient l entrée du nouveau chapitre',
  idxFapres.chapitres.some(c => c.id === nouveauId));
t('ordre : chapitreJour actualisé (id du nouveau chapitre, jour gelé)',
  idxFapres.chapitreJour.id === nouveauId && idxFapres.chapitreJour.date === JOUR_GELE,
  JSON.stringify(idxFapres.chapitreJour));

/* —————— Nettoyage —————— */
for (const s of [A, C, D, E, F]) fs.rmSync(s.TMP, { recursive: true, force: true });
console.log('\n' + (ko === 0 ? 'LOT6 : ' + ok + ' tests OK' : 'LOT6 : ' + ko + ' ECHECS / ' + ok + ' OK'));
process.exit(ko === 0 ? 0 : 1);
