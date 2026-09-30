#!/usr/bin/env node
/* validate-latest.js — Valide l'édition la plus récente du dépôt (latest.json), puis toutes les éditions du jour de la semaine en cours.
 * Usage : node tools/validate-latest.js
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

if (!fs.existsSync('editions/latest.json')) {
  console.error('editions/latest.json introuvable — exécuter depuis la racine du dépôt.');
  process.exit(2);
}
const idx = JSON.parse(fs.readFileSync('editions/latest.json', 'utf8'));
const editions = idx.editions || [];
if (!editions.length) {
  console.error('Aucune édition dans latest.json.');
  process.exit(1);
}

// Le format à 11 chapitres (Russie incluse) a été finalisé le 28/09/2026 ; le format à
// 13 chapitres (+ economie-pour-les-nuls, droit-pour-les-nuls, section « Hors des chapitres »)
// s'applique à l'édition du 29/09/2026 ; le format à 14 chapitres (+ spatial après l'IA)
// s'applique aux éditions du 30/09/2026 ou après (règles du 30/09/2026). Les éditions
// antérieures sont historiques (ancien ordre, ancien schéma) : on ne les rétrofit pas,
// on ne les fait pas échouer la CI non plus. Les trois formats cohabitent ici.
const A_PARTIR_DE = '2026-09-28';
const aValider = editions.slice(0, 3).filter((e) => e.date >= A_PARTIR_DE);
if (!aValider.length) {
  console.log('Aucune édition récente au format actuel à valider.');
  process.exit(0);
}

let echecs = 0;
for (const e of aValider) {
  const jsonPath = e.fichier;
  const htmlPath = e.html || jsonPath.replace(/\.json$/, '.html');
  console.log(`\n——— Édition ${e.date} ———`);
  try {
    execFileSync(process.execPath, ['tools/validate-edition.js', jsonPath, htmlPath], { stdio: 'inherit' });
  } catch {
    echecs++;
  }
}
if (echecs) {
  console.error(`\n${echecs} édition(s) non conforme(s).`);
  process.exit(1);
}
console.log('\nToutes les éditions récentes sont conformes. 🌱');
