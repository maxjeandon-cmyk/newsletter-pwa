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

let echecs = 0;
for (const e of editions.slice(0, 3)) {
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
