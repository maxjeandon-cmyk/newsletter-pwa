#!/usr/bin/env node
/* tools/test/pastille-medias.js — harnas de la pastille « ✓ N médias » cliquable (CACHE v114).
 * Vérifie, hors ligne (aucune dépendance, aucun réseau) :
 *   1. compterMedias (js/feeds.js v18) pose sourcesMedias = [{nom, lien}] trié
 *      alphabétiquement sur les événements corroborés — liens exacts, union-find intact ;
 *   2. articleHtml (js/views/common.js v18) produit la carte <div class="article">
 *      avec voile étiré, bouton pastille, liste dépliable — esc()/urlSure() partout ;
 *   3. la délégation globale de dépliage est posée au chargement et bascule
 *      hidden/aria-expanded/état .ouvert ;
 *   4. démarrage à froid : les modules s'importent avec un DOM factice
 *      (querySelectorAll -> [] pour ne pas polluer le wiring).
 * Usage : node tools/test/pastille-medias.js (depuis la racine du dépôt). */
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
globalThis.document = {
  addEventListener: (type, f) => ecouteursDocument.push({ type, f }),
  querySelector: () => null,
  querySelectorAll: () => [], /* piège connu : jamais tous les éléments */
  documentElement: { dataset: {}, style: { setProperty: () => {} } }
};
globalThis.window = globalThis;
globalThis.location = { href: 'https://diyeah24.fr/#articles', origin: 'https://diyeah24.fr', pathname: '/' };
globalThis.history = { pushState: () => {}, replaceState: () => {} };
globalThis.matchMedia = () => ({ matches: false });
globalThis.addEventListener = () => {};

/* --- Copie des modules ES en bac à sable "type":"module" --- */
const bac = fs.mkdtempSync(path.join(require('os').tmpdir(), 'pastille-'));
fs.writeFileSync(path.join(bac, 'package.json'), '{"type":"module"}');
for (const f of ['core.js', 'feeds.js', 'router.js', 'onglets.js']) {
  fs.copyFileSync(path.join(RACINE, 'js', f), path.join(bac, f));
}
fs.mkdirSync(path.join(bac, 'views'));
fs.copyFileSync(path.join(RACINE, 'js', 'views', 'common.js'), path.join(bac, 'views', 'common.js'));

async function main() {
  /* --- Syntaxe ES modules : node --check via copie .mjs (leçon v65) --- */
  for (const f of ['js/feeds.js', 'js/views/common.js']) {
    const dst = path.join(bac, path.basename(f).replace(/\.js$/, '.mjs'));
    fs.copyFileSync(path.join(RACINE, f), dst);
    execFileSync('node', ['--check', dst], { stdio: 'pipe' });
  }
  check('syntaxe ES modules (node --check .mjs) : feeds.js et common.js', true);

  /* --- Import réel des modules (démarrage à froid sur DOM factice) --- */
  const feeds = await import(pathToFileURL(path.join(bac, 'feeds.js')).href);
  const common = await import(pathToFileURL(path.join(bac, 'views', 'common.js')).href);
  check('import des modules sans crash (DEMARRAGE_OK)', !!feeds.compterMedias && !!common.articleHtml);

  /* --- 1. compterMedias : {média → lien} par événement corroboré --- */
  const art = (titre, lien) => ({ titre, lien, date: new Date() });
  const a1 = art('Lycées : 488 interpellations dans toute la France', 'https://a.fr/1');
  const a2 = art('Lycée : 488 interpellations dans toute la France selon la police', 'https://b.fr/2');
  const b1 = art('Un tout autre sujet sur les légumes du marché', 'https://c.fr/3');
  feeds.compterMedias([
    { a: a1, source: 'Média B' },
    { a: a2, source: 'Média A' },
    { a: b1, source: 'Média C' }
  ]);
  check('corroboration : nbMedias = 2 sur les deux articles du même événement', a1.nbMedias === 2 && a2.nbMedias === 2);
  check('sourcesMedias posé, tri alphabétique fr', Array.isArray(a1.sourcesMedias)
    && a1.sourcesMedias.length === 2
    && a1.sourcesMedias[0].nom === 'Média A' && a1.sourcesMedias[1].nom === 'Média B');
  check('liens exacts conservés par média (Média A → son article, Média B → le sien)',
    a1.sourcesMedias[0].lien === 'https://b.fr/2' && a1.sourcesMedias[1].lien === 'https://a.fr/1'
    && a2.sourcesMedias[0].lien === 'https://b.fr/2' && a2.sourcesMedias[1].lien === 'https://a.fr/1');
  check('événement seul : nbMedias = 1, PAS de sourcesMedias', b1.nbMedias === 1 && b1.sourcesMedias === undefined);

  /* le lien le plus récent d'un média gagne (2 bruts du même média) */
  const c1 = art('Nouvelle péripétie du blocus national dans les lycées', 'https://a.fr/vieux');
  const c2 = art('Nouvelle péripétie du blocus national dans les lycées bis', 'https://a.fr/neuf');
  const d1 = art('Nouvelle péripétie du blocus national dans les lycées ter', 'https://x.fr/autre');
  feeds.compterMedias([
    { a: c1, source: 'Média A' },
    { a: c2, source: 'Média A' },
    { a: d1, source: 'Média X' }
  ]);
  const liens = d1.sourcesMedias.map(s => s.nom + '>' + s.lien).sort();
  check('même média en double : un seul représentant, lien le plus récent',
    d1.nbMedias === 2 && liens.length === 2 && liens.includes('Média A>https://a.fr/neuf'));

  /* --- 2. articleHtml : structure v114 + hygiène esc()/urlSure() --- */
  const aMulti = {
    titre: 'Titre <b>injection</b> "directe"',
    lien: 'https://a.fr/1',
    date: new Date(),
    chapitreNom: 'Chapitre <test>',
    extrait: 'Extrait avec <script>alert(1)</script>',
    nbMedias: 2,
    sourcesMedias: [
      { nom: 'Média <A>', lien: 'https://a.fr/1' },
      { nom: 'Média B', lien: 'javascript:alert(1)' }
    ]
  };
  const html = common.articleHtml(aMulti);
  check('carte = <div class="article"> (plus un <a>)', html.startsWith('<div class="article">') && html.endsWith('</div>'));
  check('voile étiré : lien principal avec href exact et aria-label', html.includes('<a class="article-voile" href="https://a.fr/1" target="_blank" rel="noopener" aria-label="Titre &lt;b&gt;injection&lt;/b&gt; &quot;directe&quot;"></a>'));
  check('titre échappé (esc)', html.includes('<h3>Titre &lt;b&gt;injection&lt;/b&gt; &quot;directe&quot;</h3>'));
  check('origine échappée (esc)', html.includes('Chapitre &lt;test&gt;'));
  check('extrait échappé (esc)', !html.includes('<script>alert(1)</script>'));
  check('pastille = bouton dépliable avec flèche', html.includes('<button type="button" class="badge-medias" aria-expanded="false">✓ 2 médias ▾</button>'));
  check('liste présente mais masquée par défaut', html.includes('<div class="medias-liste" hidden>'));
  check('deux liens de médias dans la liste', (html.match(/medias-liste[\s\S]*?<\/div>/) || [''])[0].split('<a href=').length === 3);
  check('lien javascript: neutralisé par urlSure', html.includes('href="#"'));
  check('nom de média échappé (esc)', html.includes('>Média &lt;A&gt;</a>'));

  const aSolo = { titre: 'Article seul', lien: 'https://x.fr/', date: new Date() };
  const hSolo = common.articleHtml(aSolo);
  check('sans corroboration : ni pastille ni liste, voile présent', !hSolo.includes('badge-medias') && !hSolo.includes('medias-liste') && hSolo.includes('article-voile'));

  /* vieux cache v105 : nbMedias sans sourcesMedias → gracieux */
  const aVieux = { titre: 'Vieux cache v105', lien: 'https://y.fr/', date: new Date(), nbMedias: 3 };
  const hVieux = common.articleHtml(aVieux);
  check('cache v105 sans sourcesMedias : pastille sans flèche, pas de liste, pas de crash',
    hVieux.includes('✓ 3 médias</button>') && !hVieux.includes('medias-liste'));

  /* --- 3. Délégation globale de dépliage --- */
  /* v115 : common.js pose DEUX délégations click (badge-medias v114 + btn-replier v115). */
  const pose = ecouteursDocument.filter(e => e.type === 'click');
  check('écouteurs click globaux posés au chargement (délégations pastille v114 + replier v115)', pose.length === 2);
  let cache = true, aria = 'false', classeOuvert = false;
  const fauxBtn = {
    classList: { toggle: (c, v) => { classeOuvert = v; } },
    setAttribute: (k, v) => { if (k === 'aria-expanded') aria = v; },
    closest: sel => (sel === '.article' ? fauxCarte : null)
  };
  const fauxListe = { get hidden() { return cache; }, set hidden(v) { cache = v; } };
  const fauxCarte = { querySelector: s => (s === '.medias-liste' ? fauxListe : null) };
  const clic = { target: { closest: sel => (sel === '.badge-medias' ? fauxBtn : sel === '.article' ? fauxCarte : null) } };
  pose[0].f(clic);
  check('premier clic : liste dépliée, aria-expanded=true, état .ouvert', cache === false && aria === 'true' && classeOuvert === true);
  pose[0].f(clic);
  check('second clic : liste repliée, aria-expanded=false', cache === true && aria === 'false' && classeOuvert === false);
  /* clic ailleurs (pas sur la pastille) : rien ne bouge */
  pose[0].f({ target: { closest: () => null } });
  check('clic hors pastille : aucun effet', cache === true && aria === 'false');
  /* bouton sans liste (cache v105) : pas de crash */
  const fauxBtnSeul = { classList: { toggle: () => {} }, setAttribute: () => {}, closest: () => null };
  pose[0].f({ target: { closest: sel => (sel === '.badge-medias' ? fauxBtnSeul : null) } });
  check('pastille sans liste (cache v105) : pas de crash', true);

  /* --- 4. Régression : générationTime et registre de vues intacts --- */
  check('generationTime() exporté et fonctionnel', typeof common.generationTime === 'function' && Number.isFinite(common.generationTime()));
  common.enregistrerVue('edition', () => {});
  check('registre des vues intact (enregistrerVue sans erreur)', true);

  console.log('Pastille v114 : ' + passes + ' test(s) vert(s), ' + echecs + ' échec(s)');
  process.exit(echecs ? 1 : 0);
}

main().catch(e => { console.error('HARNAS PLANTÉ :', e); process.exit(1); });
