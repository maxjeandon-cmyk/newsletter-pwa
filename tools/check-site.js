#!/usr/bin/env node
/* check-site.js — Vérifie que le site public sert bien l'édition attendue.
 * Usage : node tools/check-site.js [date-attendue YYYY-MM-DD]  (défaut : édition la plus récente)
 */
'use strict';

const BASE = 'https://maxjeandon-cmyk.github.io/newsletter-pwa/';
const RAW = 'https://raw.githubusercontent.com/maxjeandon-cmyk/newsletter-pwa/main/';

async function get(url) {
  const r = await fetch(url, { cache: 'no-store' });
  if (!r.ok) throw new Error(`HTTP ${r.status} sur ${url}`);
  return r.text();
}

async function main() {
  const attendu = process.argv[2] || null;
  const problems = [];
  const infos = [];

  // 1. latest.json
  const idx = JSON.parse(await get(RAW + 'editions/latest.json'));
  const plusRecente = idx.editions[0];
  infos.push(`latest.json : ${idx.editions.length} édition(s), plus récente ${plusRecente.date}`);
  const cible = attendu || plusRecente.date;
  const entree = idx.editions.find((e) => e.date === cible);
  if (!entree) problems.push(`Édition ${cible} absente de latest.json`);

  // 2. fichiers de l'édition cible
  if (entree) {
    const j = JSON.parse(await get(RAW + entree.fichier));
    if (j.date !== cible) problems.push(`Date incohérente dans ${entree.fichier} : ${j.date}`);
    const html = await get(RAW + j.html);
    if (html.split('<style>').length !== 2 || html.split('</style>').length !== 2)
      problems.push(`Balises <style> incorrectes dans ${j.html}`);
    if (!html.trimEnd().endsWith('</html>')) problems.push(`${j.html} incomplet (pas de </html>)`);
    infos.push(`édition ${cible} : JSON OK, HTML ${html.length} octets, structure OK`);
  }

  // 3. site public joignable
  try {
    const site = await get(BASE);
    infos.push(`site public joignable (${site.length} octets)`);
  } catch (e) {
    problems.push('Site public inaccessible : ' + e.message);
  }

  console.log('=== check-site ===');
  infos.forEach((i) => console.log('ℹ️  ' + i));
  problems.forEach((p) => console.log('❌ ' + p));
  if (problems.length) { console.log(`\n${problems.length} problème(s) — publication à corriger.`); process.exit(1); }
  console.log('\nSite et édition conformes. 🌱');
}

main().catch((e) => { console.error('ERREUR :', e.message); process.exit(1); });
