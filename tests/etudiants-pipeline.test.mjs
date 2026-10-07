/* tests/etudiants-pipeline.test.mjs — pipeline chronique « Version des
 * étudiants » (v38) : un chapitre par jour de suivi. Harnais jouant trois
 * runs simulés de tools/etudiants.js sur une COPIE de data/etudiants/ :
 *   1. run à un nouveau jour      → chapitre créé (« Acte V — … »), accroche
 *      « une nouvelle journée de suivi s'ouvre », entrées ajoutées dans la
 *      liste plate ET dans la section chronique ;
 *   2. run du même jour           → paragraphe ajouté au même chapitre, pas
 *      de nouveau fichier ;
 *   3. run aux items identiques   → modifie: false, aucun commit fantôme.
 * Vérifie aussi que sections.complement reste intact.
 * Lancement : node tests/etudiants-pipeline.test.mjs (Node >= 18). */

import { cpSync, mkdirSync, mkdtempSync, rmSync, readFileSync, writeFileSync, existsSync, readdirSync }
  from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';
import { lancerTests, assert } from './harnais.mjs';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const SCRIPT = join(RACINE, 'tools', 'etudiants.js');

/* ——— Harnais : copie du dossier data/etudiants + moisson simulée ——— */

const INDEX_REF = JSON.parse(readFileSync(join(RACINE, 'data', 'etudiants', 'index.json'), 'utf8'));

/* La moisson réelle n'est pas rejouable (RSS réseau) : on injecte des items
 * figés via le temp-dir. etudiants.js lit ses flux avec fetch — on remplace
 * donc les SOURCES par deux flux locaux servis depuis des fichiers. */
function preparerCopie() {
  const tmp = mkdtempSync(join(tmpdir(), 'etu-'));
  const etu = join(tmp, 'etudiants');
  cpSync(join(RACINE, 'data', 'etudiants'), etu, { recursive: true });
  /* releveDate vielli de 7 h : l ecart horaire tombe dans la branche standard
   * (garde-fous h <= 2 et h > 12 exclus) pour observer l accroche ciblee. */
  const idx = JSON.parse(readFileSync(join(etu, 'index.json'), 'utf8'));
  idx.releveDate = new Date(Date.now() - 7 * 3600 * 1000).toISOString();
  writeFileSync(join(etu, 'index.json'), JSON.stringify(idx));
  return { tmp, etu };
}

/* Items simulés : mêmes champs que la moisson (titre, desc, lien, date ISO,
 * source). Deux événements corroborés par deux médias distincts. */
const ITEMS_A = [
  { titre: 'Lycee bloque a Paris : la mobilisation des eleves continue', desc: 'Blocus lycéen', lien: 'https://a.example/1', date: new Date().toISOString(), source: '20 minutes' },
  { titre: 'La mobilisation lyceenne gagne du terrain, 400 etablissements bloques', desc: 'Mobilisation', lien: 'https://b.example/1', date: new Date().toISOString(), source: 'franceinfo' }
];
const ITEMS_B = [
  { titre: 'Le gouvernement repond aux lyceens : une annonce attendue ce soir', desc: 'Gouvernement', lien: 'https://a.example/2', date: new Date().toISOString(), source: 'Le Figaro' },
  { titre: 'Repression : des interpellations devant un lycee de Lyon', desc: 'Répression', lien: 'https://b.example/2', date: new Date().toISOString(), source: 'BFMTV' }
];

/* Écrit un fichier chapitre "flux" et patche le script copié pour :
 *   - lire la moisson depuis un fichier JSON (au lieu du réseau) ;
 *   - pointer DOSSIER/FICHIER_INDEX vers la copie ;
 *   - figer la date du jour (nouveau jour vs même jour). */
function ecrireScriptMoissonné(tmp, etu, items, dateJour, heureFake) {
  const itemsFic = join(tmp, 'items.json');
  writeFileSync(itemsFic, JSON.stringify(items));
  const src = readFileSync(SCRIPT, 'utf8');
  /* Points d'injection exacts du script d'origine (v38). */
  const patched = src
    .replace(
      "const DOSSIER = path.join(__dirname, '..', 'data', 'etudiants');",
      "const DOSSIER = " + JSON.stringify(etu) + ";")
    .replace(
      "const FICHIER_INDEX = path.join(DOSSIER, 'index.json');",
      "const FICHIER_INDEX = " + JSON.stringify(join(etu, 'index.json')) + ";")
    .replace(
      "const moissons = await Promise.all(SOURCES.map(s => moissonSource(s, depuis)));",
      `const ITEMS_MOISSON = JSON.parse(require('fs').readFileSync(${JSON.stringify(itemsFic)}, 'utf8'));
       const moissons = await Promise.all(ITEMS_MOISSON.map(it => Promise.resolve({ items: [it], erreur: null })));`)
    .replace(
      "const aujourdhui = new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris' }).format(new Date());",
      `const aujourdhui = ${JSON.stringify(dateJour)};`);
  const fic = join(tmp, 'etudiants-simule.js');
  writeFileSync(fic, patched);
  return fic;
}

/* Exécute un run simulé et renvoie { sortie, index, chapitres }. */
function run(tmp, etu, items, dateJour) {
  const fic = ecrireScriptMoissonné(tmp, etu, items, dateJour);
  const brut = execFileSync(process.execPath, [fic], { encoding: 'utf8' });
  const sortie = JSON.parse(brut);
  const index = JSON.parse(readFileSync(join(etu, 'index.json'), 'utf8'));
  const chapitres = readdirSync(join(etu, 'chapitres')).filter(f => /^\d+\.json$/.test(f)).sort();
  return { sortie, index, chapitres };
}

/* Patch pour lyceens.json : verserFaitsCorrobores écrit dans data/ réelle —
 * on le neutralise (retour 0) dans le script simulé. */
function neutraliserFaits(tmp, etu, items, dateJour) {
  const fic = ecrireScriptMoissonné(tmp, etu, items, dateJour);
  let src = readFileSync(fic, 'utf8');
  src = src.replace('async function verserFaitsCorrobores(uniques, journal) {',
    'async function verserFaitsCorrobores(uniques, journal) { return 0;');
  writeFileSync(fic, src);
  return fic;
}

function runSansFaits(tmp, etu, items, dateJour) {
  const fic = neutraliserFaits(tmp, etu, items, dateJour);
  const brut = execFileSync(process.execPath, [fic], { encoding: 'utf8' });
  const sortie = JSON.parse(brut);
  const index = JSON.parse(readFileSync(join(etu, 'index.json'), 'utf8'));
  const chapitres = readdirSync(join(etu, 'chapitres')).filter(f => /^\d+\.json$/.test(f)).sort();
  return { sortie, index, chapitres };
}

const AUJOURDHUI = new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris' }).format(new Date());
const JOUR_SUIVANT = (() => {
  const d = new Date(Date.now() + 24 * 3600 * 1000);
  return new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris' }).format(d);
})();

const tests = [
  { nom: '(1) nouveau jour : chapitre du jour cree, titre Acte, accroche ouverture, listes a jour',
    fn: () => {
      const { tmp, etu } = preparerCopie();
      try {
        const avant = readdirSync(join(etu, 'chapitres')).length;
        const r = runSansFaits(tmp, etu, ITEMS_A, JOUR_SUIVANT);
        assert(r.sortie.modifie === true, 'run modifie');
        assert(r.sortie.nouveauChapitre === true, 'nouveauChapitre=true');
        assert(r.sortie.chapitre === 'c18', 'id c18 (17 chapitres existants), obtenu ' + r.sortie.chapitre);
        assert(r.sortie.fichier === 'data/etudiants/chapitres/18.json', 'fichier 18.json');
        assert(existsSync(join(etu, 'chapitres', '18.json')), '18.json ecrit');
        const chap = JSON.parse(readFileSync(join(etu, 'chapitres', '18.json'), 'utf8'));
        assert(/^Acte V — /.test(chap.titre), 'titre Acte V — : ' + chap.titre);
        assert(chap.periode.includes(' — suivi de la journée'), 'periode suivi de la journée : ' + chap.periode);
        assert(chap.paragraphes.length === 1 && chap.paragraphes[0].auto === true, 'un paragraphe auto');
        assert(chap.paragraphes[0].texte.includes("une nouvelle journée de suivi s'ouvre"),
          'accroche ouverture d acte : ' + chap.paragraphes[0].texte.slice(0, 120));
        /* Liste plate + section chronique. */
        assert(r.index.chapitres.some(c => c.id === 'c18'), 'entree c18 dans la liste plate');
        const chrono = r.index.sections.find(s => s.id === 'chronique');
        assert(chrono.chapitres.some(c => c.id === 'c18'), 'entree c18 dans la section chronique');
        assert(chrono.chapitres[chrono.chapitres.length - 1].id === 'c18', 'c18 en fin de chronique');
        /* Memoire du jour + acte. */
        assert(r.index.chapitreJour && r.index.chapitreJour.date === JOUR_SUIVANT, 'chapitreJour.date');
        assert(r.index.prochainActe === 6, 'prochainActe incremente a 6, obtenu ' + r.index.prochainActe);
      } finally { rmSync(tmp, { recursive: true, force: true }); }
    } },

  { nom: '(2) meme jour : paragraphe ajoute au meme chapitre, pas de nouveau fichier',
    fn: () => {
      const { tmp, etu } = preparerCopie();
      try {
        const r1 = runSansFaits(tmp, etu, ITEMS_A, JOUR_SUIVANT);
        const r2 = runSansFaits(tmp, etu, ITEMS_B, JOUR_SUIVANT);
        assert(r2.sortie.nouveauChapitre === false, 'pas de nouveau chapitre le meme jour');
        assert(r2.sortie.chapitre === 'c18', 'meme chapitre c18');
        assert(r2.sortie.fichier === r1.sortie.fichier, 'meme fichier');
        const chap = JSON.parse(readFileSync(join(etu, 'chapitres', '18.json'), 'utf8'));
        assert(chap.paragraphes.length === 2, 'deux paragraphes cumules, obtenu ' + chap.paragraphes.length);
        assert(!chap.paragraphes[1].texte.includes("une nouvelle journée de suivi s'ouvre"),
          'accroche ouverture reservee au premier paragraphe du chapitre');
        assert(r2.index.totalParagraphes === INDEX_REF.totalParagraphes + 2, 'totalParagraphes +2');
        const entree = r2.index.chapitres.find(c => c.id === 'c18');
        assert(entree.paragraphes === 2, 'entree plate paragraphes=2');
      } finally { rmSync(tmp, { recursive: true, force: true }); }
    } },

  { nom: '(3) items identiques : modifie false, aucun commit fantome',
    fn: () => {
      const { tmp, etu } = preparerCopie();
      try {
        runSansFaits(tmp, etu, ITEMS_A, JOUR_SUIVANT);
        const avant = readFileSync(join(etu, 'index.json'), 'utf8');
        const r2 = runSansFaits(tmp, etu, ITEMS_A, JOUR_SUIVANT);
        assert(r2.sortie.modifie === false, 'modifie=false');
        assert(r2.sortie.ajoutes === 0, 'ajoutes=0');
        assert(readFileSync(join(etu, 'index.json'), 'utf8') === avant, 'index inchangé octet pour octet');
      } finally { rmSync(tmp, { recursive: true, force: true }); }
    } },

  { nom: 'sections.complement reste intact dans tous les cas',
    fn: () => {
      const { tmp, etu } = preparerCopie();
      try {
        const compAvant = JSON.stringify(INDEX_REF.sections.find(s => s.id === 'complement'));
        runSansFaits(tmp, etu, ITEMS_A, JOUR_SUIVANT);
        runSansFaits(tmp, etu, ITEMS_B, JOUR_SUIVANT);
        const idx = JSON.parse(readFileSync(join(etu, 'index.json'), 'utf8'));
        const compApres = JSON.stringify(idx.sections.find(s => s.id === 'complement'));
        assert(compAvant === compApres, 'section complement identique avant/apres');
      } finally { rmSync(tmp, { recursive: true, force: true }); }
    } },

  { nom: 'chaine narrative globale : releveCompteur continue d un jour a l autre',
    fn: () => {
      const { tmp, etu } = preparerCopie();
      try {
        const r1 = runSansFaits(tmp, etu, ITEMS_A, JOUR_SUIVANT);
        const ref = new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris' }).format(new Date(Date.now() + 48 * 3600 * 1000));
        const r2 = runSansFaits(tmp, etu, ITEMS_B, ref);
        assert(r2.sortie.nouveauChapitre === true, 'nouveau chapitre au jour suivant');
        assert(r2.sortie.chapitre === 'c19', 'id c19');
        assert(r2.index.releveCompteur === (INDEX_REF.releveCompteur || 0) + 2, 'releveCompteur global +2');
        assert(r2.index.prochainActe === 7, 'prochainActe 7 apres deux actes, obtenu ' + r2.index.prochainActe);
      } finally { rmSync(tmp, { recursive: true, force: true }); }
    } },

  { nom: 'index.json du depot : JSON valide, prochainActe pose',
    fn: () => {
      const idx = JSON.parse(readFileSync(join(RACINE, 'data', 'etudiants', 'index.json'), 'utf8'));
      assert(typeof idx.prochainActe === 'number', 'prochainActe numerique');
      assert(idx.prochainActe === 5, 'prochainActe=5 : le premier run cree Acte V, puis passe a 6 (etat du plan)');
      assert(Array.isArray(idx.sections) && idx.sections.length === 2, 'deux sections');
    } }
];

await lancerTests(tests, 'tests/etudiants-pipeline.test.mjs');
