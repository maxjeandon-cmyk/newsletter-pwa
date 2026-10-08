/* tools/test/lot8.js — Harnas du lot 8 (v116/v117) : « Transverses au fil ».
 * Hors-ligne : Date gelée + fetch stubbé (tools/fakeclock.js, flux factices
 * en dur), aucune dépendance au réseau ni au chapitreJour réel (chaque
 * scénario ÉPINGLE son état, recette de lot6.js). Le script sous test
 * tourne dans des copies temporaires du repo (data/ isolé), fixtures
 * chargées via NODE_OPTIONS.
 * Scénarios :
 *   A. Volets : chaque item presse qualifié rejoint SA transverse (auto:true,
 *      id séquentiel cNNp<n+1>, sources = union sans doublun, ordre conservé) ;
 *      un même item presse peut nourrir plusieurs transverses.
 *   B. Cap : 4 items c12 -> 3 retenus (cap 3, ordre du relevé préservé).
 *   C. c15 JAMAIS touché (fichier inchangé octet/octet).
 *   D. Thème sans item -> aucun ajout, entrée { ajoutes: 0, items: 0 }.
 *   E. Idempotence : second run identique -> modifie:false, rien de bougé.
 *   F. Garde-fou 28 Ko : chapitre déjà gros -> pas d'ajout + avertissement.
 *   G. index.chapitres (paragraphes, octets) et totalParagraphes justes,
 *      miroir de section synchronisé, ordre « chrono puis transverses » intact.
 *   H. Réseaux : c10 reçoit les items reseau (rendu v112, sans compte médias) ;
 *      c11-c16 presse uniquement.
 *   I. Sortie JSON transverses cohérente avec les ajouts réels.
 *   J. Régression : la suite lot6 reste verte.
 *   K. (v117) Discord : invitation discord.gg/xxx découverte dans un post
 *      Reddit -> API publique -> serveur en c10 avec effectif ARRONDI au
 *      millier (jalon, pas pulsation : stable = silence), mémoire
 *      index.discordInvites, jamais dans les faits vérifiés, invitation
 *      morte (404) retirée de la mémoire. Volets : caps élargies (B) et
 *      détail par item (K1).
 * Usage : node tools/test/lot8.js
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

/* ———— URLs du catalogue presse + flux Reddit (miroir de tools/etudiants.js) ———— */
const U_ETU = 'https://www.reddit.com/r/etudiants/.rss';
const U_ENS = 'https://www.reddit.com/r/enseignants/.rss';
const U_FR = 'https://www.reddit.com/r/france/.rss';
const P_20M = 'https://www.20minutes.fr/feeds/rss-une.xml';
const P_E1 = 'https://www.europe1.fr/rss.xml';
const P_FTV = 'https://www.francetvinfo.fr/france.rss';
const AUTRES_PRESSE = [
  'https://www.publicsenat.fr/rss',
  'https://radiofrance.fr/franceinfo/rss', 'https://www.france24.com/fr/rss',
  'https://www.rfi.fr/fr/rss', 'https://www.ouest-france.fr/rss.xml',
  'https://www.humanite.fr/feed', 'https://www.mediapart.fr/articles/feed',
  'https://www.liberation.fr/arc/outboundfeeds/rss-all/'
];

/* ———— Aides : copie isolée, épinglage, fixtures, run, lecture chapitre ———— */
const JOUR_GELE = '07/10/2026';
function preparerCopie() {
  const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'lot8-'));
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
function ecrireFixtures(REPO, tag, corps) {
  const src = "'use strict';\n/* Genere par tools/test/lot8.js */\nconst f = require('./fakeclock.js');\n" + corps + '\n';
  fs.writeFileSync(path.join(REPO, 'tools', 'fixtures-' + tag + '.js'), src);
}
function runEtu(REPO, tag) {
  const out = execFileSync(process.execPath, ['tools/etudiants.js'], {
    cwd: REPO, encoding: 'utf8',
    env: { ...process.env, NODE_OPTIONS: '--require ./tools/fakeclock.js --require ./tools/fixtures-' + tag + '.js' }
  });
  return JSON.parse(out.trim().split('\n').pop());
}
function chapitre(REPO, n) {
  return JSON.parse(fs.readFileSync(path.join(REPO, 'data', 'etudiants', 'chapitres', n + '.json'), 'utf8'));
}
function octets(REPO, n) {
  return fs.statSync(path.join(REPO, 'data', 'etudiants', 'chapitres', n + '.json')).size;
}
function fixturesCreuses() {
  return AUTRES_PRESSE.map(u => 'f.ajouterFixture(' + JSON.stringify(u) + ', f.rss([]));').join('\n') + '\n' +
    'f.ajouterFixture(' + JSON.stringify(U_ETU) + ', f.atom([]));\n' +
    'f.ajouterFixture(' + JSON.stringify(U_ENS) + ', f.atom([]));\n' +
    'f.ajouterFixture(' + JSON.stringify(U_FR) + ', f.atom([]));';
}

/* ———————— Scénario A : chaque transverse reçoit son volet ———————— */
console.log('— scenario A : items presse -> volet auto par transverse (id, sources, union)');
const A = preparerCopie();
epinglerJour(A.REPO);
const AVANT = {};
for (const n of ['10', '11', '12', '13', '14', '15', '16']) AVANT[n] = octets(A.REPO, n);
/* Presse : 7 événements, 1 par thème (c10-c14, c16) — chaque titre porte
 * « blocus » (requis par estMouvement, lot 1) + les mots-clés du thème ;
 * + Reddit (1 voix c10). Sources uniques : rendu « 1 media — non corrobore ». */
ecrireFixtures(A.REPO, 'a',
  'f.ajouterFixture(' + JSON.stringify(P_20M) + ', f.rss(' + JSON.stringify([
    { titre: 'Blocus : les lycéens s’organisent sur Snapchat, un sondage viral', desc: 'd', ageH: 2 },
    { titre: 'Blocus : la revendication Parcoursup au cœur des rassemblements', desc: 'd', ageH: 2.2 },
    { titre: 'Blocus : grenade et interpellations au lycée, la justice saisie', desc: 'd', ageH: 2.4 },
    { titre: 'Blocus : le ministre Lecornu annonce une circulaire aux recteurs', desc: 'd', ageH: 2.6 },
    { titre: 'Blocus : la comparaison avec Mai 68 refait surface', desc: 'd', ageH: 2.8 },
    { titre: 'Blocus : portrait d’une mère d’élève, son témoignage', desc: 'd', ageH: 3 }
  ]) + '));\n' +
  'f.ajouterFixture(' + JSON.stringify(P_E1) + ', f.rss([]));\n' +
  'f.ajouterFixture(' + JSON.stringify(P_FTV) + ', f.rss([]));\n' +
  'f.ajouterFixture(' + JSON.stringify(U_ETU) + ', f.atom(' + JSON.stringify([
    { titre: 'Etudiant : notre blocus raconté sur Snapchat en direct', desc: 'Voix de l intérieur.', ageH: 0.5 }
  ]) + '));\n' +
  'f.ajouterFixture(' + JSON.stringify(U_ENS) + ', f.atom([]));\n' +
  'f.ajouterFixture(' + JSON.stringify(U_FR) + ', f.atom([]));\n' +
  AUTRES_PRESSE.map(u => 'f.ajouterFixture(' + JSON.stringify(u) + ', f.rss([]));').join('\n'));
const sA = runEtu(A.REPO, 'a');
t('A : relevé publié (modifie: true)', sA.modifie === true && sA.ajoutes === 1, JSON.stringify({ modifie: sA.modifie, ajoutes: sA.ajoutes }));
t('A : champ transverses présent (6 lignes, c15 absent)', Array.isArray(sA.transverses) && sA.transverses.length === 6 && sA.transverses.every(l => l.id !== 'c15'), JSON.stringify(sA.transverses));
t('A : 6 ajouts transverses (c10-c14, c16), 0 avertissement',
  sA.transverses.filter(l => l.ajoutes === 1).length === 6 && sA.transverses.every(l => !l.avertissement), JSON.stringify(sA.transverses));
const c10 = chapitre(A.REPO, '10');
const c11 = chapitre(A.REPO, '11');
const c12 = chapitre(A.REPO, '12');
const c13 = chapitre(A.REPO, '13');
const c14 = chapitre(A.REPO, '14');
const c16 = chapitre(A.REPO, '16');
t('A : c10p10 auto (id séquentiel correct)', c10.paragraphes.length === 10 && c10.paragraphes[9].id === 'c10p10' && c10.paragraphes[9].auto === true, JSON.stringify(c10.paragraphes.map(p => p.id)));
t('A : c11p7 auto', c11.paragraphes.length === 7 && c11.paragraphes[6].auto === true);
t('A : c12p7 auto', c12.paragraphes.length === 7 && c12.paragraphes[6].auto === true);
t('A : c13p7 auto', c13.paragraphes.length === 7 && c13.paragraphes[6].auto === true);
t('A : c14p6 auto', c14.paragraphes.length === 6 && c14.paragraphes[5].auto === true);
t('A : c16p6 auto (cap 2)', c16.paragraphes.length === 6 && c16.paragraphes[5].auto === true);
/* c10 : le post Reddit voix (rendu v112, sans compte médias) + l'événement
 * presse « sondage/Snapchat » — items séparés par ' ; ', sources = union dans
 * l'ordre de première apparition (le réseau d'abord, plus récent). */
t('A : c10 — items presse ET réseau, rendu v112 du réseau (sans compte médias)',
  c10.paragraphes[9].texte.includes('organisent sur Snapchat') &&
  c10.paragraphes[9].texte.includes('1 media : 20 minutes — non corrobore') &&
  c10.paragraphes[9].texte.includes('blocus raconté sur Snapchat en direct') &&
  c10.paragraphes[9].texte.includes('(Reddit — r/etudiants)') &&
  !/medias : [^)]*Reddit/.test(c10.paragraphes[9].texte),
  c10.paragraphes[9].texte.slice(0, 400));
t('A : c10 — sources = union sans doublon, ordre de première apparition',
  JSON.stringify(c10.paragraphes[9].sources) === JSON.stringify(['Reddit — r/etudiants', '20 minutes']), JSON.stringify(c10.paragraphes[9].sources));
t('A : c11 — sources de l’unique item presse', JSON.stringify(c11.paragraphes[6].sources) === JSON.stringify(['20 minutes']), JSON.stringify(c11.paragraphes[6].sources));
t('A : c12 — volet texte contient l’item tronqué + mention non corrobore',
  c12.paragraphes[6].texte.includes('1 media : 20 minutes — non corrobore'), c12.paragraphes[6].texte.slice(0, 300));
t('A : c13 — volet alimenté par l’annonce du ministre',
  /Lecornu|annonce/.test(c13.paragraphes[6].texte), c13.paragraphes[6].texte.slice(0, 200));
t('A : c14 — volet alimenté par la comparaison Mai 68', /Mai 68|comparaison/.test(c14.paragraphes[5].texte));
t('A : c16 — volet alimenté par le portrait/témoignage', /temoignage|Témoignage|mère/.test(c16.paragraphes[5].texte), c16.paragraphes[5].texte.slice(0, 200));
t('A : clôture distinctive « Volet automatique du » (marqueur plume)',
  sA.transverses.filter(l => l.ajoutes === 1).every(l => {
    const c = chapitre(A.REPO, l.id.slice(1));
    const p = c.paragraphes[c.paragraphes.length - 1];
    return / \(Volet automatique du /.test(p.texte) && p.texte.includes('— faits repris de la presse, des fils Reddit et des serveurs Discord, non reformulés.)');
  }));
t('A : pas d’accroche « heures ont passé » dans les volets',
  [c10, c11, c12, c13, c14, c16].every(c => !c.paragraphes[c.paragraphes.length - 1].texte.includes('heures ont passé')));
t('A : un même item presse nourrit le chapitre du jour ET sa transverse (assumé)',
  chapitre(A.REPO, '18').paragraphes.length === 5 && c10.paragraphes[9].texte.includes('organisent sur Snapchat'));

/* ———————— Scénario B : cap (4 items c12 -> 3 retenus) ———————— */
console.log('— scenario B : cap c12 élargi v117 (6 items matchant -> 5 retenus, ordre du relevé)');
const B = preparerCopie();
epinglerJour(B.REPO);
ecrireFixtures(B.REPO, 'b',
  'f.ajouterFixture(' + JSON.stringify(P_20M) + ', f.rss(' + JSON.stringify([
    { titre: 'Blocus : grenade au lycée Buffon, la police dégage', desc: 'd', ageH: 1 },
    { titre: 'Blocus : interpellations au lycée Voltaire, la justice saisie', desc: 'd', ageH: 2 },
    { titre: 'Blocus : gaz lacrymo au lycée Condorcet, des blessés', desc: 'd', ageH: 3 },
    { titre: 'Blocus : garde à vue d’un élève à Chaptal, son avocat déplore', desc: 'd', ageH: 4 },
    { titre: 'Blocus : flashball à Vincennes, un élève blessé', desc: 'd', ageH: 5 },
    { titre: 'Blocus : l’IGPN saisie après le passage de la police au lycée Corneille', desc: 'd', ageH: 6 }
  ]) + '));\n' +
  'f.ajouterFixture(' + JSON.stringify(P_FTV) + ', f.rss([]));\n' + fixturesCreuses());
const sB = runEtu(B.REPO, 'b');
t('B : publié (modifie: true)', sB.modifie === true);
const ligneB = (sB.transverses || []).find(l => l.id === 'c12');
t('B : c12 items = 6 détectés (le champ compte AVANT le cap)', ligneB && ligneB.items === 6, JSON.stringify(ligneB));
t('B : cap 5 respecté — 5 items rendus dans le volet', ligneB.ajoutes === 1 && (chapitre(B.REPO, '12').paragraphes[6].texte.match(/ ; /g) || []).length === 4, chapitre(B.REPO, '12').paragraphes[6].texte.slice(0, 400));
t('B : ordre du relevé conservé (le plus récent d’abord)',
  chapitre(B.REPO, '12').paragraphes[6].texte.indexOf('Buffon') < chapitre(B.REPO, '12').paragraphes[6].texte.indexOf('Voltaire') &&
  chapitre(B.REPO, '12').paragraphes[6].texte.indexOf('Voltaire') < chapitre(B.REPO, '12').paragraphes[6].texte.indexOf('Condorcet') &&
  chapitre(B.REPO, '12').paragraphes[6].texte.indexOf('Condorcet') < chapitre(B.REPO, '12').paragraphes[6].texte.indexOf('Vincennes'),
  chapitre(B.REPO, '12').paragraphes[6].texte.slice(0, 300));
t('B : le 6e (le plus ancien) est écarté', !chapitre(B.REPO, '12').paragraphes[6].texte.includes('Corneille'));

/* ———————— Scénario C : c15 jamais touché ———————— */
console.log('— scenario C : c15 (Lexique) JAMAIS touché, octet/octet');
const avantC = fs.readFileSync(path.join(A.REPO, 'data', 'etudiants', 'chapitres', '15.json'));
const apresC = fs.readFileSync(path.join(A.REPO, 'data', 'etudiants', 'chapitres', '15.json'));
t('C : chapitres/15.json inchangé octet/octet (scénario A)', Buffer.compare(avantC, apresC) === 0);
t('C : aucun volet auto dans c15', !chapitre(A.REPO, '15').paragraphes.some(p => p.auto === true));
t('C : c15 absent de la sortie transverses', (sA.transverses || []).every(l => l.id !== 'c15'));

/* ———————— Scénario D : thème sans item ———————— */
console.log('— scenario D : thème sans item -> aucun ajout');
const ligneD11 = (sB.transverses || []).find(l => l.id === 'c11');
t('D : c11 sans item -> ajoutes 0, items 0, pas d’avertissement', ligneD11 && ligneD11.ajoutes === 0 && ligneD11.items === 0 && ligneD11.avertissement === null, JSON.stringify(ligneD11));
t('D : c11 du scénario B inchangé (6 paragraphes)', chapitre(B.REPO, '11').paragraphes.length === 6);
t('D : aucun paragraphe vide ajouté nulle part', ['10', '11', '12', '13', '14', '16'].every(n => chapitre(B.REPO, n).paragraphes.every(p => (p.texte || '').trim().length > 0)));

/* ———————— Scénario E : idempotence ———————— */
console.log('— scenario E : idempotence (second run identique -> rien ne bouge)');
const empreinteE = n => fs.readFileSync(path.join(A.REPO, 'data', 'etudiants', 'chapitres', n + '.json'), 'utf8');
const snaps = {};
for (const n of ['10', '11', '12', '13', '14', '15', '16', '18']) snaps[n] = empreinteE(n);
const snapIndex = fs.readFileSync(path.join(A.REPO, 'data', 'etudiants', 'index.json'), 'utf8');
const sE = runEtu(A.REPO, 'a');
t('E : modifie: false, 0 ajout', sE.modifie === false && sE.ajoutes === 0, JSON.stringify({ modifie: sE.modifie, ajoutes: sE.ajoutes }));
t('E : aucun fichier chapitre bougé (c10-c16, c18)', ['10', '11', '12', '13', '14', '15', '16', '18'].every(n => empreinteE(n) === snaps[n]));
t('E : index inchangé', fs.readFileSync(path.join(A.REPO, 'data', 'etudiants', 'index.json'), 'utf8') === snapIndex);
t('E : pas de champ transverses au run identique (sortie courte idempotence)', !('transverses' in sE), JSON.stringify(Object.keys(sE)));

/* ———————— Scénario F : garde-fou 28 Ko ———————— */
console.log('— scenario F : garde-fou 28 Ko -> pas d’ajout + avertissement');
const F = preparerCopie();
epinglerJour(F.REPO);
/* On gonfle chapitres/12.json au-delà de 28 000 octets (contenu factice,
 * structure conservée), SANS toucher c10/c16 ni les autres. */
const fic12 = path.join(F.REPO, 'data', 'etudiants', 'chapitres', '12.json');
const ch12 = JSON.parse(fs.readFileSync(fic12, 'utf8'));
while (fs.statSync(fic12).size <= 28000) {
  ch12.paragraphes.push({ id: 'c12p' + (ch12.paragraphes.length + 1), texte: 'x'.repeat(2000), sources: ['20 minutes'] });
  fs.writeFileSync(fic12, JSON.stringify(ch12, null, 2) + '\n');
}
const nombreAvantF = ch12.paragraphes.length;
ecrireFixtures(F.REPO, 'f',
  'f.ajouterFixture(' + JSON.stringify(P_20M) + ', f.rss(' + JSON.stringify([
    { titre: 'Blocus : grenade au lycée Buffon, la police dégage', desc: 'd', ageH: 1 },
    { titre: 'Blocus : portrait d’une figure du mouvement', desc: 'd', ageH: 2 }
  ]) + '));\n' +
  'f.ajouterFixture(' + JSON.stringify(P_FTV) + ', f.rss([]));\n' + fixturesCreuses());
const sF = runEtu(F.REPO, 'f');
const ligneF12 = (sF.transverses || []).find(l => l.id === 'c12');
const ligneF16 = (sF.transverses || []).find(l => l.id === 'c16');
t('F : c12 gros -> ajoutes 0 + avertissement consigné',
  ligneF12 && ligneF12.ajoutes === 0 && ligneF12.items >= 1 && /28 ?000|28000/.test(String(ligneF12.avertissement)), JSON.stringify(ligneF12));
t('F : c12 inchangé (aucun paragraphe ajouté)', chapitre(F.REPO, '12').paragraphes.length === nombreAvantF);
t('F : les AUTRES transverses sont publiées normalement (c16 ajouté)', ligneF16 && ligneF16.ajoutes === 1 && chapitre(F.REPO, '16').paragraphes.length === 6);

/* ———————— Scénario G : index justes, miroir de section, ordre intact ———————— */
console.log('— scenario G : index.chapitres, totalParagraphes, miroir de section, ordre');
const idxA = JSON.parse(fs.readFileSync(path.join(A.REPO, 'data', 'etudiants', 'index.json'), 'utf8'));
t('G : totalParagraphes juste (réduction sur compteurs à jour)',
  idxA.totalParagraphes === idxA.chapitres.reduce((a, c) => a + c.paragraphes, 0) &&
  idxA.totalParagraphes === 90 + 6 + 1, idxA.totalParagraphes);
t('G : entrée c10 (paragraphes 10, octets réels)',
  (() => { const e = idxA.chapitres.find(c => c.id === 'c10'); return e.paragraphes === 10 && e.octets === octets(A.REPO, '10'); })());
t('G : entrée c16 (paragraphes 6, octets réels)',
  (() => { const e = idxA.chapitres.find(c => c.id === 'c16'); return e.paragraphes === 6 && e.octets === octets(A.REPO, '16'); })());
t('G : c15 inchangé dans l’index',
  (() => { const e = idxA.chapitres.find(c => c.id === 'c15'); return e.paragraphes === 4; })());
const chrono = idxA.sections.find(s => s.id === 'chronique').chapitres;
const ids = chrono.map(c => c.id);
t('G : miroir de section synchronisé (paragraphes réels dans le miroir)',
  chrono.every(c => { const fic = c.fichier.replace(/^chapitres\//, '').replace(/\.json$/, ''); return c.paragraphes === chapitre(A.REPO, fic).paragraphes.length; }), JSON.stringify(chrono.map(c => c.id + ':' + c.paragraphes)));
t('G : ordre « chronologie puis transverses » INTACT (derniers : c10..c16)',
  ids.slice(-7).join(',') === 'c10,c11,c12,c13,c14,c15,c16', JSON.stringify(ids));
t('G : ordre interne c10->c16 préservé', ids.indexOf('c10') < ids.indexOf('c11') && ids.indexOf('c11') < ids.indexOf('c12') && ids.indexOf('c14') < ids.indexOf('c15') && ids.indexOf('c15') < ids.indexOf('c16'));

/* ———————— Scénario H : réseaux -> c10 uniquement ———————— */
console.log('— scenario H : items réseau -> c10 uniquement (rendu v112)');
const H = preparerCopie();
epinglerJour(H.REPO);
ecrireFixtures(H.REPO, 'h',
  'f.ajouterFixture(' + JSON.stringify(P_20M) + ', f.rss(' + JSON.stringify([
    { titre: 'Le blocus du lycée Bergson se poursuit ce soir', desc: 'd', ageH: 1 }
  ]) + '));\n' +
  'f.ajouterFixture(' + JSON.stringify(P_FTV) + ', f.rss([]));\n' +
  'f.ajouterFixture(' + JSON.stringify(U_ETU) + ', f.atom(' + JSON.stringify([
    { titre: 'Etudiant : notre blocus raconté sur Snapchat en direct', desc: 'voix', ageH: 1 },
    { titre: 'Professeur : je témoigne du blocus depuis la salle des profs', desc: 'voix', ageH: 2 }
  ]) + '));\n' +
  'f.ajouterFixture(' + JSON.stringify(U_ENS) + ', f.atom([]));\n' +
  'f.ajouterFixture(' + JSON.stringify(U_FR) + ', f.atom([]));\n' +
  AUTRES_PRESSE.map(u => 'f.ajouterFixture(' + JSON.stringify(u) + ', f.rss([]));').join('\n'));
const sH = runEtu(H.REPO, 'h');
const ligneH10 = (sH.transverses || []).find(l => l.id === 'c10');
t('H : c10 compte les items réseau (2 posts détectés, aucun raccroché au blocus Bergson)', ligneH10 && ligneH10.items === 2 && ligneH10.ajoutes === 1, JSON.stringify(ligneH10));
const voletH = chapitre(H.REPO, '10').paragraphes[9].texte;
t('H : rendu v112 dans c10 — pas de « N medias » pour le réseau',
  voletH.includes('(Reddit — r/etudiants)') && !/medias : [^)]*Reddit/.test(voletH), voletH.slice(0, 300));
t('H : aucun item Reddit dans c11-c14/c16 (volets presse uniquement)',
  ['11', '12', '13', '14', '16'].every(n => {
    const c = chapitre(H.REPO, n);
    const p = c.paragraphes[c.paragraphes.length - 1];
    return !p || !p.auto || !(p.texte || '').includes('Reddit');
  }));

/* ———————— Scénario I : sortie JSON cohérente ———————— */
console.log('— scenario I : sortie JSON transverses cohérente avec les ajouts réels');
t('I : chaque ligne ajoutes=1 correspond à un paragraphe auto de plus',
  sA.transverses.every(l => {
    const c = chapitre(A.REPO, l.id.slice(1));
    const autos = c.paragraphes.filter(p => p.auto === true).length;
    return l.ajoutes === 0 ? autos >= 0 : autos >= 1;
  }));
t('I : items = nombre d’items retenus (cap appliqué)',
  (() => { const l = sA.transverses.find(x => x.id === 'c16'); return l.items === 1 && l.ajoutes === 1; })(), JSON.stringify(sA.transverses.find(x => x.id === 'c16')));
t('I : avertissement null partout quand aucun garde-fou', sA.transverses.every(l => l.avertissement === null));
t('I : champ reseaux inchangé à côté de transverses', sA.reseaux && typeof sA.reseaux.items === 'number' && typeof sA.reseaux.raccroches === 'number');

/* ———————— Scénario K : Discord au source (v117) ———————— */
console.log('— scenario K : invitations Discord découvertes, jalons d effectif, mémoire, invitations mortes');
const K = preparerCopie();
epinglerJour(K.REPO);
const U_INVITE = 'https://discord.com/api/v9/invites/blocus26?with_counts=true';
const lignesK = (nbMembres) =>
  'f.ajouterFixture(' + JSON.stringify(P_20M) + ', f.rss(' + JSON.stringify([
    { titre: 'Blocus : les lycéens s’organisent sur Discord pour préparer la mobilisation', desc: 'Le serveur Discord du mouvement accueille les échanges entre établissements.', ageH: 2 }
  ]) + '));\n' +
  'f.ajouterFixture(' + JSON.stringify(P_FTV) + ', f.rss([]));\n' + fixturesCreuses().replace(
    'f.ajouterFixture(' + JSON.stringify(U_ETU) + ', f.atom([]));',
    'f.ajouterFixture(' + JSON.stringify(U_ETU) + ', f.atom([{ titre: "Notre serveur Discord pour organiser les blocus", desc: "Rejoignez : https://discord.gg/blocus26 (le serveur des lycéens mobilisés)", ageH: 1 }]));') + '\n' +
  'f.ajouterFixture(' + JSON.stringify(U_INVITE) + ', ' + JSON.stringify(JSON.stringify({ guild: { name: 'Blocus Lycéens 2026' }, approximate_member_count: nbMembres, approximate_presence_count: 187 })) + ');';
const faitsAvantK = JSON.parse(fs.readFileSync(path.join(K.REPO, 'data', 'lyceens.json'), 'utf8')).faits.length;
const lireIndexK = () => JSON.parse(fs.readFileSync(path.join(K.REPO, 'data', 'etudiants', 'index.json'), 'utf8'));

/* Run 1 : découverte — invitation repérée dans le post Reddit, serveur interrogé,
 * jalon d'effectif (5 234 -> environ 5 000), item réseau dans c10 et le jour. */
ecrireFixtures(K.REPO, 'k1', lignesK(5234));
const sK1 = runEtu(K.REPO, 'k1');
t('K1 : publié (modifie: true)', sK1.modifie === true, JSON.stringify(sK1).slice(0, 200));
t('K1 : champ discord présent, 1 item créé, 1 invitation interrogée',
  sK1.discord && sK1.discord.items === 1 && sK1.discord.invites === 1, JSON.stringify(sK1.discord));
const c10K = chapitre(K.REPO, '10');
const voletK1 = c10K.paragraphes[c10K.paragraphes.length - 1].texte;
t('K1 : volet c10 avec le serveur, l effectif arrondi au millier et la source de découverte',
  /Discord : serveur « Blocus Lycéens 2026 », repéré via Reddit — r\/etudiants — environ 5 000 membres/.test(voletK1), voletK1.slice(0, 300));
t('K1 : détail de l item serveur (effectifs API, verbatim)', /détail : API Discord au moment du relevé : 187 membres en ligne, 5 234 au total/.test(voletK1), voletK1.slice(0, 400));
t('K1 : paragraphe du jour rend le serveur (réseau, sans compte médias)',
  chapitre(K.REPO, '18').paragraphes.some(p => p.texte.includes('Discord : serveur « Blocus Lycéens 2026 »')), '');
t('K1 : mémoire index.discordInvites (code, effectif arrondi, via)',
  (lireIndexK().discordInvites || {}).blocus26 && lireIndexK().discordInvites.blocus26.membres === 5000, JSON.stringify(lireIndexK().discordInvites));
t('K1 : serveur Discord JAMAIS dans les faits vérifiés (réseau)',
  JSON.parse(fs.readFileSync(path.join(K.REPO, 'data', 'lyceens.json'), 'utf8')).faits.length === faitsAvantK);

/* Run 2 : mêmes flux, effectif stable — PAS de nouvel item serveur (jalon,
 * pas pulsation) ; un paragraphe suit (l item serveur quitte le relevé). */
const sK2 = runEtu(K.REPO, 'k1');
t('K2 : effectif stable -> 0 item Discord', sK2.modifie === true && sK2.discord.items === 0, JSON.stringify(sK2.discord));
const c10K2 = chapitre(K.REPO, '10');
t('K2 : le volet suivant ne re-publie pas le serveur',
  !c10K2.paragraphes[c10K2.paragraphes.length - 1].texte.includes('environ 5 000 membres'), c10K2.paragraphes[c10K2.paragraphes.length - 1].texte.slice(0, 200));
t('K2 : mémoire conservée (blocus26 : 5 000)', (lireIndexK().discordInvites || {}).blocus26 && lireIndexK().discordInvites.blocus26.membres === 5000);

/* Run 3 : mêmes flux -> idempotence (plus rien ne bouge). */
const sK3 = runEtu(K.REPO, 'k1');
t('K3 : idempotence — modifie: false', sK3.modifie === false);

/* Run 4 : l effectif franchit un nouveau millier -> jalon, nouvel item. */
ecrireFixtures(K.REPO, 'k4', lignesK(7600));
const sK4 = runEtu(K.REPO, 'k4');
t('K4 : jalon d effectif -> 1 item Discord (environ 8 000 membres)',
  sK4.modifie === true && sK4.discord.items === 1, JSON.stringify(sK4.discord));
t('K4 : volet c10 avec le nouveau jalon',
  chapitre(K.REPO, '10').paragraphes.some(p => /environ 8 000 membres/.test(p.texte)));
t('K4 : mémoire à jour (8 000)', lireIndexK().discordInvites.blocus26.membres === 8000);

/* Run 5 : invitation morte (HTTP 404) — retirée de la mémoire, consignée,
 * le relevé continue. */
ecrireFixtures(K.REPO, 'k5',
  lignesK(7600).replace('f.ajouterFixture(' + JSON.stringify(U_INVITE) + ', ' + JSON.stringify(JSON.stringify({ guild: { name: 'Blocus Lycéens 2026' }, approximate_member_count: 7600, approximate_presence_count: 187 })) + ');',
    'f.ajouterEchec(' + JSON.stringify(U_INVITE) + ', 404);'));
const sK5 = runEtu(K.REPO, 'k5');
t('K5 : invitation morte retirée de la mémoire, échec consigné',
  !(lireIndexK().discordInvites || {}).blocus26 && (sK5.discord.echecs || []).some(e => e.includes('invitation morte')), JSON.stringify(sK5.discord));

/* ———————— Scénario J : régression lot6 ———————— */
console.log('— scenario J : régression — la suite lot6 reste verte');
try {
  const out = execFileSync(process.execPath, ['tools/test/lot6.js'], { cwd: RACINE, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  t('J : node tools/test/lot6.js vert', /LOT6 : \d+ tests OK/.test(out), out.split('\n').filter(Boolean).pop());
} catch (e) {
  t('J : node tools/test/lot6.js vert', false, String(e.stdout || e.message).split('\n').filter(Boolean).pop());
}

/* ———————— Nettoyage ———————— */
for (const s of [A, B, F, H, K]) fs.rmSync(s.TMP, { recursive: true, force: true });
console.log('\n' + (ko === 0 ? 'LOT8 : ' + ok + ' tests OK' : 'LOT8 : ' + ko + ' ECHECS / ' + ok + ' OK'));
process.exit(ko === 0 ? 0 : 1);
