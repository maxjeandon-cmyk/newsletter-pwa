#!/usr/bin/env node
/* validate-edition.js — Relecture complète et systématique d'une édition de la newsletter.
 * Implémente les règles de relecture du format (format.md, règle du 28/09/2026, étendues le 30/09/2026).
 *
 * Date-aware (30/09/2026, trois formats cohabitent) :
 *   - éditions datées du 30/09/2026 ou après : 14 chapitres (le chapitre Spatial est inséré
 *     juste après l'IA), section « Hors des chapitres » obligatoire (10 à 12 infos), h2 >= 18 ;
 *   - édition du 29/09/2026 : format à 13 chapitres (+ economie-pour-les-nuls, droit-pour-les-nuls),
 *     section « Hors des chapitres » obligatoire, h2 >= 17 ;
 *   - éditions du 27-28/09/2026 : format historique à 11 chapitres, h2 >= 14.
 *
 * Usage :
 *   node tools/validate-edition.js <edition.json> [edition.html]
 *   node tools/validate-edition.js editions/2026-09-29.json editions/2026-09-29.html
 *
 * Codes de sortie : 0 = tous les contrôles passés, 1 = au moins un échec/bloquant, 2 = erreur d'usage.
 */
'use strict';

const fs = require('fs');

// Format à 14 chapitres (règle du 30/09/2026 au soir, première édition : 30/09/2026)
const FORMAT_14_A_PARTIR_DE = '2026-09-30';
// Chapitres deroulants (regle du 06/10/2026, premiere edition : 06/10/2026) :
// chaque chapitre + la section « Hors des chapitres » vivent dans un
// <details open id="c-…"> avec <summary> et bouton de partage (btn-partage,
// data-id/data-titre/data-resume). Les h2 restent pour : resume executif,
// Notes de sources, Questions ouvertes.
const DEROULANT_A_PARTIR_DE = '2026-10-06';
// Format à 13 chapitres (règle du 30/09/2026 au matin, seule édition concernée : 29/09/2026)
const FORMAT_13_A_PARTIR_DE = '2026-09-29';

const ORDRE_CHAPITRES_14 = [
  'intelligence-artificielle',
  'spatial',
  'economie-pour-les-nuls',
  'droit-pour-les-nuls',
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

// Format à 13 chapitres (29/09/2026)
const ORDRE_CHAPITRES_13 = [
  'intelligence-artificielle',
  'economie-pour-les-nuls',
  'droit-pour-les-nuls',
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

// Format historique à 11 chapitres (27-28/09/2026)
const ORDRE_CHAPITRES_11 = [
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

function formatDe(date) {
  const d = String(date || '');
  if (d >= FORMAT_14_A_PARTIR_DE) return 14;
  if (d >= FORMAT_13_A_PARTIR_DE) return 13;
  return 11;
}

const results = [];
function check(bloc, nom, ok, detail) {
  results.push({ bloc, nom, ok: !!ok, detail: detail || '' });
}

function validateHtml(html, fmt, v15) {
  const cnt = (s) => html.split(s).length - 1;
  const detailFmt = v15
    ? 'résumé + hors chapitres + 14 chapitres déroulants + notes + questions'
    : fmt === 14
    ? 'résumé + hors chapitres + 14 chapitres + notes + questions'
    : fmt === 13 ? 'résumé + hors chapitres + 13 chapitres + notes + questions'
    : 'résumé + 11 chapitres + notes + questions';
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
  const minH2 = v15 ? 3 : fmt === 14 ? 18 : fmt === 13 ? 17 : 14;
  check('HTML', `sections h2 >= ${minH2} (${detailFmt})`, nbH2 >= minH2, `trouvé(s)=${nbH2}`);
  if (fmt >= 13) {
    check('HTML', 'section « Hors des chapitres »', html.includes('Hors des chapitres'));
  }
  if (v15) {
    /* Structure déroulante (règle du 06/10/2026) : 14 chapitres + hors chapitres
     * en <details open id="c-…">, summary, bouton de partage complet. */
    const ids = [...ORDRE_CHAPITRES_14, 'hors-chapitres'];
    check('HTML', 'chapitres déroulants <details open> (15)', cnt('<details open') >= 15, `trouvé(s)=${cnt('<details open')}`);
    check('HTML', '<summary> pour chaque bloc déroulant', cnt('<summary') >= 15, `trouvé(s)=${cnt('<summary')}`);
    for (const id of ids) {
      check('HTML', `ancre déroulante id="c-${id}"`, html.includes(`id="c-${id}"`));
    }
    check('HTML', 'bouton de partage par chapitre (15)', cnt('class="btn-partage"') >= 15, `trouvé(s)=${cnt('class="btn-partage"')}`);
    check('HTML', 'boutons avec data-titre', cnt('data-titre=') >= 15, `trouvé(s)=${cnt('data-titre=')}`);
    check('HTML', 'boutons avec data-resume', cnt('data-resume=') >= 15, `trouvé(s)=${cnt('data-resume=')}`);
    check('HTML', '<script> de partage équilibré', cnt('<script>') === 1 && cnt('</script>') === 1);
  }
}

function validateJson(j) {
  const fmt = formatDe(j.date);
  const ordre = fmt === 14 ? ORDRE_CHAPITRES_14 : fmt === 13 ? ORDRE_CHAPITRES_13 : ORDRE_CHAPITRES_11;

  check('JSON', 'champ date (YYYY-MM-DD)', /^\d{4}-\d{2}-\d{2}$/.test(j.date || ''), j.date || '');
  check('JSON', 'champ genere_le (ISO)', typeof j.genere_le === 'string' && !isNaN(Date.parse(j.genere_le)), j.genere_le || '');
  check('JSON', 'champ html (chemin .html)', typeof j.html === 'string' && j.html.endsWith('.html'), j.html || '');

  const points = j.resume_executif || [];
  check('JSON', 'résumé exécutif en 5 points', Array.isArray(points) && points.length === 5, `points=${points.length}`);
  check('JSON', 'points sans « : : » doublé', points.every((p) => !/: {2,}:|::/.test(String(p).replace(/\s/g, '')) && !p.includes(' : :')));

  const chaps = j.chapitres || [];
  check('JSON', `${fmt} chapitres`, chaps.length === fmt, `chapitres=${chaps.length}`);
  check('JSON', 'ordre des chapitres imposé',
    chaps.length === fmt && ordre.every((id, i) => chaps[i] && chaps[i].id === id),
    chaps.map((c) => c.id).join(', '));
  check('JSON', 'chaque chapitre a id/emoji/nom/resume',
    chaps.every((c) => c && c.id && c.emoji && c.nom && typeof c.resume === 'string' && c.resume.length > 30));

  if (fmt >= 13) {
    const hors = j.hors_chapitres;
    check('JSON', 'hors_chapitres (10 à 12 infos hors chapitres)',
      Array.isArray(hors) && hors.length >= 10 && hors.length <= 12 && hors.every((h) => typeof h === 'string' && h.trim().length > 10),
      `infos=${Array.isArray(hors) ? hors.length : 0}`);
  }

  const sources = j.sources || [];
  check('JSON', 'sources présentes', sources.length > 0, `sources=${sources.length}`);
  check('JSON', 'fiabilités entre 1 et 5', sources.every((s) => Number.isInteger(s.fiabilite) && s.fiabilite >= 1 && s.fiabilite <= 5));
  check('JSON', 'chaque source a label/fiabilite/maj', sources.every((s) => s.label && s.maj && s.fiabilite));
  check('JSON', 'dates maj au format JJ/MM/AAAA', sources.every((s) => /^\d{2}\/\d{2}\/\d{4}$/.test(s.maj || '')));
  return fmt;
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
  let fmt = formatDe(j && j.date);
  if (j) fmt = validateJson(j) || fmt;

  const htmlCandidate = htmlPath || (j && j.html ? j.html.replace(/^editions\//, 'editions/') : null);
  if (htmlCandidate) {
    try {
      // Décodage des entités numériques (&#233; etc.) : les éditions sont publiées en ASCII pur
      // (contournement de la corruption de transport des charges non-ASCII > ~32 Ko, règle du 29/09/2026).
      const html = fs.readFileSync(htmlCandidate, 'utf8').replace(/&#(\d+);/g, (m, n) => String.fromCodePoint(parseInt(n, 10)));
      check('HTML', 'fichier lisible', true);
      const v15 = !!(j && j.date >= DEROULANT_A_PARTIR_DE);
      validateHtml(html, fmt, v15);
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
  console.log(`\n${results.length - echecs.length}/${results.length} contrôles passés (format ${fmt} chapitres)`);
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
