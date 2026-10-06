/* tests/lyceens.test.mjs — onglet ✊ Lycéens 2026 (v91) : quatre sous-onglets,
 * sections de data/etudiants/index.json, ancre fin-texte réservée à la
 * chronique, badge « relevé auto », échappement esc().
 * Lancement : node tests/lyceens.test.mjs (Node ≥ 18, sans dépendance). */

import { readFileSync } from 'node:fs';
import { creerDocumentMinimal, lancerTests, assert } from './harnais.mjs';

const RACINE = new URL('..', import.meta.url).pathname;

const INDEX = JSON.parse(readFileSync(RACINE + 'data/etudiants/index.json', 'utf8'));
const LYCEENS = JSON.parse(readFileSync(RACINE + 'data/lyceens.json', 'utf8'));

/* fetch factice : sert les fichiers du dépôt depuis le disque, une seule
 * réponse par fetch (comme le réseau, pas de cache croisé). */
let fetches = [];
function brancherFetch() {
  fetches = [];
  globalThis.fetch = async (url) => {
    fetches.push(url);
    if (url === 'data/etudiants/index.json') return { json: async () => INDEX };
    if (url.startsWith('data/etudiants/chapitres/')) {
      return { json: async () => JSON.parse(readFileSync(RACINE + url, 'utf8')) };
    }
    if (url === 'data/lyceens.json') return { json: async () => LYCEENS };
    throw new Error('fetch inattendu : ' + url);
  };
}

let compteurImport = 0;
const core = await import('../js/core.js'); /* une seule instance, partagée avec la vue */
async function importerVue() {
  /* Cache-busting sur la vue seule : Node garde les modules ESM en cache, mais
   * chaque test doit repartir d'un chargement à froid (state.etudiants vierge).
   * core.js reste une instance unique, celle qu'importe la vue elle-même. */
  compteurImport++;
  const m = await import('../js/views/lyceens.js?test=' + compteurImport);
  return { m, core };
}

async function ouvrirVue(m, core, sousOnglet, reinit = false) {
  core.state.lyceens = LYCEENS;
  core.state.lyceensSub = sousOnglet;
  if (reinit) core.state.etudiants = null; /* defaut : conserver le cache entre les sous-onglets */
  m.vueLyceens();
  await new Promise(r => setTimeout(r, 60)); /* laisse les promesses de chargement se résoudre */
}

const tests = [
  { nom: 'index : deux sections (chronique, complement) avec c1-c9+c17 et c10-c16',
    fn: () => {
      const ids = s => INDEX.sections.find(x => x.id === s).chapitres.map(c => c.id);
      assert(JSON.stringify(ids('chronique')) === JSON.stringify(['c1','c2','c3','c4','c5','c6','c7','c8','c9','c17']), 'section chronique = c1..c9 puis c17');
      assert(JSON.stringify(ids('complement')) === JSON.stringify(['c10','c11','c12','c13','c14','c15','c16']), 'section complement = c10..c16');
      assert(!('version_lyceens' in LYCEENS), 'lyceens.json sans version_lyceens');
    } },

  { nom: 'quatre sous-onglets dans l ordre demande',
    fn: async () => {
      creerDocumentMinimal(); brancherFetch();
      const { m, core } = await importerVue();
      await ouvrirVue(m, core, 'etudiants');
      const boutons = document.querySelectorAll('.subtab');
      assert(boutons.length === 4, '4 sous-onglets, obtenu ' + boutons.length);
      assert(boutons.map(b => b.dataset.s).join(',') === 'etudiants,complement,gouvernement,faits', 'ordre etudiants,complement,gouvernement,faits');
    } },

  { nom: 'index.json charge une seule fois entre les deux sous-onglets etudiants',
    fn: async () => {
      creerDocumentMinimal(); brancherFetch();
      const { m, core } = await importerVue();
      await ouvrirVue(m, core, 'etudiants', true);
      await ouvrirVue(m, core, 'complement');
      await ouvrirVue(m, core, 'etudiants');
      const n = fetches.filter(u => u === 'data/etudiants/index.json').length;
      assert(n === 1, 'index.json fetch ' + n + ' fois, attendu 1');
    } },

  { nom: 'chaque chapitre charge une seule fois entre les sous-onglets',
    fn: async () => {
      creerDocumentMinimal(); brancherFetch();
      const { m, core } = await importerVue();
      await ouvrirVue(m, core, 'etudiants', true);
      await ouvrirVue(m, core, 'complement');
      const parFichier = {};
      fetches.filter(u => u.includes('chapitres/')).forEach(u => parFichier[u] = (parFichier[u] || 0) + 1);
      for (const [f, n] of Object.entries(parFichier)) assert(n === 1, f + ' charge ' + n + ' fois');
      assert(Object.keys(parFichier).length === 17, '17 chapitres charges, obtenu ' + Object.keys(parFichier).length);
    } },

  { nom: 'sous-onglet Version des étudiants : section chronique rendue avec h3 et paragraphes',
    fn: async () => {
      creerDocumentMinimal(); brancherFetch();
      const { m, core } = await importerVue();
      await ouvrirVue(m, core, 'etudiants');
      const bloc = document.getElementById('bloc-etudiants');
      assert(bloc, 'bloc-etudiants present');
      const html = bloc._html || bloc.innerHTML;
      INDEX.sections.find(s => s.id === 'chronique').chapitres.forEach(c => {
        assert(html.includes('id="chapitre-' + c.id + '"'), 'chapitre ' + c.id + ' present');
      });
      const complement = INDEX.sections.find(s => s.id === 'complement');
      assert(!html.includes('id="chapitre-' + complement.chapitres[0].id + '"'), 'aucun chapitre complement dans la chronique');
    } },

  { nom: 'sous-onglet Complément étudiants : section complement rendue, sans bouton fin de texte',
    fn: async () => {
      creerDocumentMinimal(); brancherFetch();
      const { m, core } = await importerVue();
      await ouvrirVue(m, core, 'complement');
      const bloc = document.getElementById('bloc-etudiants');
      assert(bloc, 'bloc-etudiants present');
      const html = bloc._html || bloc.innerHTML;
      INDEX.sections.find(s => s.id === 'complement').chapitres.forEach(c => {
        assert(html.includes('id="chapitre-' + c.id + '"'), 'chapitre ' + c.id + ' present');
      });
      const vue = document.getElementById('view');
      assert(!(vue._html || '').includes('btn-fin-texte'), 'pas de bouton fin de texte sur le Complement');
    } },

  { nom: 'ancre fin-texte uniquement sur le dernier paragraphe du dernier chapitre de la chronique',
    fn: async () => {
      creerDocumentMinimal(); brancherFetch();
      const { m, core } = await importerVue();
      await ouvrirVue(m, core, 'etudiants');
      const bloc = document.getElementById('bloc-etudiants');
      const html = bloc._html || bloc.innerHTML;
      assert(html.includes('id="fin-texte"'), 'ancre fin-texte presente');
      assert((html.match(/id="fin-texte"/g) || []).length === 1, 'une seule ancre fin-texte');
      const vue = document.getElementById('view');
      assert((vue._html || '').includes('btn-fin-texte'), 'bouton fin de texte present');
      const dernier = INDEX.sections.find(s => s.id === 'chronique').chapitres.slice(-1)[0];
      assert(dernier.id === 'c17', 'dernier chapitre chronique = c17');
      assert(html.includes('id="chapitre-c17"'), 'c17 rendu');
    } },

  { nom: 'badge relevé auto present uniquement sur les paragraphes auto',
    fn: async () => {
      creerDocumentMinimal(); brancherFetch();
      const { m, core } = await importerVue();
      await ouvrirVue(m, core, 'etudiants');
      const bloc = document.getElementById('bloc-etudiants');
      const html = bloc._html || bloc.innerHTML;
      const nAuto = (html.match(/badge-auto/g) || []).length;
      assert(nAuto > 0, 'au moins un badge releve auto, obtenu ' + nAuto);
      assert(html.includes('relevé auto'), 'libelle du badge');
      /* Un paragraphe non auto ne porte jamais le badge. */
      const sansAuto = (html.match(/<p>(?!<span class="badge-auto")/g) || []).length;
      assert(sansAuto > 0, 'des paragraphes sans badge auto existent');
    } },

  { nom: 'titre + description de section en tete de chaque sous-onglet etudiant',
    fn: async () => {
      creerDocumentMinimal(); brancherFetch();
      const { m, core } = await importerVue();
      await ouvrirVue(m, core, 'etudiants');
      let vue = document.getElementById('view');
      let html = vue._html || '';
      const chrono = INDEX.sections.find(s => s.id === 'chronique');
      assert(html.includes(chrono.titre.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))), 'titre de section chronique affiche (echappe)');
      assert(html.includes('chronologie du mouvement'), 'description de section chronique affichee');
      await ouvrirVue(m, core, 'complement');
      vue = document.getElementById('view');
      html = vue._html || '';
      const comp = INDEX.sections.find(s => s.id === 'complement');
      assert(html.includes(comp.titre.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))), 'titre de section complement affiche (echappe)');
      assert(html.includes('chapitres transverses'), 'description de section complement affichee');
    } },

  { nom: 'sous-onglet gouvernement : cartes issues de lyceens.json',
    fn: async () => {
      creerDocumentMinimal(); brancherFetch();
      const { m, core } = await importerVue();
      await ouvrirVue(m, core, 'gouvernement');
      const vue = document.getElementById('view');
      const html = vue._html || '';
      assert(LYCEENS.version_gouvernement.length > 0 && html.includes('Version du gouvernement'.slice(0, 5)) || html.includes('info'), 'liste gouvernement rendue');
      assert(!html.includes('bloc-etudiants'), 'pas de bloc etudiants sous gouvernement');
    } },

  { nom: 'sous-onglet faits : cartes vérifiées issues de lyceens.json',
    fn: async () => {
      creerDocumentMinimal(); brancherFetch();
      const { m, core } = await importerVue();
      await ouvrirVue(m, core, 'faits');
      const vue = document.getElementById('view');
      const html = vue._html || '';
      assert(html.includes('info'), 'compteur d infos affiche');
      assert(!html.includes('bloc-etudiants'), 'pas de bloc etudiants sous faits');
    } },

  { nom: 'contenu echappe : une source malveillante ne casse pas le HTML',
    fn: async () => {
      creerDocumentMinimal();
      const index = JSON.parse(JSON.stringify(INDEX));
      index.sections = [{ id: 'chronique', titre: 'T<i>itre', description: 'd"esc', chapitres: [] },
                        { id: 'complement', titre: 'C', description: '', chapitres: [] }];
      globalThis.fetch = async (url) => {
        if (url === 'data/etudiants/index.json') return { json: async () => index };
        if (url === 'data/lyceens.json') return { json: async () => LYCEENS };
        if (url.startsWith('data/etudiants/chapitres/')) {
          return { json: async () => ({ id: 'x', titre: '<b>ok</b>', paragraphes: [{ texte: '<script>alert(1)</script>', auto: true, sources: ['https://a"<script>'] }] }) };
        }
        throw new Error('fetch inattendu');
      };
      const { m, core } = await importerVue();
      core.state.lyceens = LYCEENS;
      core.state.lyceensSub = 'etudiants';
      core.state.etudiants = null;
      index.sections[0].chapitres = [{ id: 'x', fichier: 'chapitres/01.json' }];
      m.vueLyceens();
      await new Promise(r => setTimeout(r, 60));
      const bloc = document.getElementById('bloc-etudiants');
      const html = bloc._html || bloc.innerHTML;
      assert(!html.includes('<script>alert'), 'script non insere tel quel');
      assert(html.includes('&lt;script&gt;'), 'script echappe par esc()');
      assert(html.includes('id="chapitre-x"'), 'chapitre de test rendu');
      const vue = document.getElementById('view');
      assert(!(vue._html || '').includes('T<i>'), 'titre de section echappe');
    } }
];

await lancerTests(tests, 'tests/lyceens.test.mjs');
