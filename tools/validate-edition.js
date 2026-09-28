#!/usr/bin/env node
/* validate-edition.js — Relecture complète et systématique d'une édition de la newsletter.
 * Implémente les règles de relecture du format (format.md, règle du 28/09/2026).
 *
 * Usage :
 *   node tools/validate-edition.js <edition.json> [edition.html]
 *   node tools/validate-edition.js editions/2026-09-28.json editions/2026-09-28.html
 *
 * Codes de sortie : 0 = tous les contrôles passés, 1 = au moins un échec/bloquant, 2 = erreur d'usage.
 */
'use strict';

const fs = require('fs');

const ORDRE_CHAPITRES = [
  'intelligence-artificielle',
  'jeu-video-pop-culture',
  'culture',
  'sciences',
  'climat',
  'politique-francaise',
  'etats-unis',
  'chine',
  'russie',
  'geopolitique',
  'grande-info-semaine',
];

const results = [];
function check(bloc, nom, ok, detail) {
  results.push({ bloc, nom, ok: !!ok, detail: detail || '' });
}

function validateHtml(html) {
  const cnt = (s) => html.split(s).length - 1;
  check('HTML', '<style> équilibré', cnt('<style>') === 1 && cnt('</style>') === 1,
    `ouvrant(s)=${cnt('<style>')} fermant(s)=${cnt('</style>')}`);
  check('HTML', '<head> équilibré', cnt('<head>') === 1 && cnt('</head>') === 1);
  check('HTML', '<body> équilibré', cnt('<body>') === 1 && cnt('</body>') === 1);
  check('HTML', 'document complet (</html> final)', html.trimEnd().endsWith('</html>'));
  check('HTML', 'palette dark (#0e0e12)', html.includes('#0e0e12'));
  check('HTML', 'aucun lien interne non neutralisé', (html.match(/<a href="[^h]/g) || []).length === 0);
  check('HTML', 'section Résumé exécutif', html.includes('sumé exécutif') || html.includes('Résumé exécutif'));
  check('HTML', 'section Notes de sources', html.includes('Notes de sources'));
  check('HTML', 'section Questions ouvertes', html.includes('Questions ouvertes'));
  const nbH2 = cnt('<h2>');
  check('HTML', 'sections h2 >= 14 (résumé + 11 chapitres + notes + questions)', nbH2 >= 14, `trouvé(s)=${nbH2}`);
}

function validateJson(j) {
  check('JSON', 'champ date (YYYY-MM-DD)', /^\d{4}-\d{2}-\d{2}$/.test(j.date || ''), j.date || '');
  check('JSON', 'champ genere_le (ISO)', typeof j.genere_le === 'string' && !isNaN(Date.parse(j.genere_le)), j.genere_le || '');
  check('JSON', 'champ html (chemin .html)', typeof j.html === 'string' && j.html.endsWith('.html'), j.html || '');

  const points = j.resume_executif || [];
  check('JSON', 'résumé exécutif en 5 points', Array.isArray(points) && points.length === 5, `points=${points.length}`);
  check('JSON', 'points sans « : : » doublé', points.every((p) => !/: {2,}:|::/.test(String(p).replace(/\s/g, '')) && !p.includes(' : :')));

  const chaps = j.chapitres || [];
  check('JSON', '11 chapitres', chaps.length === 11, `chapitres=${chaps.length}`);
  check('JSON', 'ordre des chapitres imposé',
    chaps.length === 11 && ORDRE_CHAPITRES.every((id, i) => chaps[i] && chaps[i].id === id),
    chaps.map((c) => c.id).join(', '));
  check('JSON', 'chaque chapitre a id/emoji/nom/resume',
    chaps.every((c) => c && c.id && c.emoji && c.nom && typeof c.resume === 'string' && c.resume.length > 30));

  const sources = j.sources || [];
  check('JSON', 'sources présentes', sources.length > 0, `sources=${sources.length}`);
  check('JSON', 'fiabilités entre 1 et 5', sources.every((s) => Number.isInteger(s.fiabilite) && s.fiabilite >= 1 && s.fiabilite <= 5));
  check('JSON', 'chaque source a label/fiabilite/maj', sources.every((s) => s.label && s.maj && s.fiabilite));
  check('JSON', 'dates maj au format JJ/MM/AAAA', sources.every((s) => /^\d{2}\/\d{2}\/\d{4}$/.test(s.maj || '')));
}

function main() {
  const [jsonPath, htmlPath] = process.argv.slice(2);
  if (!jsonPath) {
    console.error('Usage: node tools/validate-edition.js <edition.json> [edition.html]');
    process.exit(2);
  }

  let j = null;
  try {
    j = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
    check('JSON', 'JSON.parse valide', true);
  } catch (e) {
    check('JSON', 'JSON.parse valide', false, String(e).slice(0, 120));
  }
  if (j) validateJson(j);

  const htmlCandidate = htmlPath || (j && j.html ? j.html.replace(/^editions\//, 'editions/') : null);
  if (htmlCandidate) {
    try {
      // Décodage des entités numériques (&#233; etc.) : les éditions sont publiées en ASCII pur
      // (contournement de la corruption de transport des charges non-ASCII > ~32 Ko, règle du 29/09/2026).
      const html = fs.readFileSync(htmlCandidate, 'utf8').replace(/&#(\d+);/g, (m, n) => String.fromCodePoint(parseInt(n, 10)));
      check('HTML', 'fichier lisible', true);
      validateHtml(html);
      if (j) check('Cohérence', 'date dans le HTML', html.includes(fmtFR(j.date)),
        `recherche de « ${fmtFR(j.date)} »`);
    } catch (e) {
      check('HTML', 'fichier lisible', false, String(e).slice(0, 120));
    }
  }

  const blocs = ['JSON', 'HTML', 'Cohérence'];
  console.log('=== Relecture systématique de l\'édition ===');
  for (const b of blocs) {
    const rs = results.filter((r) => r.bloc === b);
    if (!rs.length) continue;
    console.log('\n[' + b + ']');
    for (const r of rs) console.log(`  ${r.ok ? '✅' : '❌'} ${r.nom}${r.detail ? ' — ' + r.detail : ''}`);
  }
  const echecs = results.filter((r) => !r.ok);
  console.log(`\n${results.length - echecs.length}/${results.length} contrôles passés`);
  if (echecs.length) {
    console.log('ÉCHECS BLOQUANTS — ne pas valider la publication.');
    process.exit(1);
  }
  console.log('Édition conforme — publication validée. 🌱');
}

function fmtFR(iso) {
  if (!iso) return '';
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

main();
